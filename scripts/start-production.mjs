import { spawn } from "node:child_process";
import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["run", "start", "--workspace", "@loan-dashboard/api"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});
child.once("error", (error) => {
  process.stderr.write(`Could not start production API: ${error.message}\n`);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
