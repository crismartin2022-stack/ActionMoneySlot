const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');
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
const DEFAULT_API_BASE = '/api';
const SHUTDOWN_TIMEOUT_MS = 5000;
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

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isFiniteNumberInput(value) {
  return Number.isFinite(Number(value));
}

function humanizeGameName(gameName) {
  return String(gameName || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Game';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value) || !value.length) {
    return clone(fallback);
  }
  return value.slice();
}

function normalizeDenominations(value) {
  if (!Array.isArray(value) || !value.length) {
    return clone(DEFAULT_DENOMINATIONS);
  }
  const normalized = value
    .filter((entry) => Array.isArray(entry) && entry.length >= 1)
    .map((entry) => entry.map((item) => normalizeNumber(item, item)));
  return normalized.length ? normalized : clone(DEFAULT_DENOMINATIONS);
}

function loadGameConfig(configPath) {
  const source = fs.readFileSync(configPath, 'utf8');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    com: {
      egt: {
        baseslot: {},
        cascadeslot: {}
      }
    },
    window: {
      com: {
        egt: {
          baseslot: {},
          cascadeslot: {}
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: configPath });

  const configCtor = sandbox.com?.egt?.baseslot?.Config
    || sandbox.window?.com?.egt?.baseslot?.Config
    || sandbox.Config;
  const buildTime = sandbox.com?.egt?.cascadeslot?.buildTime
    || sandbox.window?.com?.egt?.cascadeslot?.buildTime
    || null;

  if (typeof configCtor !== 'function') {
    return { buildTime: null, settings: {} };
  }

  return {
    buildTime,
    settings: clone(new configCtor())
  };
}

function createGameSettings({ engineType, gameType, staticSettings, buildTime }) {
  const linesCount = Array.isArray(staticSettings.linesCount) && staticSettings.linesCount.length
    ? staticSettings.linesCount.map((value) => normalizeNumber(value, value))
    : [1, 5, 10, 15, 20];
  const baseLineCount = linesCount.includes(5) ? 5 : linesCount[0];
  const normalizedStaticSettings = staticSettings || {};

  return {
    ...clone(normalizedStaticSettings),
    paytableCoef: normalizedStaticSettings.paytableCoef || clone(DEFAULT_PAYTABLE),
    rtp: String(normalizedStaticSettings.rtp || '96.45'),
    bets: normalizeStringArray(normalizedStaticSettings.bets, DEFAULT_BETS).map((value) => normalizeNumber(value, value)),
    jackpotMinBet: normalizeNumber(normalizedStaticSettings.jackpotMinBet, 500),
    jackpot: Boolean(normalizedStaticSettings.jackpot),
    lines: Array.isArray(normalizedStaticSettings.lines) && normalizedStaticSettings.lines.length
      ? normalizedStaticSettings.lines.map((value) => normalizeNumber(value, value))
      : [baseLineCount],
    lineGame: normalizedStaticSettings.lineGame !== false,
    linesCount,
    mainFakeReels: Array.isArray(normalizedStaticSettings.mainFakeReels) && normalizedStaticSettings.mainFakeReels.length
      ? clone(normalizedStaticSettings.mainFakeReels)
      : clone(DEFAULT_FAKE_REELS),
    jackpotMaxBet: normalizeNumber(normalizedStaticSettings.jackpotMaxBet, 1000),
    denominations: normalizeDenominations(normalizedStaticSettings.denominations),
    autoplayLimit: Array.isArray(normalizedStaticSettings.autoplayLimit) && normalizedStaticSettings.autoplayLimit.length
      ? normalizedStaticSettings.autoplayLimit.map((value) => normalizeNumber(value, value))
      : [0, 10, 25, 50],
    sendTotalsInfo: Boolean(normalizedStaticSettings.sendTotalsInfo),
    minimumSpinTime: normalizeNumber(normalizedStaticSettings.minimumSpinTime, 0),
    gameVersion: String(
      normalizedStaticSettings.gameVersion
      || `${engineType} v: ${buildTime || DEFAULT_GAME_VERSION}.r`
    ),
    gameType,
    engineType
  };
}

function createIdleCurrentState(settings) {
  const defaultDenomination = settings.denominations[0][0];
  const defaultLines = settings.lineGame
    ? (settings.linesCount.includes(5) ? 5 : settings.linesCount[0])
    : settings.lines[0];

  return {
    gamblesUsed: 0,
    previousGambles: [],
    bet: defaultDenomination,
    numberOfLines: defaultLines,
    denomination: defaultDenomination,
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

function buildGameDefinition({ engineType, gameType, gameIdentificationNumber, gameName, staticSettings, buildTime }) {
  const displayName = humanizeGameName(gameName);
  const settings = createGameSettings({ engineType, gameType, staticSettings, buildTime });
  const initialState = createIdleCurrentState(settings);
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
    buildTime,
    staticConfig: staticSettings,
    iData: {
      gameName,
      gameType,
      engineType,
      playerName: DEFAULT_PLAYER_NAME,
      lastBet: initialState.bet,
      lastDenomination: initialState.denomination,
      gameNumber: 0
    },
    settings,
    initialState,
    jackpotState: clone(DEFAULT_JACKPOT_STATE)
  };
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
      const loadedConfig = loadGameConfig(configPath);
      games.push(buildGameDefinition({
        engineType,
        gameType,
        gameIdentificationNumber: gameId,
        gameName: engineType,
        staticSettings: loadedConfig.settings,
        buildTime: loadedConfig.buildTime
      }));
      gameId += 1;
    }
  }

  if (!games.length) {
    games.push(buildGameDefinition({
      engineType: DEFAULT_ENGINE_TYPE,
      gameType: DEFAULT_GAME_TYPE,
      gameIdentificationNumber: DEFAULT_GAME_IDENTIFICATION_NUMBER,
      gameName: DEFAULT_GAME_NAME,
      staticSettings: {},
      buildTime: DEFAULT_GAME_VERSION
    }));
  }

  return games;
}

