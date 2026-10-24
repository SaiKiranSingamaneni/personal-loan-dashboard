import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  databasePathWarnings,
  ensureDatabaseDirectories,
  findRepositoryRoot,
  resolveDatabasePaths,
} from "./paths.js";

describe("database path configuration", () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  function makeWorkspace(): string {
    tempRoot = mkdtempSync(join(tmpdir(), "loan-dashboard-root-"));
    mkdirSync(join(tempRoot, "apps", "api", "src", "db"), { recursive: true });
    writeFileSync(join(tempRoot, ".loan-dashboard-root"), "root\n");
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture" }));
    return tempRoot;
  }

  it("resolves the same default database root regardless of process working directory", () => {
    const root = makeWorkspace();
    const sourceDirectory = join(root, "apps", "api", "src", "db");
    const originalCwd = process.cwd();
    const otherCwd = mkdtempSync(join(tmpdir(), "loan-dashboard-cwd-"));
    try {
      const expected = join(root, "db", "data", "loans.db");
      expect(resolveDatabasePaths(sourceDirectory, {}).databasePath).toBe(expected);
      expect(resolveDatabasePaths(sourceDirectory, {}).backupsDirectory).toBe(join(root, "db", "backups"));
      process.chdir(otherCwd);
      expect(findRepositoryRoot(sourceDirectory)).toBe(root);
      expect(resolveDatabasePaths(sourceDirectory, {}).databasePath).toBe(expected);
      expect(resolveDatabasePaths(sourceDirectory, {}).backupsDirectory).toBe(join(root, "db", "backups"));
    } finally {
      process.chdir(originalCwd);
      rmSync(otherCwd, { recursive: true, force: true });
    }
  });

  it("rejects the retired DATABASE_PATH selector and accepts DB_DIR alone", () => {
    const root = makeWorkspace();
    expect(() => resolveDatabasePaths(join(root, "apps", "api"), { DATABASE_PATH: "/tmp/other.db" } as NodeJS.ProcessEnv))
      .toThrow(/DATABASE_PATH is no longer supported/);
    expect(resolveDatabasePaths(join(root, "apps", "api"), { DB_DIR: "private" } as NodeJS.ProcessEnv).dbDirectory)
      .toBe(join(root, "private"));
  });

  it("resolves a relative DB_DIR from the repository root and creates the first tree", () => {
    const root = makeWorkspace();
    const paths = resolveDatabasePaths(join(root, "apps", "api", "src"), { DB_DIR: "private-db" } as NodeJS.ProcessEnv);
    expect(paths.dbDirectory).toBe(join(root, "private-db"));
    expect(ensureDatabaseDirectories(paths, {})).toBe(true);
    expect(ensureDatabaseDirectories(paths, {})).toBe(false);
  });

  it("rejects an explicitly configured missing directory rather than silently initializing it", () => {
    const root = makeWorkspace();
    const paths = resolveDatabasePaths(join(root, "apps", "api", "src"), { DB_DIR: "/missing/configured/db" } as NodeJS.ProcessEnv);
    expect(() => ensureDatabaseDirectories(paths, { DB_DIR: "/missing/configured/db" } as NodeJS.ProcessEnv))
      .toThrow(/DB_DIR does not exist/);
  });

  it("warns for cloud-synced paths and UNC network shares", () => {
    expect(databasePathWarnings("/Users/test/Dropbox/loans.db", "darwin")).toContain(
      "Database path appears to be inside a cloud-synced folder.",
    );
    expect(databasePathWarnings("\\\\server\\share\\loans.db", "win32")).toContain(
      "Database path appears to be on a network share or mapped drive.",
    );
  });
});
