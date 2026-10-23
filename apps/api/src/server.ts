import { createApp } from "./app.js";
import { openSqliteDatabase } from "./db/connection.js";
import { createSqliteRepositories } from "./db/repositories.js";
import { BackupService } from "./db/backup.js";
import { fileURLToPath } from "node:url";
import { reconcileAllLoanAutoEmis } from "./services/autoEmis.js";

export interface ApiRuntime {
  app: ReturnType<typeof createApp>;
  connection: ReturnType<typeof openSqliteDatabase>;
  backups: BackupService;
  close(): void;
}

export async function initializeApi(
  databasePath = process.env.DATABASE_PATH ?? "./data/loans.db",
  backupDirectory?: string,
): Promise<ApiRuntime> {
  const connection = openSqliteDatabase(databasePath);
  const backups = new BackupService(connection.client, connection.databasePath, backupDirectory);
  try {
    await backups.create();
    const repositories = createSqliteRepositories(connection.client);
    reconcileAllLoanAutoEmis(repositories);
    return {
      app: createApp(repositories, backups, connection.client),
      connection,
      backups,
      close: () => connection.close(),
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}

export async function startServer(): Promise<void> {
  const runtime = await initializeApi();
  const port = Number(process.env.PORT ?? 3001);
  const dailyBackup = setInterval(() => {
    void runtime.backups.create().catch((error: unknown) => {
      process.stderr.write(`Daily backup failed: ${String(error)}\n`);
    });
  }, 24 * 60 * 60 * 1000);
  const dailyAutoEmi = setInterval(() => {
    try {
      reconcileAllLoanAutoEmis(createSqliteRepositories(runtime.connection.client));
    } catch (error) {
      process.stderr.write(`Daily auto-EMI reconciliation failed: ${String(error)}\n`);
    }
  }, 24 * 60 * 60 * 1000);
  const server = runtime.app.listen(port, "127.0.0.1", () => {
    process.stdout.write(`API listening on http://127.0.0.1:${port}\n`);
  });
  const close = (): void => {
    clearInterval(dailyBackup);
    clearInterval(dailyAutoEmi);
    server.close(() => {
      runtime.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void startServer().catch((error: unknown) => {
    process.stderr.write(`API startup failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