function hasGameSelectionInput(input = {}) {
  return ['gameIdentificationNumber', 'gameType', 'gameName'].some((key) => {
    const value = input[key];
    return value !== undefined && value !== null && value !== '';
  });
}

function resolveGameSelection(games, input = {}, options = {}) {
  if (input.gameIdentificationNumber !== undefined && input.gameIdentificationNumber !== null) {
    const byId = games.find((game) => game.gameIdentificationNumber === Number(input.gameIdentificationNumber));
    if (byId) {
      return byId;
    }
  }

  if (input.gameType) {
    const gameType = String(input.gameType).toLowerCase();
    const byType = games.find((game) => game.gameType.toLowerCase() === gameType);
    if (byType) {
      return byType;
    }
  }

  if (input.gameName) {
    const gameName = String(input.gameName).toLowerCase();
    const byName = games.find((game) => game.gameName.toLowerCase() === gameName);
    if (byName) {
      return byName;
    }
  }

  if (options.allowDefault === false) {
    return null;
  }

  return games[0] || null;
}

function serializeRngValue(state) {
  return String((state && state.value) || createSeed());
}

class SessionStore {
  constructor(games, options = {}) {
    this.games = games;
    this.sessions = new Map();
    this.defaults = {
      balance: normalizeNumber(options.balance, DEFAULT_BALANCE),
      currency: options.currency || DEFAULT_CURRENCY,
      language: options.language || DEFAULT_LANGUAGE,
      playerName: options.playerName || DEFAULT_PLAYER_NAME
    };
    this.dbPath = options.dbPath || path.join(options.rootDir, 'data', 'action-money-slot.sqlite');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
    this.prepareStatements();
    this.loadSessions();
    this.ensureDemoSession();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        player_name TEXT NOT NULL,
        balance REAL NOT NULL,
        currency TEXT NOT NULL,
        language TEXT NOT NULL,
        selected_game_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_games (
        session_id TEXT NOT NULL,
        game_identification_number INTEGER NOT NULL,
        game_number INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        jackpot_state_json TEXT NOT NULL,
        rng_value TEXT NOT NULL,
        last_updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, game_identification_number),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  prepareStatements() {
    this.statements = {
      selectSessions: this.db.prepare('SELECT * FROM sessions ORDER BY created_at ASC'),
      selectSessionGames: this.db.prepare('SELECT * FROM session_games ORDER BY session_id ASC, game_identification_number ASC'),
      upsertSession: this.db.prepare(`
        INSERT INTO sessions (id, session_key, player_name, balance, currency, language, selected_game_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_key = excluded.session_key,
          player_name = excluded.player_name,
          balance = excluded.balance,
          currency = excluded.currency,
          language = excluded.language,
          selected_game_id = excluded.selected_game_id,
          updated_at = excluded.updated_at
      `),
      upsertSessionGame: this.db.prepare(`
        INSERT INTO session_games (session_id, game_identification_number, game_number, state_json, jackpot_state_json, rng_value, last_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, game_identification_number) DO UPDATE SET
          game_number = excluded.game_number,
          state_json = excluded.state_json,
          jackpot_state_json = excluded.jackpot_state_json,
          rng_value = excluded.rng_value,
          last_updated_at = excluded.last_updated_at
      `),
      deleteSession: this.db.prepare('DELETE FROM sessions WHERE id = ?')
    };
  }

  loadSessions() {
    this.sessions.clear();
    const sessionRows = this.statements.selectSessions.all();
    const sessionGameRows = this.statements.selectSessionGames.all();
    const gameRowsBySession = new Map();

    for (const row of sessionGameRows) {
      if (!gameRowsBySession.has(row.session_id)) {
        gameRowsBySession.set(row.session_id, []);
      }
      gameRowsBySession.get(row.session_id).push(row);
    }

    for (const row of sessionRows) {
      const selectedGame = this.findGameById(row.selected_game_id) || this.games[0];
      const session = {
        id: row.id,
        sessionKey: row.session_key,
        playerName: row.player_name,
        balance: Number(row.balance),
        currency: row.currency,
        language: row.language,
        selectedGameId: selectedGame ? selectedGame.gameIdentificationNumber : DEFAULT_GAME_IDENTIFICATION_NUMBER,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        games: {}
      };

      const perGameRows = gameRowsBySession.get(row.id) || [];
      for (const game of this.games) {
        const stored = perGameRows.find((entry) => entry.game_identification_number === game.gameIdentificationNumber);
        if (stored) {
          session.games[game.gameIdentificationNumber] = {
            gameNumber: Number(stored.game_number),
            state: JSON.parse(stored.state_json),
            jackpotState: JSON.parse(stored.jackpot_state_json),
            lastUpdatedAt: stored.last_updated_at,
            rng: { value: BigInt(stored.rng_value) }
          };
        } else {
          session.games[game.gameIdentificationNumber] = this.createDefaultSessionGame(game, row.updated_at);
        }
      }

      this.sessions.set(session.id, session);
      if (perGameRows.length < this.games.length) {
        this.persistSession(session);
      }
    }
  }

  createDefaultSessionGame(game, timestamp) {
    return {
      gameNumber: 0,
      state: clone(game.initialState),
      jackpotState: clone(game.jackpotState),
      lastUpdatedAt: timestamp,
      rng: { value: createSeed() }
    };
  }

  ensureDemoSession() {
    if (!this.getSession('demo-session')) {
      this.createSession({
        id: 'demo-session',
        sessionKey: 'LOCAL:demo-session',
        playerName: 'demo-player'
      });
    }
  }

  createSession(input = {}) {
    const selectedGame = resolveGameSelection(this.games, input);
    const id = String(input.id || crypto.randomUUID());
    if (input.id && this.sessions.has(id)) {
      throw new Error('Session already exists.');
    }
    const now = new Date().toISOString();
    const session = {
      id,
      sessionKey: String(input.sessionKey || `LOCAL:${id}`),
      playerName: String(input.playerName || this.defaults.playerName),
      balance: normalizeNumber(input.balance, this.defaults.balance),
      currency: String(input.currency || this.defaults.currency),
      language: String(input.language || this.defaults.language),
      selectedGameId: selectedGame ? selectedGame.gameIdentificationNumber : DEFAULT_GAME_IDENTIFICATION_NUMBER,
      createdAt: now,
      updatedAt: now,
      games: {}
    };

    for (const game of this.games) {
      session.games[game.gameIdentificationNumber] = this.createDefaultSessionGame(game, now);
    }

    this.sessions.set(id, session);
    this.persistSession(session);
    return session;
  }

  persistSession(session) {
    this.statements.upsertSession.run(
      session.id,
      session.sessionKey,
      session.playerName,
      session.balance,
      session.currency,
      session.language,
      session.selectedGameId,
      session.createdAt,
      session.updatedAt
    );

    for (const game of this.games) {
      const state = session.games[game.gameIdentificationNumber] || this.createDefaultSessionGame(game, session.updatedAt);
      session.games[game.gameIdentificationNumber] = state;
      this.statements.upsertSessionGame.run(
        session.id,
        game.gameIdentificationNumber,
        state.gameNumber,
        JSON.stringify(state.state),
        JSON.stringify(state.jackpotState),
        serializeRngValue(state.rng),
        state.lastUpdatedAt
      );
    }
  }

  listSessions() {
    return Array.from(this.sessions.values());
  }

  getSession(id) {
    return this.sessions.get(String(id));
  }

  ensureSession(id, input = {}) {
    const sessionId = String(id || '');
    const existing = sessionId ? this.getSession(sessionId) : null;
    if (existing) {
      return existing;
    }
    if (!sessionId || sessionId !== 'demo-session') {
      return null;
    }
    return this.createSession({ ...input, id: sessionId, sessionKey: `LOCAL:${sessionId}` });
  }

  updateBalance(id, nextBalance) {
    const session = this.getSession(id);
    if (!session) {
      return null;
    }
    session.balance = normalizeNumber(nextBalance, session.balance);
    session.updatedAt = new Date().toISOString();
    this.persistSession(session);
    return session;
  }

  setSelectedGame(id, gameIdentificationNumber) {
    const session = this.getSession(id);
    if (!session) {
      return null;
    }
    session.selectedGameId = Number(gameIdentificationNumber);
    session.updatedAt = new Date().toISOString();
    this.persistSession(session);
    return session;
  }

  saveSessionGame(session, gameIdentificationNumber) {
    const state = session.games[gameIdentificationNumber];
    if (!state) {
      return;
    }
    session.updatedAt = new Date().toISOString();
    state.lastUpdatedAt = session.updatedAt;
    this.persistSession(session);
  }

  close() {
    this.db.close();
  }

  findGameById(gameIdentificationNumber) {
    return this.games.find((game) => game.gameIdentificationNumber === Number(gameIdentificationNumber)) || null;
  }
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

function buildGameCatalogEntry(game, session, apiBase) {
  return {
    gameIdentificationNumber: game.gameIdentificationNumber,
    engineType: game.engineType,
    gameType: game.gameType,
    gameName: game.gameName,
    displayName: game.displayName,
    buildTime: game.buildTime,
    settings: clone(game.settings),
    launchUrl: buildLaunchUrl(session, game, apiBase)
  };
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

function generateRandomReels(state, game) {
  const reels = [];
  const maxSymbolCount = normalizeNumber(game.settings.numImages, DEFAULT_SYMBOL_COUNT);
  const reelLength = normalizeNumber(game.settings.numReels, 5) * (normalizeNumber(game.settings.numReelCards, 3) + 2);
  for (let index = 0; index < reelLength; index += 1) {
    reels.push(randomInt(state, maxSymbolCount));
  }
  return reels;
}

function createWinningLine(reels, winAmount, lineIndex = 0) {
  const card = Number(reels[1] || 0);
  return [{
    line: lineIndex,
    cells: [0, 0, 1, 0, 2, 0, 3, 0, 4, 0],
    winAmount,
    card
  }];
}

function validateBetPayload(game, denomination, numberOfLines, betPerLine) {
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

  if (betPerLine < denomination || betPerLine % denomination !== 0) {
    return `Unsupported bet amount: ${betPerLine}`;
  }

  const betUnits = betPerLine / denomination;
  if (!game.settings.bets.map((value) => Number(value)).includes(betUnits)) {
    return `Unsupported bet amount: ${betPerLine}`;
  }

  return null;
}

function handleSpin(request, session, game, sessionStore) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  const betPayload = request.bet || {};
  const previousState = sessionGame.state;
  const denomination = normalizeNumber(betPayload.denomination, previousState.denomination || game.settings.denominations[0][0]);
  const numberOfLines = normalizeNumber(
    betPayload.lines !== undefined ? betPayload.lines : betPayload.numberOfLines,
    previousState.numberOfLines || game.settings.lines[0]
  );
  const betPerLine = normalizeNumber(betPayload.bet, previousState.bet || denomination);
  const validationError = validateBetPayload(game, denomination, numberOfLines, betPerLine);
  if (validationError) {
    return buildFailureResponse(request, validationError);
  }

  const totalBet = betPerLine * Math.max(1, numberOfLines);
  if (session.balance < totalBet) {
    return buildInsufficientFundsResponse(request, session, game);
  }

  session.balance -= totalBet;
  const reels = generateRandomReels(sessionGame.rng, game);
  const shouldWin = randomFloat(sessionGame.rng) >= 0.68;
  const winMultiplier = shouldWin ? 1 + randomInt(sessionGame.rng, 6) : 0;
  const winAmount = shouldWin ? totalBet * winMultiplier : 0;
  if (winAmount > 0) {
    session.balance += winAmount;
  }

  const nextState = {
    ...clone(previousState),
    state: 'idle',
    bet: betPerLine,
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
  sessionStore.saveSessionGame(session, game.gameIdentificationNumber);
  return buildBetResponse(request, session, game, nextState, winAmount, 'bet');
}

function handleCollect(request, session, game, sessionStore) {
  const sessionGame = session.games[game.gameIdentificationNumber];
  sessionGame.state = {
    ...clone(sessionGame.state),
    state: 'idle',
    winAmount: 0,
    previousGambles: [],
    gambles: 0,
    gamblesUsed: 0
  };
  sessionStore.saveSessionGame(session, game.gameIdentificationNumber);
  return buildBetResponse(request, session, game, sessionGame.state, 0, 'collect');
}

function handleNoopBet(request, session, game, sessionStore, gameCommand) {
  sessionStore.saveSessionGame(session, game.gameIdentificationNumber);
  return buildBetResponse(request, session, game, session.games[game.gameIdentificationNumber].state, 0, gameCommand);
}

function sanitizeSessionForApi(session, games) {
  const selectedGame = resolveGameSelection(games, { gameIdentificationNumber: session.selectedGameId });
  return {
    id: session.id,
    sessionKey: session.sessionKey,
    playerName: session.playerName,
    balance: session.balance,
    currency: session.currency,
    language: session.language,
    selectedGameId: session.selectedGameId,
    selectedGame: selectedGame ? {
      gameIdentificationNumber: selectedGame.gameIdentificationNumber,
      gameName: selectedGame.gameName,
      gameType: selectedGame.gameType,
      displayName: selectedGame.displayName
    } : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function buildLaunchUrl(session, game, apiBase = DEFAULT_API_BASE) {
  const targetGame = game || { gameName: DEFAULT_GAME_NAME, gameType: DEFAULT_GAME_TYPE, gameIdentificationNumber: DEFAULT_GAME_IDENTIFICATION_NUMBER };
  return `/ActionMoneyEGT/html5/index.html?game=${encodeURIComponent(targetGame.gameName)}&gameType=${encodeURIComponent(targetGame.gameType)}&gameIdentificationNumber=${encodeURIComponent(targetGame.gameIdentificationNumber)}&sessionId=${encodeURIComponent(session.id)}&apiBase=${encodeURIComponent(apiBase)}`;
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
  return games.find((game) => game.gameIdentificationNumber === Number(gameIdentificationNumber)) || null;
}

function createBackend(options) {
  const rootDir = options.rootDir;
  const apiBase = options.apiBase || DEFAULT_API_BASE;
  if (apiBase === '/' || apiBase === '/ws') {
    throw new Error('ACTION_MONEY_SLOT_API_BASE cannot be "/" or "/ws" because those paths are reserved for WebSocket upgrades.');
  }
  const apiBasePattern = escapeRegex(apiBase);
  const games = discoverGames(rootDir);
  const sessionStore = new SessionStore(games, {
    rootDir,
    dbPath: options.dbPath,
    balance: options.defaults && options.defaults.balance,
    currency: options.defaults && options.defaults.currency,
    language: options.defaults && options.defaults.language,
    playerName: options.defaults && options.defaults.playerName
  });
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
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        writeJsonFrame(ws, buildFailureResponse(request, `Unknown session: ${sessionId}`));
        return;
      }

      const requestedGameId = request.gameIdentificationNumber;
      const game = requestedGameId === undefined || requestedGameId === null
        ? resolveGameSelection(games, { gameIdentificationNumber: session.selectedGameId }) || games[0]
        : findGameById(games, requestedGameId);
      if (!game) {
        writeJsonFrame(ws, buildFailureResponse(request, `Unknown gameIdentificationNumber: ${requestedGameId}`));
        return;
      }

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
            response = handleSpin(request, session, game, sessionStore);
          } else if (gameCommand === 'collect') {
            response = handleCollect(request, session, game, sessionStore);
          } else {
            response = handleNoopBet(request, session, game, sessionStore, gameCommand);
          }
          break;
        }
        default:
          response = buildFailureResponse(request, `Unsupported command: ${request.command || 'unknown'}`);
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
      if (pathname === `${apiBase}/games`) {
        if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
          return true;
        }
        const demoSession = sessionStore.ensureSession('demo-session');
        sendApiJson(res, 200, {
          games: games.map((game) => buildGameCatalogEntry(game, demoSession, apiBase))
        }, shouldSendBody);
        return true;
      }

      const gameMatch = pathname.match(new RegExp(`^${apiBasePattern}\\/games\\/(\\d+)$`));
      if (gameMatch) {
        if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
          return true;
        }
        const game = findGameById(games, gameMatch[1]);
        if (!game) {
          sendApiJson(res, 404, { error: 'Game not found.' }, shouldSendBody);
          return true;
        }
        const demoSession = sessionStore.ensureSession('demo-session');
        sendApiJson(res, 200, { game: buildGameCatalogEntry(game, demoSession, apiBase) }, shouldSendBody);
        return true;
      }

