import { spawn } from "bun";

const child = spawn(
  [
    process.execPath,
    "--no-env-file",
    "run",
    "--parallel",
    "dev:web",
    "dev:server",
  ],
  { detached: true, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  // Bun's parallel runner handles SIGINT and waits for the server's async flush.
  if (process.platform === "win32") child.kill("SIGINT");
  else process.kill(-child.pid, "SIGINT");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const code = await child.exited;
process.off("SIGINT", stop);
process.off("SIGTERM", stop);
process.exit(code);
