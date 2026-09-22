const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverScript = path.join(__dirname, 'start-server.js');
const indexHtmlPath = path.join(rootDir, 'ActionMoneyEGT', 'html5', 'index.html');
const {
  DEFAULT_ENTRYPOINT,
  buildRuntimeConfig,
  createServer
} = require('./start-server');

function httpRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET'
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          headers: response.headers,
          statusCode: response.statusCode
        });
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function main() {
  const syntaxCheck = spawnSync(process.execPath, ['--check', serverScript], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  assert.strictEqual(syntaxCheck.status, 0, syntaxCheck.stderr || syntaxCheck.stdout);

  const emptyRuntimeConfig = buildRuntimeConfig({
    ACTION_MONEY_SLOT_GAME_NAME: '',
    ACTION_MONEY_SLOT_LANGUAGE: '',
    ACTION_MONEY_SLOT_CURRENCY: ''
  });
  assert.strictEqual(emptyRuntimeConfig.tcpHost, undefined);
  assert.strictEqual(emptyRuntimeConfig.tcpPort, undefined);
  assert.strictEqual(emptyRuntimeConfig.token, undefined);

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  assert(indexHtml.includes('Falta configurar tcpHost.'), 'index.html should reject missing tcpHost.');
  assert(indexHtml.includes('tcpPort no puede estar vacío.'), 'index.html should reject missing tcpPort.');
  assert(!indexHtml.includes('local-test-token'), 'index.html should not invent a token fallback.');
  assert(!indexHtml.includes('runtimeConfig.tcpHost || window.location.hostname'), 'index.html should not default tcpHost to the current hostname.');

  const runtimeConfig = buildRuntimeConfig({
    ACTION_MONEY_SLOT_TCP_HOST: 'socket.example.test',
    ACTION_MONEY_SLOT_TCP_PORT: '8449',
    ACTION_MONEY_SLOT_SSL_HOST: 'true',
    ACTION_MONEY_SLOT_TOKEN: 'example-token'
  });

  const server = createServer({ runtimeConfig });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  try {
    const address = server.address();
    assert(address && address.port, 'Server must expose a listening port.');

    const health = await httpRequest(address.port, '/health');
    assert.strictEqual(health.statusCode, 200);
    assert(health.body.includes('"ok":true'));

    const root = await httpRequest(address.port, '/');
    assert.strictEqual(root.statusCode, 302);
    assert.strictEqual(root.headers.location, DEFAULT_ENTRYPOINT);

    const entrypoint = await httpRequest(address.port, DEFAULT_ENTRYPOINT);
    assert.strictEqual(entrypoint.statusCode, 200);
    assert(entrypoint.body.includes('<title>ActionMoneySlot</title>'));

    const traversal = await httpRequest(address.port, '/%2e%2e/package.json');
    assert.strictEqual(traversal.statusCode, 403);

    const runtimeScript = await httpRequest(address.port, '/runtime-config.js');
    assert.strictEqual(runtimeScript.statusCode, 200);
    assert(runtimeScript.body.includes('"tcpHost": "socket.example.test"'));
    assert(runtimeScript.body.includes('"tcpPort": "8449"'));
    assert(runtimeScript.body.includes('"sslHost": true'));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