      if (pathname === `${apiBase}/sessions`) {
        if (req.method === 'POST') {
          try {
            const payload = await readJsonBody(req);
            const selectedGame = hasGameSelectionInput(payload)
              ? resolveGameSelection(games, payload, { allowDefault: false })
              : resolveGameSelection(games, payload);
            if (!selectedGame) {
              sendApiJson(res, 400, { error: 'Game selection is invalid.' }, shouldSendBody);
              return true;
            }
            const session = sessionStore.createSession({ ...payload, gameIdentificationNumber: selectedGame && selectedGame.gameIdentificationNumber });
            sendApiJson(res, 201, {
              session: sanitizeSessionForApi(session, games),
              launchUrl: buildLaunchUrl(session, selectedGame, apiBase),
              games: games.map((game) => ({
                gameIdentificationNumber: game.gameIdentificationNumber,
                gameName: game.gameName,
                gameType: game.gameType,
                engineType: game.engineType
              }))
            }, shouldSendBody);
          } catch (error) {
            const statusCode = error && error.message === 'Session already exists.' ? 409 : 400;
            sendApiJson(res, statusCode, { error: error.message }, shouldSendBody);
          }
          return true;
        }

        if (['GET', 'HEAD'].includes(req.method || 'GET')) {
          sendApiJson(res, 200, {
            sessions: sessionStore.listSessions().map((session) => sanitizeSessionForApi(session, games))
          }, shouldSendBody);
          return true;
        }

        res.setHeader('Allow', 'GET, HEAD, POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }

      const selectGameMatch = pathname.match(new RegExp(`^${apiBasePattern}\\/sessions\\/([^/]+)\\/select-game$`));
      if (selectGameMatch) {
        let sessionId;
        try {
          sessionId = decodeURIComponent(selectGameMatch[1]);
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
          const selectedGame = hasGameSelectionInput(payload)
            ? resolveGameSelection(games, payload, { allowDefault: false })
            : resolveGameSelection(games, payload);
          if (!selectedGame) {
            sendApiJson(res, 400, { error: 'Game selection is invalid.' }, shouldSendBody);
            return true;
          }
          const updatedSession = sessionStore.setSelectedGame(sessionId, selectedGame.gameIdentificationNumber);
          sendApiJson(res, 200, {
            session: sanitizeSessionForApi(updatedSession, games),
            launchUrl: buildLaunchUrl(updatedSession, selectedGame, apiBase)
          }, shouldSendBody);
        } catch (error) {
          sendApiJson(res, 400, { error: error.message }, shouldSendBody);
        }
        return true;
      }

      const balanceMatch = pathname.match(new RegExp(`^${apiBasePattern}\\/sessions\\/([^/]+)\\/balance$`));
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
          const hasBalance = payload.balance !== undefined;
          const hasAmount = payload.amount !== undefined;
          if (hasBalance && !isFiniteNumberInput(payload.balance)) {
            sendApiJson(res, 400, { error: 'Balance must be a valid number.' }, shouldSendBody);
            return true;
          }
          if (!hasBalance && (!hasAmount || !isFiniteNumberInput(payload.amount))) {
            sendApiJson(res, 400, { error: 'Amount must be a valid number.' }, shouldSendBody);
            return true;
          }
          const nextBalance = hasBalance
            ? Number(payload.balance)
            : session.balance + Number(payload.amount);
          const updated = sessionStore.updateBalance(sessionId, nextBalance);
          sendApiJson(res, 200, { session: sanitizeSessionForApi(updated, games) }, shouldSendBody);
        } catch (error) {
          sendApiJson(res, 400, { error: error.message }, shouldSendBody);
        }
        return true;
      }

