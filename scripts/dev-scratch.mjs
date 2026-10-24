import { spawn } from "node:child_process";
import process from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  spawn(npm, ["run", "dev", "--workspace", "@loan-dashboard/api"], {
    cwd: root,
    env: { ...process.env, DB_DIR: join(root, "db-scratch") },
    stdio: "inherit",
  }),
  spawn(npm, ["run", "dev", "--workspace", "@loan-dashboard/web"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of processes) {
  child.once("error", (error) => {
    process.stderr.write(`Could not start development process: ${error.message}\n`);
    stop();
  });
  child.once("exit", (code) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}
