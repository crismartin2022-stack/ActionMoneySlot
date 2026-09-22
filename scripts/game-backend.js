const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const RESPONSE_QNAMES = {
  base: 'xxx.services.messages.response.BaseResponse',
  game: 'xxx.services.messages.response.GameResponse',
  gameEvent: 'xxx.services.messages.response.GameEventResponse',
  login: 'xxx.services.messages.response.LoginResponse'
};

const DEFAULT_GROUPS = ['all', 'slots'];
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_BALANCE = 500000;
const DEFAULT_PLAYER_NAME = 'demo-player';
const DEFAULT_GAME_NAME = 'ActionMoneySlot';
const DEFAULT_GAME_TYPE = 'AMJSlot';
const DEFAULT_ENGINE_TYPE = 'ActionMoneySlot';
const DEFAULT_GAME_IDENTIFICATION_NUMBER = 1;
const DEFAULT_GAME_VERSION = '1.3.0';
const DEFAULT_SYMBOL_COUNT = 11;
const DEFAULT_PAYTABLE = {
  0: { coef: [10, 30, 100], multiplier: 1 },
  1: { coef: [10, 30, 100], multiplier: 1 },
  2: { coef: [10, 30, 100], multiplier: 1 },
  3: { coef: [10, 30, 100], multiplier: 1 },
  4: { coef: [20, 50, 200], multiplier: 1 },
  5: { coef: [20, 50, 200], multiplier: 1 },
  6: { coef: [40, 100, 500], multiplier: 1 },
  7: { coef: [50, 200, 1000], multiplier: 1 },
  8: { coef: [50, 200, 1000], multiplier: 1 },
  9: { coef: [60, 250, 1200], multiplier: 1 },
  10: { coef: [60, 250, 1200], multiplier: 1 },
  11: { coef: [70, 300, 1500], multiplier: 1 },
  12: { coef: [70, 300, 1500], multiplier: 1 },
  13: { coef: [10, 20, 40], multiplier: 1 }
};
const DEFAULT_DENOMINATIONS = [
  [3, 70, 300000],
  [5, 70, 300000],
  [10, 70, 300000],
  [20, 70, 300000]
];
const DEFAULT_BETS = [1, 2, 5, 10, 20];
const DEFAULT_FAKE_REELS = [
  [2, 4, 1, 3, 2, 7, 0, 6, 1, 4, 7, 0, 5, 4, 4, 4, 4, 4, 5, 4, 0, 7, 1, 0, 3, 4, 5, 2, 3, 1],
  [2, 4, 1, 3, 2, 7, 0, 6, 1, 4, 7, 0, 5, 6, 1, 2, 4, 4, 4, 4, 7, 2, 7, 6, 4, 2, 0, 2, 0, 2],
  [2, 4, 1, 3, 2, 7, 0, 6, 2, 4, 7, 0, 5, 6, 4, 4, 4, 4, 5, 4, 1, 4, 0, 5, 0, 3, 4, 0, 1, 6],
  [2, 4, 1, 3, 2, 7, 0, 6, 1, 4, 7, 0, 5, 6, 4, 4, 4, 4, 5, 7, 3, 6, 0, 4, 0, 5, 0, 2, 5, 1],
  [2, 4, 1, 3, 2, 7, 0, 6, 1, 4, 7, 0, 5, 6, 1, 2, 4, 4, 4, 4, 0, 4, 1, 0, 4, 4, 5, 0, 0, 2],
  [2, 4, 1, 3, 2, 7, 0, 6, 1, 4, 7, 0, 5, 6, 1, 2, 4, 4, 4, 4, 7, 2, 7, 6, 4, 2, 0, 2, 0, 2]
];
const DEFAULT_IDLE_REELS = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2];
const DEFAULT_JACKPOT_STATE = {
  levelI: 0,
  levelII: 0,
  levelIII: 0,
  levelIV: 0,
  winsLevelI: 0,
  winsLevelII: 0,
  winsLevelIII: 0,
  winsLevelIV: 0,
  largestWinLevelI: 0,
  largestWinLevelII: 0,
  largestWinLevelIII: 0,
  largestWinLevelIV: 0,
  lastWinLevelI: 0,
  lastWinLevelII: 0,
  lastWinLevelIII: 0,
  lastWinLevelIV: 0,
  largestWinDateLevelI: '',
  largestWinDateLevelII: '',
  largestWinDateLevelIII: '',
  largestWinDateLevelIV: '',
  largestWinUserLevelI: '',
  largestWinUserLevelII: '',
  largestWinUserLevelIII: '',
  largestWinUserLevelIV: '',
  lastWinDateLevelI: '',
  lastWinDateLevelII: '',
  lastWinDateLevelIII: '',
  lastWinDateLevelIV: '',
  lastWinUserLevelI: '',
  lastWinUserLevelII: '',
  lastWinUserLevelIII: '',
  lastWinUserLevelIV: ''
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSeed() {
  return crypto.randomBytes(8).readBigUInt64BE(0);
}

function randomFloat(state) {
  state.value = (state.value * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
  return Number(state.value >> 11n) / Number(1n << 53n);
}

function randomInt(state, maxExclusive) {
  return Math.floor(randomFloat(state) * maxExclusive);
}

function discoverGames(rootDir) {
  const gamesRoot = path.join(rootDir, 'ActionMoneyEGT', 'html5', 'games');
  const games = [];
  if (!fs.existsSync(gamesRoot)) {
    return games;
  }

  const engineTypes = fs.readdirSync(gamesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let gameId = DEFAULT_GAME_IDENTIFICATION_NUMBER;
  for (const engineType of engineTypes) {
    const enginePath = path.join(gamesRoot, engineType);
    const gameTypes = fs.readdirSync(enginePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const gameType of gameTypes) {
      const configPath = path.join(enginePath, gameType, 'Config.js');
      if (!fs.existsSync(configPath)) {
        continue;
      }
      games.push(buildGameDefinition({
        engineType,
        gameType,
        gameIdentificationNumber: gameId,
        gameName: engineType
      }));
      gameId += 1;
    }
  }

  if (!games.length) {
    games.push(buildGameDefinition({
      engineType: DEFAULT_ENGINE_TYPE,
      gameType: DEFAULT_GAME_TYPE,
      gameIdentificationNumber: DEFAULT_GAME_IDENTIFICATION_NUMBER,
      gameName: DEFAULT_GAME_NAME
    }));
  }

  return games;
}

function buildGameDefinition({ engineType, gameType, gameIdentificationNumber, gameName }) {
  const displayName = humanizeGameName(gameName);
  const settings = createGameSettings({ engineType, gameType });
  return {
    engineType,
    gameType,
    gameName,
    displayName,
    gameIdentificationNumber,
    featured: true,
    recovery: 'norecovery',
    mlmJackpot: false,
    groups: [{ name: 'slots' }],
    bonusSpins: { remainingBonusSpins: 0, statusCode: 'success' },
    iData: {
      gameName,
      gameType,
      engineType,
      playerName: DEFAULT_PLAYER_NAME,
      lastBet: settings.denominations[0][0],
      lastDenomination: settings.denominations[0][0],
      gameNumber: 0
    },
    settings,
    initialState: createIdleCurrentState(settings),
    jackpotState: clone(DEFAULT_JACKPOT_STATE)
  };
}

function humanizeGameName(gameName) {
  return String(gameName || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Game';
}

function createGameSettings({ engineType, gameType }) {
  return {
    paytableCoef: clone(DEFAULT_PAYTABLE),
    rtp: '96.45',
    bets: clone(DEFAULT_BETS),
    jackpotMinBet: 500,
    jackpot: false,
    lines: [5],
    lineGame: true,
    linesCount: [1, 5, 10, 15, 20],
    mainFakeReels: clone(DEFAULT_FAKE_REELS),
    jackpotMaxBet: 1000,
    denominations: clone(DEFAULT_DENOMINATIONS),
    autoplayLimit: [0, 10, 25, 50],
    sendTotalsInfo: false,
    minimumSpinTime: 0,
    gameVersion: `${gameNameForSettings(engineType)} v: ${DEFAULT_GAME_VERSION}.r`,
    gameType,
    engineType
  };
}

function gameNameForSettings(engineType) {
  return String(engineType || DEFAULT_GAME_NAME);
}

function createIdleCurrentState(settings) {
  return {
    gamblesUsed: 0,
    previousGambles: [],
    bet: settings.denominations[0][0],
    numberOfLines: settings.lines[0],
    denomination: settings.denominations[0][0],
    state: 'idle',
    winAmount: 0,
    reels: clone(DEFAULT_IDLE_REELS),
    lines: [],
    combos: [],
    scatters: [],
    expand: [],
    gambles: 0,
    jackpot: false,
    freespins: 0,
    freespinsUsed: 0,
    freespinScatters: [],
    freespinsPerLine: null,
    respin: false,
    holdReels: null
  };
}

class SessionStore {
  constructor(games, defaults = {}) {
    this.games = games;
    this.sessions = new Map();
    this.defaults = {
      balance: normalizeNumber(defaults.balance, DEFAULT_BALANCE),
      currency: defaults.currency || DEFAULT_CURRENCY,
      language: defaults.language || DEFAULT_LANGUAGE,
      playerName: defaults.playerName || DEFAULT_PLAYER_NAME
    };
  }

  createSession(input = {}) {
    const id = String(input.id || crypto.randomUUID());
    const session = {
      id,
      sessionKey: String(input.sessionKey || `LOCAL:${id}`),
      playerName: String(input.playerName || this.defaults.playerName),
      balance: normalizeNumber(input.balance, this.defaults.balance),
      currency: String(input.currency || this.defaults.currency),
      language: String(input.language || this.defaults.language),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      games: {}
    };

    for (const game of this.games) {
      session.games[game.gameIdentificationNumber] = {
        gameNumber: 0,
        state: clone(game.initialState),
        jackpotState: clone(game.jackpotState),
        lastUpdatedAt: session.updatedAt,
        rng: { value: createSeed() }
      };
    }

    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    return this.sessions.get(String(id));
  }

  ensureSession(id, input = {}) {
    if (id) {
      const existing = this.getSession(id);
      if (existing) {
        return existing;
      }
      return this.createSession({ ...input, id });
    }
    return this.createSession(input);
  }

  updateBalance(id, nextBalance) {
    const session = this.getSession(id);
    if (!session) {
      return null;
    }
    session.balance = normalizeNumber(nextBalance, session.balance);
    session.updatedAt = new Date().toISOString();
    return session;
  }
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    let settled = false;

    function finish(callback, value) {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    }

    req.on('data', (chunk) => {
      if (settled) {
        return;
      }
      totalLength += chunk.length;
      if (totalLength > 1024 * 1024) {
        finish(reject, new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) {
        return;
      }
      if (!chunks.length) {
        finish(resolve, {});
        return;
      }
      try {
        finish(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        finish(reject, new Error('Invalid JSON body.'));
      }
    });
    req.on('error', (error) => finish(reject, error));
  });
}

function writeJsonFrame(ws, payload) {
  ws.send(`:::${JSON.stringify(payload)}`);
}

function parseIncomingFrame(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  if (text === '1::') {
    return null;
  }
  const payload = text.startsWith(':::') ? text.slice(3) : text;
  return JSON.parse(payload);
}

function toResponseMessageId(requestMessageId) {
  return typeof requestMessageId === 'string' && requestMessageId ? requestMessageId : `r-r_${crypto.randomUUID()}`;
}

function buildLoginResponse(request, session, games) {
  const complex = {};
  for (const game of games) {
    const entry = {
      gameIdentificationNumber: game.gameIdentificationNumber,
      gameName: game.displayName,
      displayName: game.displayName,
      groups: clone(game.groups),
      recovery: game.recovery,
      featured: game.featured,
      mlmJackpot: game.mlmJackpot,
      bonusSpins: clone(game.bonusSpins)
    };
    if (!complex[game.gameType]) {
      complex[game.gameType] = [];
    }
    complex[game.gameType].push(entry);
  }

  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'login',
    qName: RESPONSE_QNAMES.login,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    playerName: session.playerName,
    currency: session.currency,
    languages: ['en', 'es', 'pt', 'ro', 'bg'],
    groups: clone(DEFAULT_GROUPS),
    showRtp: true,
    multigame: games.length > 1,
    autoplayLimit: [0, 10, 25, 50],
    minimumSpinTime: 0,
    sendTotalsInfo: false,
    complex
  };
}

function buildSettingsResponse(request, session, game) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'settings',
    qName: RESPONSE_QNAMES.game,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: sessionGame.gameNumber,
    complex: clone(game.settings)
  };
}

function buildSubscribeResponse(request, session, game) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'subscribe',
    qName: RESPONSE_QNAMES.game,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: sessionGame.gameNumber,
    complex: {
      currentState: clone(sessionGame.state),
      jackpotState: clone(sessionGame.jackpotState)
    }
  };
}

