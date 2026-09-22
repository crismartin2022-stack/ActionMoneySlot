const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const WebSocket = require('ws');

const rootDir = path.resolve(__dirname, '..');
const serverScript = path.join(__dirname, 'start-server.js');
const backendScript = path.join(__dirname, 'game-backend.js');
const indexHtmlPath = path.join(rootDir, 'ActionMoneyEGT', 'html5', 'index.html');
const gptsPath = path.join(rootDir, 'ActionMoneyEGT', 'html5', 'gpts.min.js');
const {
  DEFAULT_ENTRYPOINT,
  buildRuntimeConfig,
  createServer,
  inferSameOriginRuntimeConfig
} = require('./start-server');

function httpRequest(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
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
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

function parseJsonFrame(payload) {
  const text = String(payload || '');
  return JSON.parse(text.startsWith(':::') ? text.slice(3) : text);
}

async function createWebSocketSession(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`);

    socket.once('error', reject);
    socket.once('open', () => resolve(socket));
  });
}

async function nextApplicationFrame(socket) {
  return new Promise((resolve, reject) => {
    const onMessage = (payload) => {
      const text = String(payload || '');
      if (text === '1::') {
        socket.once('message', onMessage);
        return;
      }
      try {
        resolve(parseJsonFrame(text));
      } catch (error) {
        reject(error);
      }
    };

    socket.once('message', onMessage);
    socket.once('error', reject);
  });
}

async function sendWsRequest(socket, payload) {
  socket.send(`:::${JSON.stringify(payload)}`);
  return nextApplicationFrame(socket);
}

async function main() {
  const syntaxChecks = [serverScript, backendScript].map((scriptPath) => spawnSync(process.execPath, ['--check', scriptPath], {
    cwd: rootDir,
    encoding: 'utf8'
  }));
  syntaxChecks.forEach((result) => {
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  });

  const emptyRuntimeConfig = buildRuntimeConfig({
    ACTION_MONEY_SLOT_GAME_NAME: '',
    ACTION_MONEY_SLOT_LANGUAGE: '',
    ACTION_MONEY_SLOT_CURRENCY: ''
  });
  assert.strictEqual(emptyRuntimeConfig.tcpHost, undefined);
  assert.strictEqual(emptyRuntimeConfig.tcpPort, undefined);
  assert.strictEqual(emptyRuntimeConfig.token, undefined);
  assert.strictEqual(emptyRuntimeConfig.apiBase, '/api');

  const inferredRuntimeConfig = inferSameOriginRuntimeConfig({
    headers: {
      host: 'example.test:9001',
      'x-forwarded-proto': 'https'
    }
  }, buildRuntimeConfig({}));
  assert.strictEqual(inferredRuntimeConfig.tcpHost, 'example.test');
  assert.strictEqual(inferredRuntimeConfig.tcpPort, '9001');
  assert.strictEqual(inferredRuntimeConfig.sslHost, true);

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  assert(indexHtml.includes('Falta configurar tcpHost.'), 'index.html should still report invalid tcpHost values.');
  assert(indexHtml.includes('window.sessionStorage.setItem(\'sessionId\''), 'index.html should persist sessionId for backend sessions.');

  const gptsScript = fs.readFileSync(gptsPath, 'utf8');
  assert(gptsScript.includes("if('string'==typeof b.data&&0===b.data.indexOf(':::')){b.data=b.data.slice(3);}"), 'gpts websocket parser should strip a single transport prefix.');

  const runtimeConfig = buildRuntimeConfig({
    ACTION_MONEY_SLOT_SSL_HOST: 'false',
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
    assert(health.body.includes('"apiBase":"/api"'));

    const root = await httpRequest(address.port, '/');
    assert.strictEqual(root.statusCode, 302);
    assert.strictEqual(root.headers.location, DEFAULT_ENTRYPOINT);

    const entrypoint = await httpRequest(address.port, DEFAULT_ENTRYPOINT);
    assert.strictEqual(entrypoint.statusCode, 200);
    assert(entrypoint.body.includes('<title>ActionMoneySlot</title>'));

    const traversal = await httpRequest(address.port, '/ActionMoneyEGT/%2e%2e/package.json');
    assert.strictEqual(traversal.statusCode, 403);

    const hiddenRepoFile = await httpRequest(address.port, '/package.json');
    assert.strictEqual(hiddenRepoFile.statusCode, 404);

    const runtimeScript = await httpRequest(address.port, '/runtime-config.js');
    assert.strictEqual(runtimeScript.statusCode, 200);
    assert(runtimeScript.body.includes('"tcpHost": "127.0.0.1"'));
    assert(runtimeScript.body.includes(`"tcpPort": "${address.port}"`));
    assert(runtimeScript.body.includes('"sessionId": "example-token"'));

    const gamesResponse = await httpRequest(address.port, '/api/games');
    assert.strictEqual(gamesResponse.statusCode, 200);
    const gamesPayload = JSON.parse(gamesResponse.body);
    assert(Array.isArray(gamesPayload.games));
    assert.strictEqual(gamesPayload.games[0].gameType, 'AMJSlot');

    const invalidGamesMethod = await httpRequest(address.port, '/api/games', { method: 'POST' });
    assert.strictEqual(invalidGamesMethod.statusCode, 405);

    const createdSessionResponse = await httpRequest(address.port, '/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        playerName: 'tester',
        balance: 12345,
        currency: 'EUR',
        language: 'en'
      })
    });
    assert.strictEqual(createdSessionResponse.statusCode, 201);
    const createdSessionPayload = JSON.parse(createdSessionResponse.body);
    assert.strictEqual(createdSessionPayload.session.playerName, 'tester');
    assert(createdSessionPayload.launchUrl.includes(createdSessionPayload.session.id));

    const balanceUpdateResponse = await httpRequest(address.port, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount: 55 })
    });
    assert.strictEqual(balanceUpdateResponse.statusCode, 200);
    const updatedSession = JSON.parse(balanceUpdateResponse.body).session;
    assert.strictEqual(updatedSession.balance, 12400);

    const invalidBalanceMethod = await httpRequest(address.port, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}/balance`);
    assert.strictEqual(invalidBalanceMethod.statusCode, 405);

    const socket = await createWebSocketSession(address.port);
    try {
      const sessionId = createdSessionPayload.session.id;
      const loginResponse = await sendWsRequest(socket, {
        messageId: 'r-r_login',
        command: 'login',
        qName: 'jServer.gameManager.login',
        sessionKey: 'LOCAL:test',
        sessionId
      });
      assert.strictEqual(loginResponse.command, 'login');
      assert.strictEqual(loginResponse.msg, 'success');
      assert.strictEqual(loginResponse.balance, 12400);
      assert(Array.isArray(loginResponse.complex.AMJSlot));

      const missingSessionResponse = await sendWsRequest(socket, {
        messageId: 'r-r_missing_session',
        command: 'login',
        qName: 'jServer.gameManager.login',
        sessionKey: 'LOCAL:test',
        sessionId: 'missing-session'
      });
      assert.strictEqual(missingSessionResponse.msg, 'failure');
      assert(missingSessionResponse.reason.includes('Unknown session'));

      const settingsResponse = await sendWsRequest(socket, {
        messageId: 'r-r_settings',
        command: 'settings',
        qName: 'jServer.AMJSlot.settings',
        sessionKey: 'LOCAL:test',
        gameIdentificationNumber: 1,
        gameNumber: -1,
        sessionId
      });
      assert.strictEqual(settingsResponse.command, 'settings');
      assert.strictEqual(settingsResponse.msg, 'success');
      assert.deepStrictEqual(settingsResponse.complex.bets, [1, 2, 5, 10, 20]);

      const subscribeResponse = await sendWsRequest(socket, {
        messageId: 'r-r_subscribe',
        command: 'subscribe',
        qName: 'jServer.AMJSlot.subscribe',
        sessionKey: 'LOCAL:test',
        gameIdentificationNumber: 1,
        gameNumber: -1,
        sessionId
      });
      assert.strictEqual(subscribeResponse.command, 'subscribe');
      assert.strictEqual(subscribeResponse.msg, 'success');
      assert.strictEqual(subscribeResponse.complex.currentState.state, 'idle');

      const betResponse = await sendWsRequest(socket, {
        messageId: 'r-r_bet',
        command: 'bet',
        qName: 'jServer.AMJSlot.bet.bet',
        sessionKey: 'LOCAL:test',
        gameIdentificationNumber: 1,
        gameNumber: subscribeResponse.gameNumber,
        sessionId,
        bet: {
          gameCommand: 'bet',
          bet: 3,
          denomination: 3,
          numberOfLines: 5
        }
      });
      assert.strictEqual(betResponse.command, 'bet');
      assert.strictEqual(betResponse.msg, 'success');
      assert(Array.isArray(betResponse.complex.reels));
      assert.strictEqual(betResponse.complex.reels.length, 30);
      assert(betResponse.balance >= 0);
    } finally {
      await new Promise((resolve) => {
        socket.once('close', resolve);
        socket.close();
      });
    }
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
