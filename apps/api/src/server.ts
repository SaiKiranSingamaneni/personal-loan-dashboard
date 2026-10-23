import { createApp } from "./app.js";
import { openSqliteDatabase } from "./db/connection.js";
import { createSqliteRepositories } from "./db/repositories.js";
import { BackupService } from "./db/backup.js";

export async function startServer(): Promise<void> {
  const connection = openSqliteDatabase();
  const backups = new BackupService(connection.client, connection.databasePath);
  try {
    await backups.create();
  } catch (error) {
    connection.close();
    throw error;
  }
  const repositories = createSqliteRepositories(connection.client);
  const app = createApp(repositories, backups, connection.client);
  const port = Number(process.env.PORT ?? 3001);
  const dailyBackup = setInterval(() => {
    void backups.create().catch((error: unknown) => {
      process.stderr.write(`Daily backup failed: ${String(error)}\n`);
    });
  }, 24 * 60 * 60 * 1000);
  const server = app.listen(port, "127.0.0.1", () => {
    process.stdout.write(`API listening on http://127.0.0.1:${port}\n`);
  });
  const close = (): void => {
    clearInterval(dailyBackup);
    server.close(() => {
      connection.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

void startServer().catch((error: unknown) => {
  process.stderr.write(`API startup failed: ${String(error)}\n`);
  process.exitCode = 1;
});
