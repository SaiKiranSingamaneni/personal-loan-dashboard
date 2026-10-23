import { createApp } from "./app.js";
import { openSqliteDatabase } from "./db/connection.js";
import { createSqliteRepositories } from "./db/repositories.js";

export function startServer(): void {
  const connection = openSqliteDatabase();
  const repositories = createSqliteRepositories(connection.client);
  const app = createApp();
  app.locals.repositories = repositories;
  const port = Number(process.env.PORT ?? 3001);
  const server = app.listen(port, "127.0.0.1", () => {
    process.stdout.write(`API listening on http://127.0.0.1:${port}\n`);
  });
  const close = (): void => {
    server.close(() => {
      connection.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

startServer();
