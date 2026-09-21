const httpServer = require("http-server");

const port = Number(process.env.PORT || 8080);
const cacheSeconds = -1;
const server = httpServer.createServer({
  root: ".",
  cache: cacheSeconds
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ActionMoneySlot disponible en http://localhost:${port}`);
});
