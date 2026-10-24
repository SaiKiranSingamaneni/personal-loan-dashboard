import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const requiredDirectories = ["data", "backups", "exports", "quarantine"] as const;

export interface DatabasePaths {
  repositoryRoot: string;
  dbDirectory: string;
  dataDirectory: string;
  backupsDirectory: string;
  exportsDirectory: string;
  quarantineDirectory: string;
  databasePath: string;
}

export function findRepositoryRoot(startDirectory = dirname(fileURLToPath(import.meta.url))): string {
  let current = resolve(startDirectory);
  while (true) {
    if (existsSync(join(current, ".loan-dashboard-root")) && existsSync(join(current, "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not find repository root marker (.loan-dashboard-root and package.json) above ${startDirectory}.`);
}

export function resolveDatabasePaths(
  startDirectory = dirname(fileURLToPath(import.meta.url)),
  environment: NodeJS.ProcessEnv = process.env,
): DatabasePaths {
  const repositoryRoot = findRepositoryRoot(startDirectory);
  const configured = environment.DB_DIR?.trim();
  const dbDirectory = configured === undefined || configured === ""
    ? join(repositoryRoot, "db")
    : isAbsolute(configured) ? resolve(configured) : resolve(repositoryRoot, configured);
  return {
    repositoryRoot,
    dbDirectory,
    dataDirectory: join(dbDirectory, "data"),
    backupsDirectory: join(dbDirectory, "backups"),
    exportsDirectory: join(dbDirectory, "exports"),
    quarantineDirectory: join(dbDirectory, "quarantine"),
    databasePath: join(dbDirectory, "data", "loans.db"),
  };
}

export function ensureDatabaseDirectories(paths: DatabasePaths, environment: NodeJS.ProcessEnv = process.env): boolean {
  const createdOnFirstRun = !existsSync(paths.dbDirectory);
  if (createdOnFirstRun && environment.DB_DIR?.trim()) {
    throw new Error(`DB_DIR does not exist: ${paths.dbDirectory}. Create the configured directory or unset DB_DIR to use the repository database directory.`);
  }
  if (createdOnFirstRun) {
    mkdirSync(paths.dbDirectory, { recursive: true });
    for (const directory of requiredDirectories) mkdirSync(join(paths.dbDirectory, directory), { recursive: true });
    process.stdout.write(`Initialized database directories at ${paths.dbDirectory}\n`);
  } else {
    if (!statSync(paths.dbDirectory).isDirectory()) throw new Error(`DB_DIR is not a directory: ${paths.dbDirectory}`);
    for (const directory of requiredDirectories) {
      const path = join(paths.dbDirectory, directory);
      if (!existsSync(path) || !statSync(path).isDirectory()) {
        throw new Error(`Database directory is missing or invalid: ${path}. Refusing to create a partial data tree.`);
      }
    }
  }
  for (const directory of [paths.dbDirectory, ...requiredDirectories.map((name) => join(paths.dbDirectory, name))]) {
    try {
      accessSync(directory, constants.W_OK);
    } catch {
      throw new Error(`Database directory is not writable: ${directory}`);
    }
  }
  return createdOnFirstRun;
}

function isNetworkMount(path: string, platform: NodeJS.Platform): boolean {
  if (platform === "win32") {
    if (/^(?:\\\\|\/\/)/.test(path)) return true;
    const drive = parse(path).root;
    if (!drive) return false;
    try {
      execFileSync("net", ["use", drive], { stdio: "ignore", windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const mounts = execFileSync("mount", [], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return mounts.split("\n").some((line) => {
      const match = / on (.+?) \(([^)]*)\)/.exec(line);
      if (match === null || !path.startsWith(`${match[1]}/`) && path !== match[1]) return false;
      return /\b(smbfs|nfs|webdav|cifs|afpfs)\b/i.test(match[2]!);
    });
  } catch {
    return false;
  }
}

export function databasePathWarnings(path: string, platform: NodeJS.Platform = process.platform): string[] {
  const warnings: string[] = [];
  if (/(?:^|[\\/])(?:OneDrive|Dropbox|Google Drive|GoogleDrive|Mobile Documents|iCloud Drive)(?:[\\/]|$)/i.test(path)) {
    warnings.push("Database path appears to be inside a cloud-synced folder.");
  }
  if (isNetworkMount(path, platform)) warnings.push("Database path appears to be on a network share or mapped drive.");
  return warnings;
}

export function legacyDatabaseCandidates(paths: DatabasePaths): string[] {
  const candidates = [
    join(paths.repositoryRoot, "data", "loans.db"),
    join(paths.repositoryRoot, "apps", "api", "data", "loans.db"),
  ];
  const configuredLegacyPath = process.env.DATABASE_PATH?.trim();
  if (configuredLegacyPath && configuredLegacyPath !== ":memory:") {
    candidates.push(isAbsolute(configuredLegacyPath)
      ? resolve(configuredLegacyPath)
      : resolve(process.cwd(), configuredLegacyPath));
  }
  return [...new Set(candidates)];
}

export function listLegacyDatabaseCandidates(paths: DatabasePaths): string[] {
  return legacyDatabaseCandidates(paths).filter((path) => existsSync(path) && statSync(path).isFile());
}

export function listDatabaseTables(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
      .map((row) => row.name);
  } finally {
    database.close();
  }
}

export function rowCounts(databasePath: string): Record<string, number> {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return Object.fromEntries(tables.map(({ name }) => [name, (database.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get() as { count: number }).count]));
  } finally {
    database.close();
  }
}