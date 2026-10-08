// Starts the API and the web app together. Ctrl+C stops both.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// --phone: serve the web app over HTTPS on the local network (camera access on phones).
const env = { ...process.env, ...(process.argv.includes("--phone") ? { DEV_PHONE: "1" } : {}) };
const procs = [
  ["api", ["run", "dev", "-w", "@gymfit/api"], "\x1b[36m"],
  ["web", ["run", "dev", "-w", "@gymfit/web"], "\x1b[35m"],
].map(([name, args, color]) => {
  const child = spawn(npm, args, { stdio: ["inherit", "pipe", "pipe"], shell: process.platform === "win32", env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) => out.write(chunk.toString().replace(/^(?=.)/gm, prefix)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    stopAll(code ?? 0);
  });
  return child;
});

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
