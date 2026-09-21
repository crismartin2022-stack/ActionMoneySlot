const { spawn } = require("child_process");

const port = process.env.PORT || "8080";
const httpServerCli = require.resolve("http-server/bin/http-server");

const child = spawn(process.execPath, [httpServerCli, ".", "-p", port, "-c-1"], {
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code) => {
  process.exit(code === null ? 1 : code);
});
