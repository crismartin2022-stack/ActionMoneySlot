const path = require("path");
const httpServer = require("http-server");

const port = Number(process.env.PORT) || 8080;
const root = path.resolve(__dirname, "..");

const server = httpServer.createServer({
  root,
  cache: -1
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ActionMoneySlot server activo en puerto ${port} (host 0.0.0.0)`);
});
