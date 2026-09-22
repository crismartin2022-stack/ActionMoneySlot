const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');
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

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return server.address().port;
}

async function closeServer(server) {
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

function extractFunctionSource(content, functionName) {
  const startMarker = `function ${functionName}(`;
  const startIndex = content.indexOf(startMarker);
  assert(startIndex >= 0, `Expected ${functionName} to exist in index.html.`);

  const bodyStartIndex = content.indexOf('{', startIndex);
  assert(bodyStartIndex >= 0, `Expected ${functionName} body to exist in index.html.`);

  let depth = 0;
  for (let index = bodyStartIndex; index < content.length; index += 1) {
    const character = content[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Could not extract ${functionName} from index.html.`);
}

function loadNormalizeSocketConfig(indexHtml) {
  const functionNames = ['isBareIpv6Host', 'hasExtraUrlParts', 'normalizeSocketConfig'];
  const sources = functionNames.map((functionName) => extractFunctionSource(indexHtml, functionName));
  const script = `${sources.join('\n\n')}\nmodule.exports = normalizeSocketConfig;`;
  const sandbox = {
    URL,
    assert,
    module: { exports: null },
    exports: {}
  };
  vm.runInNewContext(script, sandbox, {
    filename: 'ActionMoneyEGT/html5/index.html::normalizeSocketConfig'
  });
  return sandbox.module.exports;
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
  assert(indexHtml.includes('runtimeConfig.apiBase'), 'index.html should preserve apiBase from query or runtime config.');
  const normalizeSocketConfig = loadNormalizeSocketConfig(indexHtml);
  const railwaySocketConfig = normalizeSocketConfig('actionmoneyslot-production.up.railway.app', '443', true, true);
  assert.strictEqual(railwaySocketConfig.error, undefined, railwaySocketConfig.error);
  assert.strictEqual(railwaySocketConfig.host, 'actionmoneyslot-production.up.railway.app');
  assert.strictEqual(railwaySocketConfig.port, '443');
  assert.strictEqual(railwaySocketConfig.sslHost, true);
  assert.strictEqual(railwaySocketConfig.wsEndpoint, 'wss://actionmoneyslot-production.up.railway.app');
  assert.deepStrictEqual(Array.from(railwaySocketConfig.warnings), []);
  assert(!String(railwaySocketConfig.error || '').includes('tcpHost no es válido'), 'Valid Railway host should not surface a misleading tcpHost error.');

  const localSocketConfig = normalizeSocketConfig('127.0.0.1', '80', false, true);
  assert.strictEqual(localSocketConfig.error, undefined, localSocketConfig.error);
  assert.strictEqual(localSocketConfig.host, '127.0.0.1');
  assert.strictEqual(localSocketConfig.port, '80');
  assert.strictEqual(localSocketConfig.sslHost, false);
  assert.strictEqual(localSocketConfig.wsEndpoint, 'ws://127.0.0.1');
  assert.deepStrictEqual(Array.from(localSocketConfig.warnings), []);
  assert(!String(localSocketConfig.error || '').includes('tcpHost no es válido'), 'Valid local host should not surface a misleading tcpHost error.');

  const gptsScript = fs.readFileSync(gptsPath, 'utf8');
  assert(gptsScript.includes("if('string'==typeof b.data&&0===b.data.indexOf(':::')){b.data=b.data.slice(3);}"), 'gpts websocket parser should strip a single transport prefix.');
  assert(gptsScript.includes('0===d.indexOf(":::")&&(d=d.slice(3));'), 'gpts onmessage parser should normalize the transport prefix before mapping.');

  const runtimeConfig = buildRuntimeConfig({
    ACTION_MONEY_SLOT_SSL_HOST: 'false',
    ACTION_MONEY_SLOT_TOKEN: 'example-token',
    ACTION_MONEY_SLOT_API_BASE: '/api'
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-money-slot-'));
  const dbPath = path.join(tempDir, 'action-money-slot.sqlite');
  let server;
  let reopenedServer;

  try {
    server = createServer({ runtimeConfig, backendOptions: { dbPath } });
    const port = await listen(server);

    const health = await httpRequest(port, '/health');
    assert.strictEqual(health.statusCode, 200);
    assert(health.body.includes('"ok":true'));
    assert(health.body.includes('"apiBase":"/api"'));

    const root = await httpRequest(port, '/');
    assert.strictEqual(root.statusCode, 302);
    assert.strictEqual(root.headers.location, DEFAULT_ENTRYPOINT);

    const entrypoint = await httpRequest(port, DEFAULT_ENTRYPOINT);
    assert.strictEqual(entrypoint.statusCode, 200);
    assert(entrypoint.body.includes('<title>ActionMoneySlot</title>'));

    const traversal = await httpRequest(port, '/ActionMoneyEGT/%2e%2e/package.json');
    assert.strictEqual(traversal.statusCode, 403);

    const hiddenRepoFile = await httpRequest(port, '/package.json');
    assert.strictEqual(hiddenRepoFile.statusCode, 404);

    const runtimeScript = await httpRequest(port, '/runtime-config.js');
    assert.strictEqual(runtimeScript.statusCode, 200);
    assert(runtimeScript.body.includes('"tcpHost": "127.0.0.1"'));
    assert(runtimeScript.body.includes(`"tcpPort": "${port}"`));
    assert(runtimeScript.body.includes('"sessionId": "example-token"'));
    assert(runtimeScript.body.includes('"apiBase": "/api"'));

    const gamesResponse = await httpRequest(port, '/api/games');
    assert.strictEqual(gamesResponse.statusCode, 200);
    const gamesPayload = JSON.parse(gamesResponse.body);
    assert(Array.isArray(gamesPayload.games));
    assert.strictEqual(gamesPayload.games[0].gameType, 'AMJSlot');
    assert.strictEqual(gamesPayload.games[0].settings.numReels, 5);
    assert.strictEqual(gamesPayload.games[0].settings.wildIndex, 8);
    assert(gamesPayload.games[0].launchUrl.includes('apiBase=%2Fapi'));
    assert(gamesPayload.games[0].launchUrl.includes('gameIdentificationNumber=1'));

    const gameDetails = await httpRequest(port, '/api/games/1');
    assert.strictEqual(gameDetails.statusCode, 200);
    const gamePayload = JSON.parse(gameDetails.body).game;
    assert.strictEqual(gamePayload.settings.numReelCards, 3);

    const invalidGamesMethod = await httpRequest(port, '/api/games', { method: 'POST' });
    assert.strictEqual(invalidGamesMethod.statusCode, 405);
    assert.strictEqual(invalidGamesMethod.headers.allow, 'GET, HEAD');

    const createdSessionResponse = await httpRequest(port, '/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        playerName: 'tester',
        balance: 12345,
        currency: 'EUR',
        language: 'en',
        gameType: 'AMJSlot'
      })
    });
    assert.strictEqual(createdSessionResponse.statusCode, 201);
    const createdSessionPayload = JSON.parse(createdSessionResponse.body);
    assert.strictEqual(createdSessionPayload.session.playerName, 'tester');
    assert.strictEqual(createdSessionPayload.session.selectedGame.gameType, 'AMJSlot');
    assert(createdSessionPayload.launchUrl.includes(createdSessionPayload.session.id));

    const sessionsResponse = await httpRequest(port, '/api/sessions');
    assert.strictEqual(sessionsResponse.statusCode, 200);
    const sessionsPayload = JSON.parse(sessionsResponse.body);
    assert(sessionsPayload.sessions.some((session) => session.id === 'demo-session'));
    assert(sessionsPayload.sessions.some((session) => session.id === createdSessionPayload.session.id));

    const selectedGameResponse = await httpRequest(port, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}/select-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ gameIdentificationNumber: 1 })
    });
    assert.strictEqual(selectedGameResponse.statusCode, 200);
    assert(JSON.parse(selectedGameResponse.body).launchUrl.includes('gameIdentificationNumber=1'));

    const balanceUpdateResponse = await httpRequest(port, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount: 55 })
    });
    assert.strictEqual(balanceUpdateResponse.statusCode, 200);
    const updatedSession = JSON.parse(balanceUpdateResponse.body).session;
    assert.strictEqual(updatedSession.balance, 12400);

    const invalidBalanceMethod = await httpRequest(port, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}/balance`);
    assert.strictEqual(invalidBalanceMethod.statusCode, 405);
    assert.strictEqual(invalidBalanceMethod.headers.allow, 'POST');

    let expectedPersistedBalance = updatedSession.balance;
    const socket = await createWebSocketSession(port);
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

      const unknownGameResponse = await sendWsRequest(socket, {
        messageId: 'r-r_unknown_game',
        command: 'settings',
        qName: 'jServer.AMJSlot.settings',
        sessionKey: 'LOCAL:test',
        sessionId,
        gameIdentificationNumber: 999
      });
      assert.strictEqual(unknownGameResponse.msg, 'failure');
      assert(unknownGameResponse.reason.includes('Unknown gameIdentificationNumber'));

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
      assert.strictEqual(settingsResponse.complex.numReels, 5);

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
          lines: 5
        }
      });
      assert.strictEqual(betResponse.command, 'bet');
      assert.strictEqual(betResponse.msg, 'success');
      assert(Array.isArray(betResponse.complex.reels));
      assert.strictEqual(betResponse.complex.reels.length, 25);
      assert(betResponse.balance >= 0);
      expectedPersistedBalance = betResponse.balance;

      const invalidBetResponse = await sendWsRequest(socket, {
        messageId: 'r-r_invalid_bet',
        command: 'bet',
        qName: 'jServer.AMJSlot.bet.bet',
        sessionKey: 'LOCAL:test',
        gameIdentificationNumber: 1,
        gameNumber: subscribeResponse.gameNumber,
        sessionId,
        bet: {
          gameCommand: 'bet',
          bet: 999,
          denomination: 999,
          lines: 999
        }
      });
      assert.strictEqual(invalidBetResponse.msg, 'failure');
      assert(invalidBetResponse.reason.includes('Unsupported'));
    } finally {
      await new Promise((resolve) => {
        socket.once('close', resolve);
        socket.close();
      });
    }

    await closeServer(server);
    server = null;

    reopenedServer = createServer({ runtimeConfig, backendOptions: { dbPath } });
    const reopenedPort = await listen(reopenedServer);
    const persistedSessionResponse = await httpRequest(reopenedPort, `/api/sessions/${encodeURIComponent(createdSessionPayload.session.id)}`);
    assert.strictEqual(persistedSessionResponse.statusCode, 200);
    const persistedSession = JSON.parse(persistedSessionResponse.body).session;
    assert.strictEqual(persistedSession.balance, expectedPersistedBalance);
    assert.strictEqual(persistedSession.selectedGameId, 1);
  } finally {
    if (server) {
      await closeServer(server);
    }
    if (reopenedServer) {
      await closeServer(reopenedServer);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