function buildPingResponse(request) {
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'ping',
    qName: RESPONSE_QNAMES.base,
    eventTimestamp: Date.now(),
    msg: 'success'
  };
}

function buildUnsubscribeResponse(request, session, game) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'unsubscribe',
    qName: RESPONSE_QNAMES.game,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: sessionGame.gameNumber,
    complex: {
      currentState: clone(sessionGame.state)
    }
  };
}

function buildInsufficientFundsResponse(request, session, game) {
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'bet',
    qName: RESPONSE_QNAMES.gameEvent,
    eventTimestamp: Date.now(),
    msg: 'insufficientFunds',
    balance: session.balance,
    state: 'idle',
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: session.games[game.gameIdentificationNumber].gameNumber,
    complex: {
      gameCommand: 'bet'
    }
  };
}

function buildBetResponse(request, session, game, nextState, winAmount, gameCommand) {
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'bet',
    qName: RESPONSE_QNAMES.gameEvent,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    winAmount,
    state: nextState.state,
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: session.games[game.gameIdentificationNumber].gameNumber,
    complex: {
      gameCommand,
      jackpot: false,
      reels: clone(nextState.reels),
      lines: clone(nextState.lines),
      combos: clone(nextState.combos),
      scatters: clone(nextState.scatters),
      expand: clone(nextState.expand),
      gambles: nextState.gambles,
      freespins: nextState.freespins,
      freespinScatters: clone(nextState.freespinScatters)
    }
  };
}

