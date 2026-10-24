import { createApp } from "./app.js";
import { openSqliteDatabase } from "./db/connection.js";
import { createSqliteRepositories } from "./db/repositories.js";
import { BackupService } from "./db/backup.js";
import { fileURLToPath } from "node:url";
import { reconcileAllLoanAutoEmis } from "./services/autoEmis.js";
import { acquireDatabaseLock, resolveDatabasePaths } from "./db/paths.js";
import { inspectDatabaseHealth, type DatabaseHealthState } from "./db/health.js";

export interface ApiRuntime {
  app: ReturnType<typeof createApp>;
  connection: Awaited<ReturnType<typeof openSqliteDatabase>>;
  backups: BackupService;
  health: DatabaseHealthState;
  close(): void;
}

export async function initializeApi(
  databasePath?: string,
  backupDirectory?: string,
): Promise<ApiRuntime> {
  const connection = await openSqliteDatabase(databasePath);
  const resolvedBackupDirectory = backupDirectory ?? (databasePath === undefined
    ? resolveDatabasePaths().backupsDirectory
    : undefined);
  const backups = new BackupService(connection.client, connection.databasePath, resolvedBackupDirectory);
  try {
    const health = inspectDatabaseHealth(connection.client, connection.databasePath, backups.backupDirectory);
    if (connection.startupFailures.length > 0) {
      health.dbOk = false;
      health.failures = [...connection.startupFailures];
    }
    if (health.dbOk) {
      await backups.createStartup();
      Object.assign(health, inspectDatabaseHealth(connection.client, connection.databasePath, backups.backupDirectory));
    }
    const repositories = createSqliteRepositories(connection.client);
    if (health.dbOk) reconcileAllLoanAutoEmis(repositories);
    return {
      app: createApp(repositories, backups, connection.client, health),
      connection,
      backups,
      health,
      close: () => connection.close(),
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}

export async function startServer(): Promise<void> {
  const paths = resolveDatabasePaths();
  const releaseLock = acquireDatabaseLock(paths.dataDirectory);
  let runtime: ApiRuntime;
  try { runtime = await initializeApi(); } catch (error) { releaseLock(); throw error; }
  process.stdout.write(`Database path: ${runtime.connection.databasePath}\n`);
  const port = Number(process.env.PORT ?? 3001);
  const dailyBackup = setInterval(() => {
    void runtime.backups.create().catch((error: unknown) => {
      process.stderr.write(`Daily backup failed: ${String(error)}\n`);
    });
  }, 24 * 60 * 60 * 1000);
  const dailyAutoEmi = setInterval(() => {
    if (!runtime.health.dbOk) return;
    try {
      reconcileAllLoanAutoEmis(createSqliteRepositories(runtime.connection.client));
    } catch (error) {
      process.stderr.write(`Daily auto-EMI reconciliation failed: ${String(error)}\n`);
    }
  }, 24 * 60 * 60 * 1000);
  const dailyIntegrityCheck = setInterval(() => {
    const current = inspectDatabaseHealth(runtime.connection.client, runtime.connection.databasePath, runtime.backups.backupDirectory);
    Object.assign(runtime.health, current);
    if (!runtime.health.dbOk) process.stderr.write(`Database entered read-only degraded mode: ${runtime.health.failures.join("; ")}\n`);
  }, 24 * 60 * 60 * 1000);
  const server = runtime.app.listen(port, "127.0.0.1", () => {
    process.stdout.write(`API listening on http://127.0.0.1:${port}\n`);
  });
  const close = (): void => {
    clearInterval(dailyBackup);
    clearInterval(dailyAutoEmi);
    clearInterval(dailyIntegrityCheck);
    server.close(() => {
      void (async () => {
        try {
          runtime.connection.client.pragma("wal_checkpoint(TRUNCATE)");
          await runtime.backups.create();
        } catch (error) {
          process.stderr.write(`Final database snapshot failed: ${String(error)}\n`);
        } finally {
          runtime.close();
          releaseLock();
          process.exit(0);
        }
      })();
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  if (process.platform !== "win32") process.once("SIGHUP", close);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void startServer().catch((error: unknown) => {
    process.stderr.write(`API startup failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
