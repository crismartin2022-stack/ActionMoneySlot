const path = require("path");
const httpServer = require("http-server");

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";
const root = path.resolve(__dirname, "..");

const server = httpServer.createServer({
  root,
  cache: -1
});

server.listen(port, host, () => {
  console.log(`ActionMoneySlot server activo en ${host}:${port}`);
});