function buildFailureResponse(request, reason) {
  return {
    messageId: toResponseMessageId(request && request.messageId),
    command: request && request.command ? request.command : 'event',
    qName: RESPONSE_QNAMES.base,
    eventTimestamp: Date.now(),
    msg: 'failure',
    reason
  };
}

function generateRandomReels(state) {
  const reels = [];
  for (let index = 0; index < DEFAULT_IDLE_REELS.length; index += 1) {
    reels.push(randomInt(state, DEFAULT_SYMBOL_COUNT));
  }
  return reels;
}

function createWinningLine(reels, winAmount) {
  const card = Number(reels[1] || 0);
  return [{
    line: 0,
    cells: [0, 0, 1, 0, 2, 0, 3, 0, 4, 0],
    winAmount,
    card
  }];
}

function validateBetPayload(game, denomination, numberOfLines, betAmount) {
  const supportedDenominations = game.settings.denominations.map((entry) => Number(entry[0]));
  if (!supportedDenominations.includes(denomination)) {
    return `Unsupported denomination: ${denomination}`;
  }

  const supportedLines = game.settings.lineGame
    ? game.settings.linesCount.map((value) => Number(value))
    : game.settings.lines.map((value) => Number(value));
  if (!supportedLines.includes(numberOfLines)) {
    return `Unsupported line count: ${numberOfLines}`;
  }

  if (betAmount < denomination || betAmount % denomination !== 0) {
    return `Unsupported bet amount: ${betAmount}`;
  }

  const betUnits = betAmount / denomination;
  if (!game.settings.bets.map((value) => Number(value)).includes(betUnits)) {
    return `Unsupported bet amount: ${betAmount}`;
  }

  return null;
}