      const sessionMatch = pathname.match(new RegExp(`^${apiBasePattern}\\/sessions\\/([^/]+)$`));
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

        const selectedGame = resolveGameSelection(games, { gameIdentificationNumber: session.selectedGameId }) || games[0];
        sendApiJson(res, 200, {
          session: sanitizeSessionForApi(session, games),
          launchUrl: buildLaunchUrl(session, selectedGame, apiBase)
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
      const origin = req.headers.origin;
      const forwardedHost = req.headers['x-forwarded-host'];
      const forwardedProto = req.headers['x-forwarded-proto'];
      const expectedHost = String(forwardedHost || req.headers.host || '').split(',')[0].trim();
      const expectedProtocol = String(forwardedProto || 'http').split(',')[0].trim();
      if (origin && expectedHost) {
        try {
          const originUrl = new URL(origin);
          if (originUrl.host !== expectedHost || originUrl.protocol !== `${expectedProtocol}:`) {
            socket.destroy();
            return;
          }
        } catch (error) {
          socket.destroy();
          return;
        }
      }
      const pathname = parsePathname(req.url || '/');
      if (pathname !== '/' && pathname !== '/ws') {
        socket.destroy();
        return;
      }
      try {
        webSocketServer.handleUpgrade(req, socket, head, (ws) => {
          try {
            webSocketServer.emit('connection', ws, req);
          } catch (error) {
            ws.terminate();
          }
        });
      } catch (error) {
        socket.destroy();
      }
    },
    shutdown(callback) {
      const done = typeof callback === 'function' ? callback : () => {};
      const trackedSockets = Array.from(sockets);
      let remaining = trackedSockets.length;
      let finalized = false;
      let serverClosed = false;
      let shutdownError = null;
      const shutdownTimer = setTimeout(() => {
        for (const ws of trackedSockets) {
          try {
            ws.terminate();
          } catch (error) {
            // ignore terminate failures while forcing shutdown
          }
        }
        finalize(new Error('Timed out shutting down backend WebSocket connections.'));
      }, SHUTDOWN_TIMEOUT_MS);

      function finalize(error) {
        if (finalized) {
          return;
        }
        finalized = true;
        clearTimeout(shutdownTimer);
        let finalError = error || null;
        try {
          sessionStore.close();
        } catch (closeError) {
          finalError = finalError || closeError;
        }
        done(finalError);
      }

      function maybeFinalize() {
        if (serverClosed && remaining <= 0) {
          finalize(shutdownError);
        }
      }

      function markClosed() {
        remaining -= 1;
        maybeFinalize();
      }

      try {
        webSocketServer.close((error) => {
          serverClosed = true;
          shutdownError = error || shutdownError;
          maybeFinalize();
        });
      } catch (error) {
        finalize(error);
        return;
      }

      if (!trackedSockets.length) {
        remaining = 0;
        maybeFinalize();
        return;
      }

      for (const ws of trackedSockets) {
        ws.once('close', markClosed);
        try {
          ws.close();
        } catch (error) {
          markClosed();
        }
      }
    }
  };
}

module.exports = {
  DEFAULT_API_BASE,
  createBackend,
  discoverGames,
  parsePathname,
  resolveGameSelection
};
