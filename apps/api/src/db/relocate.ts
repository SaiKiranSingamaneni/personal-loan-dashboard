import { createConnection } from "node:net";
import { existsSync, linkSync, rmSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { ensureDatabaseDirectories, listLegacyDatabaseCandidates, resolveDatabasePaths, rowCounts } from "./paths.js";

function apiIsListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (listening: boolean): void => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export interface RelocateOptions {
  legacyCandidates?: string[];
  assertApiStopped?: () => Promise<void>;
}

export async function relocateDatabase(
  paths = resolveDatabasePaths(),
  options: RelocateOptions = {},
): Promise<{ source: string; destination: string; counts: Record<string, number> } | null> {
  const assertStopped = options.assertApiStopped ?? (async () => {
    const port = Number(process.env.PORT ?? 3001);
    if (await apiIsListening(port)) throw new Error(`API is running on 127.0.0.1:${port}. Stop it before relocating the database.`);
  });
  await assertStopped();
  ensureDatabaseDirectories(paths);
  if (existsSync(paths.databasePath)) {
    throw new Error(`Destination already exists: ${paths.databasePath}. Relocation will not overwrite it.`);
  }
  const candidates = options.legacyCandidates ?? listLegacyDatabaseCandidates(paths);
  if (candidates.length === 0) {
    process.stdout.write("No legacy database found. Nothing was relocated.\n");
    return null;
  }
  if (candidates.length > 1) {
    throw new Error(`Multiple legacy databases found (${candidates.join(", ")}). Relocate one explicitly; none were changed.`);
  }

  const source = candidates[0]!;
  const temporary = join(paths.dataDirectory, `.${basename(paths.databasePath)}.relocating-${process.pid}-${Date.now()}`);
  const sourceDatabase = new Database(source);
  try {
    const checkpoint = sourceDatabase.pragma("wal_checkpoint(TRUNCATE)") as { busy?: number }[];
    if ((checkpoint[0]?.busy ?? 0) !== 0) throw new Error(`Could not checkpoint legacy database WAL: ${source}`);
    const sourceCounts = rowCounts(source);
    await sourceDatabase.backup(temporary);
    const snapshot = new Database(temporary, { readonly: true, fileMustExist: true });
    try {
      const integrity = snapshot.pragma("integrity_check") as { integrity_check: string }[];
      if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
        throw new Error(`Relocated snapshot failed integrity_check: ${JSON.stringify(integrity)}`);
      }
    } finally {
      snapshot.close();
    }
    const copiedCounts = rowCounts(temporary);
    if (JSON.stringify(copiedCounts) !== JSON.stringify(sourceCounts)) {
      throw new Error(`Relocation row-count verification failed. Source=${JSON.stringify(sourceCounts)} Copy=${JSON.stringify(copiedCounts)}`);
    }
    if (existsSync(paths.databasePath)) throw new Error(`Destination appeared during relocation: ${paths.databasePath}`);
    try {
      linkSync(temporary, paths.databasePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Destination appeared during relocation: ${paths.databasePath}`);
      }
      throw error;
    }
    unlinkSync(temporary);
    process.stdout.write(`Verified database relocation from ${source} to ${paths.databasePath}\n`);
    return { source, destination: paths.databasePath, counts: copiedCounts };
  } finally {
    sourceDatabase.close();
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

async function main(): Promise<void> {
  await relocateDatabase();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`Database relocation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}