function handleSpin(request, session, game) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  const betPayload = request.bet || {};
  const previousState = sessionGame.state;
  const denomination = normalizeNumber(betPayload.denomination, previousState.denomination || game.settings.denominations[0][0]);
  const numberOfLines = normalizeNumber(betPayload.numberOfLines, previousState.numberOfLines || game.settings.lines[0]);
  const betAmount = normalizeNumber(betPayload.bet, previousState.bet || denomination);
  const validationError = validateBetPayload(game, denomination, numberOfLines, betAmount);
  if (validationError) {
    return buildFailureResponse(request, validationError);
  }
  const totalBet = Math.max(denomination, betAmount) * Math.max(1, numberOfLines);

  if (session.balance < totalBet) {
    return buildInsufficientFundsResponse(request, session, game);
  }

  session.balance -= totalBet;
  const reels = generateRandomReels(sessionGame.rng);
  const shouldWin = randomFloat(sessionGame.rng) >= 0.68;
  const winMultiplier = shouldWin ? 1 + randomInt(sessionGame.rng, 6) : 0;
  const winAmount = shouldWin ? totalBet * winMultiplier : 0;
  if (winAmount > 0) {
    session.balance += winAmount;
  }

  const nextState = {
    ...clone(previousState),
    state: 'idle',
    bet: betAmount,
    denomination,
    numberOfLines,
    winAmount,
    reels,
    lines: shouldWin ? createWinningLine(reels, winAmount) : [],
    combos: shouldWin ? createWinningLine(reels, winAmount) : [],
    scatters: [],
    expand: [],
    gambles: 0,
    jackpot: false,
    freespins: 0,
    freespinsUsed: 0,
    freespinScatters: [],
    freespinsPerLine: null,
    previousGambles: [],
    gamblesUsed: 0,
    respin: false,
    holdReels: null
  };

  sessionGame.state = nextState;
  session.updatedAt = new Date().toISOString();
  sessionGame.lastUpdatedAt = session.updatedAt;

  return buildBetResponse(request, session, game, nextState, winAmount, 'bet');
}

function handleCollect(request, session, game) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  sessionGame.state = {
    ...clone(sessionGame.state),
    state: 'idle',
    winAmount: 0,
    previousGambles: [],
    gambles: 0,
    gamblesUsed: 0
  };
  session.updatedAt = new Date().toISOString();
  sessionGame.lastUpdatedAt = session.updatedAt;
  return buildBetResponse(request, session, game, sessionGame.state, 0, 'collect');
}

function handleNoopBet(request, session, game, gameCommand) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  session.updatedAt = new Date().toISOString();
  sessionGame.lastUpdatedAt = session.updatedAt;
  return buildBetResponse(request, session, game, sessionGame.state, 0, gameCommand);
}

function sanitizeSessionForApi(session) {
  return {
    id: session.id,
    sessionKey: session.sessionKey,
    playerName: session.playerName,
    balance: session.balance,
    currency: session.currency,
    language: session.language,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function buildLaunchUrl(session, gameName) {
  const encodedGame = encodeURIComponent(gameName || DEFAULT_GAME_NAME);
  const encodedSessionId = encodeURIComponent(session.id);
  return `/ActionMoneyEGT/html5/index.html?game=${encodedGame}&sessionId=${encodedSessionId}`;
}

function extractSessionId(request) {
  if (request && typeof request.sessionId === 'string' && request.sessionId.trim()) {
    return request.sessionId.trim();
  }
  return null;
}

function parsePathname(requestUrl) {
  return new URL(requestUrl, 'http://localhost').pathname;
}

function sendApiJson(res, statusCode, body, shouldSendBody) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(shouldSendBody ? JSON.stringify(body) : undefined);
}

function findGameById(games, gameIdentificationNumber) {
  const numericId = Number(gameIdentificationNumber);
  return games.find((game) => game.gameIdentificationNumber === numericId) || null;
}

function createBackend(options) {
  const rootDir = options.rootDir;
  const games = discoverGames(rootDir);
  const sessionStore = new SessionStore(games, options.defaults);
  const sockets = new Set();
  const webSocketServer = new WebSocketServer({ noServer: true });

  webSocketServer.on('connection', (ws) => {
    sockets.add(ws);
    ws.send('1::');

    ws.on('message', (rawMessage) => {
      let request;
      try {
        request = parseIncomingFrame(rawMessage);
      } catch (error) {
        writeJsonFrame(ws, {
          messageId: `r-r_${crypto.randomUUID()}`,
          command: 'event',
          qName: RESPONSE_QNAMES.base,
          msg: 'failure',
          reason: error.message
        });
        return;
      }

      if (!request) {
        return;
      }

      const sessionId = extractSessionId(request) || 'demo-session';
      const session = sessionId === 'demo-session'
        ? sessionStore.ensureSession('demo-session')
        : sessionStore.getSession(sessionId);
      if (!session) {
        writeJsonFrame(ws, buildFailureResponse(request, `Unknown session: ${sessionId}`));
        return;
      }
      const game = findGameById(games, request.gameIdentificationNumber) || games[0];
      let response;

      switch (request.command) {
        case 'login':
          response = buildLoginResponse(request, session, games);
          break;
        case 'settings':
          response = buildSettingsResponse(request, session, game);
          break;
        case 'subscribe':
          response = buildSubscribeResponse(request, session, game);
          break;
        case 'unsubscribe':
          response = buildUnsubscribeResponse(request, session, game);
          break;
        case 'ping':
          response = buildPingResponse(request);
          break;
        case 'bet': {
          const gameCommand = request.bet && request.bet.gameCommand ? request.bet.gameCommand : 'bet';
          if (gameCommand === 'bet' || gameCommand === 'setResult') {
            response = handleSpin(request, session, game);
          } else if (gameCommand === 'collect') {
            response = handleCollect(request, session, game);
          } else {
            response = handleNoopBet(request, session, game, gameCommand);
          }
          break;
        }
        default:
          response = {
            messageId: toResponseMessageId(request.messageId),
            command: request.command || 'event',
            qName: RESPONSE_QNAMES.base,
            eventTimestamp: Date.now(),
            msg: 'failure',
            reason: `Unsupported command: ${request.command || 'unknown'}`
          };
      }

      writeJsonFrame(ws, response);
    });

    ws.on('close', () => {
      sockets.delete(ws);
    });

    ws.on('error', () => {
      sockets.delete(ws);
    });
  });

  return {
    games,
    sessionStore,
    async handleApiRequest(req, res, pathname, shouldSendBody) {
      if (pathname === '/api/games') {
        if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
          return true;
        }
        sendApiJson(res, 200, {
          games: games.map((game) => ({
            gameIdentificationNumber: game.gameIdentificationNumber,
            engineType: game.engineType,
            gameType: game.gameType,
            gameName: game.gameName,
            displayName: game.displayName,
            launchUrl: buildLaunchUrl(sessionStore.ensureSession('demo-session'), game.gameName)
          }))
        }, shouldSendBody);
        return true;
      }

      if (pathname === '/api/sessions') {
        if (req.method === 'POST') {
          try {
            const payload = await readJsonBody(req);
            const session = sessionStore.createSession(payload);
            sendApiJson(res, 201, {
              session: sanitizeSessionForApi(session),
              launchUrl: buildLaunchUrl(session, payload.gameName || games[0].gameName),
              games: games.map((game) => ({
                gameIdentificationNumber: game.gameIdentificationNumber,
                gameName: game.gameName,
                gameType: game.gameType,
                engineType: game.engineType
              }))
            }, shouldSendBody);
          } catch (error) {
            sendApiJson(res, 400, { error: error.message }, shouldSendBody);
          }
          return true;
        }

        if (['GET', 'HEAD'].includes(req.method || 'GET')) {
          sendApiJson(res, 200, {
            sessions: Array.from(sessionStore.sessions.values()).map((session) => sanitizeSessionForApi(session))
          }, shouldSendBody);
          return true;
        }

        res.setHeader('Allow', 'GET, HEAD, POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }

      const balanceMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/balance$/);
      if (balanceMatch) {
        let sessionId;
        try {
          sessionId = decodeURIComponent(balanceMatch[1]);
        } catch (error) {
          sendApiJson(res, 400, { error: 'Invalid session id.' }, shouldSendBody);
          return true;
        }
        const session = sessionStore.getSession(sessionId);
        if (!session) {
          sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
          return true;
        }

        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
          return true;
        }
        try {
          const payload = await readJsonBody(req);
          const nextBalance = payload.balance !== undefined
            ? payload.balance
            : session.balance + normalizeNumber(payload.amount, 0);
          const updated = sessionStore.updateBalance(sessionId, nextBalance);
          sendApiJson(res, 200, { session: sanitizeSessionForApi(updated) }, shouldSendBody);
        } catch (error) {
          sendApiJson(res, 400, { error: error.message }, shouldSendBody);
        }
        return true;
      }

      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        let sessionId;
        try {
          sessionId = decodeURIComponent(sessionMatch[1]);
        } catch (error) {
          sendApiJson(res, 400, { error: 'Invalid session id.' }, shouldSendBody);
          return true;
        }
        const session = sessionStore.getSession(sessionId);
        if (!session) {
          sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
          return true;
        }
        if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
          return true;
        }

        sendApiJson(res, 200, {
          session: sanitizeSessionForApi(session),
          launchUrl: buildLaunchUrl(session, games[0].gameName)
        }, shouldSendBody);
        return true;
      }

      return false;
    },
    handleUpgrade(req, socket, head) {
      if ((req.method || 'GET') !== 'GET') {
        socket.destroy();
        return;
      }
      const pathname = parsePathname(req.url || '/');
      if (pathname !== '/' && pathname !== '/ws') {
        socket.destroy();
        return;
      }
      webSocketServer.handleUpgrade(req, socket, head, (ws) => {
        webSocketServer.emit('connection', ws, req);
      });
    },
    shutdown() {
      for (const ws of sockets) {
        try {
          ws.close();
        } catch (error) {
          // ignore socket close errors during shutdown
        }
      }
      webSocketServer.close();
    }
  };
}

module.exports = {
  createBackend,
  discoverGames,
  parsePathname
};
