const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const { WebSocketServer } = require('ws');
const {
  buildDefaultMathConfig,
  clone,
  createRngState,
  normalizeMathConfig,
  serializeSeed,
  simulateRtp,
  spin
} = require('./original-slot-engine');

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
const DEFAULT_GAME_VERSION = '1.0.0';
const DEFAULT_API_BASE = '/api';
const VERSION_SEGMENT = '/v1';
const SHUTDOWN_TIMEOUT_MS = 5000;
const DEFAULT_ADMIN_TOKEN = 'change-me-admin-token';

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

function normalizeDenominations(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.map((entry) => Array.isArray(entry)
    ? entry.map((item) => normalizeNumber(item, item))
    : [normalizeNumber(entry, entry), 70, 300000]);
}

function buildPaytableFromMathConfig(mathConfig) {
  const paytable = {};
  mathConfig.symbols.forEach((symbol) => {
    paytable[symbol.id] = {
      coef: [
        normalizeNumber(symbol.payouts && symbol.payouts[3], 0),
        normalizeNumber(symbol.payouts && symbol.payouts[4], 0),
        normalizeNumber(symbol.payouts && symbol.payouts[5], 0)
      ],
      multiplier: normalizeNumber(symbol.multiplier, 1)
    };
  });
  return paytable;
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
  const buildTime = sandbox.com?.egt?.baseslot?.buildTime
    || sandbox.com?.egt?.cascadeslot?.buildTime
    || sandbox.window?.com?.egt?.baseslot?.buildTime
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

function createDefaultSessionState(game) {
  const defaultDenomination = game.mathConfig.denominations[0];
  const defaultLines = game.mathConfig.layout.mode === 'ways'
    ? game.mathConfig.layout.reels
    : Math.min(game.mathConfig.layout.paylines.length, 10);
  return {
    gamblesUsed: 0,
    previousGambles: [],
    bet: defaultDenomination,
    numberOfLines: defaultLines,
    denomination: defaultDenomination,
    state: 'idle',
    winAmount: 0,
    reels: [],
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
    holdReels: null,
    featureLog: []
  };
}

function createGameSettings({ engineType, gameType, staticSettings, buildTime, mathConfig }) {
  const settings = staticSettings || {};
  const denominationTable = normalizeDenominations(
    settings.denominations,
    mathConfig.denominations.map((entry) => [entry, 70, 300000])
  );
  const linesCount = mathConfig.layout.mode === 'ways'
    ? [mathConfig.layout.reels]
    : Array.from({ length: mathConfig.layout.paylines.length }, (_, index) => index + 1);
  return {
    ...clone(settings),
    backendOwnMath: true,
    mode: mathConfig.layout.mode,
    buildDisclaimer: 'Motor propio para demostración. No es un casino real y no gestiona pagos, KYC ni cumplimiento regulatorio.',
    paytableCoef: buildPaytableFromMathConfig(mathConfig),
    rtp: String(settings.rtp || 'custom-simulated'),
    bets: normalizeStringArray(settings.bets, mathConfig.bets).map((value) => normalizeNumber(value, value)),
    denominations: denominationTable,
    lines: mathConfig.layout.mode === 'ways' ? [mathConfig.layout.reels] : [Math.min(10, mathConfig.layout.paylines.length)],
    lineGame: mathConfig.layout.mode === 'lines',
    linesCount,
    numReels: mathConfig.layout.reels,
    numReelCards: mathConfig.layout.rows,
    numImages: mathConfig.symbols.length,
    wildIndex: mathConfig.wildSymbolId,
    scatterIndex: mathConfig.scatterSymbolId,
    bonusIndex: mathConfig.bonusSymbolId,
    sendTotalsInfo: false,
    minimumSpinTime: 0,
    autoplayLimit: [0, 10, 25, 50],
    gameVersion: String(settings.gameVersion || `${engineType} v: ${buildTime || DEFAULT_GAME_VERSION}.own`),
    gameType,
    engineType
  };
}

function createCatalogRecordFromBaseGame(baseGame) {
  const mathConfig = buildDefaultMathConfig({
    id: `${baseGame.engineType}-${baseGame.gameType}-${baseGame.gameIdentificationNumber}`.toLowerCase(),
    displayName: humanizeGameName(baseGame.gameName)
  });
  return {
    gameIdentificationNumber: baseGame.gameIdentificationNumber,
    gameName: baseGame.gameName,
    gameType: baseGame.gameType,
    engineType: baseGame.engineType,
    displayName: baseGame.displayName,
    buildTime: String(baseGame.buildTime || ''),
    status: 'published',
    settings: createGameSettings({
      engineType: baseGame.engineType,
      gameType: baseGame.gameType,
      staticSettings: baseGame.staticConfig,
      buildTime: baseGame.buildTime,
      mathConfig
    }),
    staticConfig: baseGame.staticConfig,
    mathConfig,
    source: 'discovered'
  };
}

function buildGameFromRecord(record) {
  const mathConfig = normalizeMathConfig(record.mathConfig);
  const settings = createGameSettings({
    engineType: record.engineType,
    gameType: record.gameType,
    staticSettings: record.staticConfig || record.settings,
    buildTime: record.buildTime,
    mathConfig
  });
  return {
    engineType: record.engineType,
    gameType: record.gameType,
    gameName: record.gameName,
    displayName: record.displayName,
    gameIdentificationNumber: record.gameIdentificationNumber,
    featured: true,
    recovery: 'norecovery',
    mlmJackpot: false,
    groups: [{ name: 'slots' }],
    bonusSpins: { remainingBonusSpins: 0, statusCode: 'success' },
    buildTime: record.buildTime,
    staticConfig: record.staticConfig || {},
    iData: {
      gameName: record.gameName,
      gameType: record.gameType,
      engineType: record.engineType,
      playerName: DEFAULT_PLAYER_NAME,
      lastBet: mathConfig.denominations[0],
      lastDenomination: mathConfig.denominations[0],
      gameNumber: 0
    },
    settings,
    mathConfig,
    status: record.status || 'draft',
    initialState: createDefaultSessionState({ mathConfig }),
    jackpotState: {
      levelI: 0,
      levelII: 0,
      levelIII: 0,
      levelIV: 0,
      winsLevelI: 0,
      winsLevelII: 0,
      winsLevelIII: 0,
      winsLevelIV: 0
    }
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
      games.push({
        engineType,
        gameType,
        gameName: engineType,
        displayName: humanizeGameName(engineType),
        gameIdentificationNumber: gameId,
        staticConfig: loadedConfig.settings,
        buildTime: loadedConfig.buildTime || DEFAULT_GAME_VERSION
      });
      gameId += 1;
    }
  }

  if (!games.length) {
    games.push({
      engineType: DEFAULT_ENGINE_TYPE,
      gameType: DEFAULT_GAME_TYPE,
      gameName: DEFAULT_GAME_NAME,
      displayName: humanizeGameName(DEFAULT_GAME_NAME),
      gameIdentificationNumber: DEFAULT_GAME_IDENTIFICATION_NUMBER,
      staticConfig: {},
      buildTime: DEFAULT_GAME_VERSION
    });
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(secret), salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyHashedSecret(secret, storedValue) {
  const parts = String(storedValue || '').split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const derived = crypto.scryptSync(String(secret), salt, 32);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        return accumulator;
      }
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return null;
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 6 && buffer.slice(0, 6).toString('ascii') === 'GIF87a') {
    return 'image/gif';
  }
  if (buffer.length >= 6 && buffer.slice(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif';
  }
  if (
    buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function serializePermissions(permissions) {
  return JSON.stringify(Array.isArray(permissions) ? permissions : ['read', 'write']);
}

function deserializePermissions(permissionsJson) {
  try {
    return JSON.parse(permissionsJson || '[]');
  } catch (error) {
    return [];
  }
}

function sanitizeFileName(fileName) {
  return String(fileName || 'image.bin').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function buildImageUrl(id, versionedApiBase) {
  return `${versionedApiBase}/images/${encodeURIComponent(String(id))}/content`;
}

function buildVersionedApiBase(apiBase) {
  return apiBase.endsWith(VERSION_SEGMENT) ? apiBase : `${apiBase}${VERSION_SEGMENT}`;
}

function toResponseMessageId(requestMessageId) {
  return typeof requestMessageId === 'string' && requestMessageId ? requestMessageId : `r-r_${crypto.randomUUID()}`;
}

function buildLaunchUrl(session, game, apiBase = DEFAULT_API_BASE) {
  const targetGame = game || {
    gameName: DEFAULT_GAME_NAME,
    gameType: DEFAULT_GAME_TYPE,
    gameIdentificationNumber: DEFAULT_GAME_IDENTIFICATION_NUMBER
  };
  return `/ActionMoneyEGT/html5/index.html?game=${encodeURIComponent(targetGame.gameName)}&gameType=${encodeURIComponent(targetGame.gameType)}&gameIdentificationNumber=${encodeURIComponent(targetGame.gameIdentificationNumber)}&sessionId=${encodeURIComponent(session.id)}&apiBase=${encodeURIComponent(apiBase)}`;
}

function buildGameCatalogEntry(game, session, apiBase, versionedApiBase) {
  return {
    gameIdentificationNumber: game.gameIdentificationNumber,
    engineType: game.engineType,
    gameType: game.gameType,
    gameName: game.gameName,
    displayName: game.displayName,
    buildTime: game.buildTime,
    status: game.status,
    settings: clone(game.settings),
    mathConfig: clone(game.mathConfig),
    launchUrl: buildLaunchUrl(session, game, apiBase),
    configUrl: `${versionedApiBase}/games/${game.gameIdentificationNumber}/config`,
    rtpSimulationUrl: `${versionedApiBase}/games/${game.gameIdentificationNumber}/rtp`
  };
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
      displayName: selectedGame.displayName,
      status: selectedGame.status
    } : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

class SessionStore {
  constructor(baseGames, options = {}) {
    this.baseGames = baseGames;
    this.games = [];
    this.sessions = new Map();
    this.closed = false;
    this.defaults = {
      balance: normalizeNumber(options.balance, DEFAULT_BALANCE),
      currency: options.currency || DEFAULT_CURRENCY,
      language: options.language || DEFAULT_LANGUAGE,
      playerName: options.playerName || DEFAULT_PLAYER_NAME
    };
    this.dbPath = options.dbPath || path.join(options.rootDir, 'data', 'action-money-slot.sqlite');
    this.uploadsDir = path.join(path.dirname(this.dbPath), 'uploads');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
    this.prepareStatements();
    this.loadCatalog();
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
      CREATE TABLE IF NOT EXISTS game_catalog (
        game_identification_number INTEGER PRIMARY KEY,
        game_name TEXT NOT NULL,
        game_type TEXT NOT NULL,
        engine_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        build_time TEXT NOT NULL,
        status TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        static_config_json TEXT NOT NULL,
        math_config_json TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE TABLE IF NOT EXISTS spin_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        game_identification_number INTEGER NOT NULL,
        request_message_id TEXT,
        wager REAL NOT NULL,
        denomination REAL NOT NULL,
        bet_per_line REAL NOT NULL,
        number_of_lines INTEGER NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        win_amount REAL NOT NULL,
        line_win_amount REAL NOT NULL,
        scatter_win_amount REAL NOT NULL,
        bonus_win_amount REAL NOT NULL,
        rng_before TEXT NOT NULL,
        rng_after TEXT NOT NULL,
        grid_json TEXT NOT NULL,
        line_wins_json TEXT NOT NULL,
        feature_log_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        game_identification_number INTEGER,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        description TEXT,
        storage_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        permissions_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        revoked_at TEXT
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
      selectCatalog: this.db.prepare('SELECT * FROM game_catalog ORDER BY game_identification_number ASC'),
      upsertCatalogGame: this.db.prepare(`
        INSERT INTO game_catalog (
          game_identification_number, game_name, game_type, engine_type, display_name, build_time, status,
          settings_json, static_config_json, math_config_json, source, created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_identification_number) DO UPDATE SET
          game_name = excluded.game_name,
          game_type = excluded.game_type,
          engine_type = excluded.engine_type,
          display_name = excluded.display_name,
          build_time = excluded.build_time,
          status = excluded.status,
          settings_json = excluded.settings_json,
          static_config_json = excluded.static_config_json,
          math_config_json = excluded.math_config_json,
          source = excluded.source,
          updated_at = excluded.updated_at,
          published_at = excluded.published_at
      `),
      selectLastGameId: this.db.prepare('SELECT MAX(game_identification_number) AS max_id FROM game_catalog'),
      insertSpinHistory: this.db.prepare(`
        INSERT INTO spin_history (
          id, session_id, game_identification_number, request_message_id, wager, denomination, bet_per_line,
          number_of_lines, balance_before, balance_after, win_amount, line_win_amount, scatter_win_amount,
          bonus_win_amount, rng_before, rng_after, grid_json, line_wins_json, feature_log_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      selectSpinHistoryForSession: this.db.prepare(`
        SELECT * FROM spin_history WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
      `),
      insertImage: this.db.prepare(`
        INSERT INTO images (id, game_identification_number, file_name, mime_type, description, storage_path, sha256, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateImage: this.db.prepare(`
        UPDATE images
        SET game_identification_number = ?, file_name = ?, mime_type = ?, description = ?, storage_path = ?, sha256 = ?, updated_at = ?
        WHERE id = ?
      `),
      selectImages: this.db.prepare('SELECT * FROM images ORDER BY created_at DESC'),
      selectImageById: this.db.prepare('SELECT * FROM images WHERE id = ?'),
      deleteImage: this.db.prepare('DELETE FROM images WHERE id = ?'),
      insertApiKey: this.db.prepare(`
        INSERT INTO api_keys (id, label, key_hash, permissions_json, active, last_used_at, created_at, revoked_at)
        VALUES (?, ?, ?, ?, 1, NULL, ?, NULL)
      `),
      selectApiKeys: this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC'),
      touchApiKey: this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?'),
      revokeApiKey: this.db.prepare('UPDATE api_keys SET active = 0, revoked_at = ? WHERE id = ?')
    };
  }

  loadCatalog() {
    const rows = this.statements.selectCatalog.all();
    if (!rows.length) {
      const now = new Date().toISOString();
      this.baseGames.forEach((baseGame) => {
        const record = createCatalogRecordFromBaseGame(baseGame);
        this.statements.upsertCatalogGame.run(
          record.gameIdentificationNumber,
          record.gameName,
          record.gameType,
          record.engineType,
          record.displayName,
          String(record.buildTime || ''),
          record.status,
          JSON.stringify(record.settings),
          JSON.stringify(record.staticConfig || {}),
          JSON.stringify(record.mathConfig),
          record.source,
          now,
          now,
          now
        );
      });
    }
    this.games = this.statements.selectCatalog.all().map((row) => buildGameFromRecord({
      gameIdentificationNumber: Number(row.game_identification_number),
      gameName: row.game_name,
      gameType: row.game_type,
      engineType: row.engine_type,
      displayName: row.display_name,
      buildTime: row.build_time,
      status: row.status,
      settings: JSON.parse(row.settings_json),
      staticConfig: JSON.parse(row.static_config_json),
      mathConfig: JSON.parse(row.math_config_json)
    }));
  }

  getNextGameIdentificationNumber() {
    const row = this.statements.selectLastGameId.get();
    return normalizeNumber(row && row.max_id, 0) + 1;
  }

  persistCatalogGame(game, options = {}) {
    const now = new Date().toISOString();
    const publishedAt = options.publish ? now : (options.publishedAt || (game.status === 'published' ? now : null));
    this.statements.upsertCatalogGame.run(
      game.gameIdentificationNumber,
      game.gameName,
      game.gameType,
      game.engineType,
      game.displayName,
      String(game.buildTime || ''),
      game.status,
      JSON.stringify(game.settings),
      JSON.stringify(game.staticConfig || {}),
      JSON.stringify(game.mathConfig),
      options.source || 'managed',
      options.createdAt || now,
      now,
      publishedAt
    );
    this.loadCatalog();
    this.syncSessionGames();
  }

  syncSessionGames() {
    this.listSessions().forEach((session) => {
      let changed = false;
      this.games.forEach((game) => {
        if (!session.games[game.gameIdentificationNumber]) {
          session.games[game.gameIdentificationNumber] = this.createDefaultSessionGame(game, session.updatedAt);
          changed = true;
        }
      });
      if (changed) {
        this.persistSession(session);
      }
    });
  }

  loadSessions() {
    this.sessions.clear();
    const sessionRows = this.statements.selectSessions.all();
    const sessionGameRows = this.statements.selectSessionGames.all();
    const gameRowsBySession = new Map();

    sessionGameRows.forEach((row) => {
      if (!gameRowsBySession.has(row.session_id)) {
        gameRowsBySession.set(row.session_id, []);
      }
      gameRowsBySession.get(row.session_id).push(row);
    });

    sessionRows.forEach((row) => {
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
      this.games.forEach((game) => {
        const stored = perGameRows.find((entry) => entry.game_identification_number === game.gameIdentificationNumber);
        session.games[game.gameIdentificationNumber] = stored
          ? {
            gameNumber: Number(stored.game_number),
            state: JSON.parse(stored.state_json),
            jackpotState: JSON.parse(stored.jackpot_state_json),
            lastUpdatedAt: stored.last_updated_at,
            rng: createRngState(stored.rng_value)
          }
          : this.createDefaultSessionGame(game, row.updated_at);
      });
      this.sessions.set(session.id, session);
      if (perGameRows.length < this.games.length) {
        this.persistSession(session);
      }
    });
  }

  createDefaultSessionGame(game, timestamp) {
    return {
      gameNumber: 0,
      state: clone(game.initialState),
      jackpotState: clone(game.jackpotState),
      lastUpdatedAt: timestamp,
      rng: createRngState()
    };
  }

  ensureDemoSession() {
    if (!this.getSession('demo-session')) {
      this.createSession({
        id: 'demo-session',
        sessionKey: 'LOCAL:demo-session',
        playerName: this.defaults.playerName
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
    this.games.forEach((game) => {
      session.games[game.gameIdentificationNumber] = this.createDefaultSessionGame(game, now);
    });
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
    this.games.forEach((game) => {
      const state = session.games[game.gameIdentificationNumber] || this.createDefaultSessionGame(game, session.updatedAt);
      session.games[game.gameIdentificationNumber] = state;
      this.statements.upsertSessionGame.run(
        session.id,
        game.gameIdentificationNumber,
        state.gameNumber,
        JSON.stringify(state.state),
        JSON.stringify(state.jackpotState),
        serializeSeed(state.rng.value),
        state.lastUpdatedAt
      );
    });
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
    const game = this.findGameById(gameIdentificationNumber);
    if (!session || !game) {
      return null;
    }
    session.selectedGameId = Number(gameIdentificationNumber);
    this.ensureSessionGame(session, game);
    session.updatedAt = new Date().toISOString();
    this.persistSession(session);
    return session;
  }

  ensureSessionGame(session, game) {
    if (!session.games[game.gameIdentificationNumber]) {
      session.games[game.gameIdentificationNumber] = this.createDefaultSessionGame(game, session.updatedAt);
    }
    return session.games[game.gameIdentificationNumber];
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

  findGameById(gameIdentificationNumber) {
    return this.games.find((game) => game.gameIdentificationNumber === Number(gameIdentificationNumber)) || null;
  }

  recordSpin(spinEntry) {
    const now = new Date().toISOString();
    this.statements.insertSpinHistory.run(
      spinEntry.id || crypto.randomUUID(),
      spinEntry.sessionId,
      spinEntry.gameIdentificationNumber,
      spinEntry.requestMessageId || null,
      spinEntry.wager,
      spinEntry.denomination,
      spinEntry.betPerLine,
      spinEntry.numberOfLines,
      spinEntry.balanceBefore,
      spinEntry.balanceAfter,
      spinEntry.winAmount,
      spinEntry.lineWinAmount,
      spinEntry.scatterWinAmount,
      spinEntry.bonusWinAmount,
      spinEntry.rngBefore,
      spinEntry.rngAfter,
      JSON.stringify(spinEntry.grid),
      JSON.stringify(spinEntry.lineWins),
      JSON.stringify(spinEntry.featureLog),
      now
    );
  }

  listSpinHistory(sessionId, options = {}) {
    const limit = Math.min(200, Math.max(1, normalizeNumber(options.limit, 50)));
    const offset = Math.max(0, normalizeNumber(options.offset, 0));
    return this.statements.selectSpinHistoryForSession.all(String(sessionId), limit, offset).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      gameIdentificationNumber: row.game_identification_number,
      requestMessageId: row.request_message_id,
      wager: Number(row.wager),
      denomination: Number(row.denomination),
      betPerLine: Number(row.bet_per_line),
      numberOfLines: Number(row.number_of_lines),
      balanceBefore: Number(row.balance_before),
      balanceAfter: Number(row.balance_after),
      winAmount: Number(row.win_amount),
      lineWinAmount: Number(row.line_win_amount),
      scatterWinAmount: Number(row.scatter_win_amount),
      bonusWinAmount: Number(row.bonus_win_amount),
      rngBefore: row.rng_before,
      rngAfter: row.rng_after,
      grid: JSON.parse(row.grid_json),
      lineWins: JSON.parse(row.line_wins_json),
      featureLog: JSON.parse(row.feature_log_json),
      createdAt: row.created_at
    }));
  }

  listImages(options = {}) {
    const filterGameId = options.gameIdentificationNumber !== undefined ? Number(options.gameIdentificationNumber) : null;
    return this.statements.selectImages.all()
      .filter((row) => filterGameId === null || normalizeNumber(row.game_identification_number, null) === filterGameId)
      .map((row) => ({
        id: row.id,
        gameIdentificationNumber: row.game_identification_number === null ? null : Number(row.game_identification_number),
        fileName: row.file_name,
        mimeType: row.mime_type,
        description: row.description,
        sha256: row.sha256,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        storagePath: row.storage_path
      }));
  }

  getImage(id) {
    const row = this.statements.selectImageById.get(String(id));
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      gameIdentificationNumber: row.game_identification_number === null ? null : Number(row.game_identification_number),
      fileName: row.file_name,
      mimeType: row.mime_type,
      description: row.description,
      sha256: row.sha256,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      storagePath: row.storage_path
    };
  }

  saveImage(payload, id) {
    const now = new Date().toISOString();
    const imageId = id || crypto.randomUUID();
    const fileName = sanitizeFileName(payload.fileName);
    const content = Buffer.from(String(payload.contentBase64 || ''), 'base64');
    const storagePath = path.join(this.uploadsDir, `${imageId}-${fileName}`);
    fs.writeFileSync(storagePath, content);
    const digest = sha256(content);
    const existing = id ? this.getImage(id) : null;
    if (existing) {
      if (existing.storagePath && existing.storagePath !== storagePath && fs.existsSync(existing.storagePath)) {
        fs.rmSync(existing.storagePath, { force: true });
      }
      this.statements.updateImage.run(
        payload.gameIdentificationNumber !== undefined ? Number(payload.gameIdentificationNumber) : null,
        fileName,
        String(payload.mimeType || 'application/octet-stream'),
        payload.description ? String(payload.description) : null,
        storagePath,
        digest,
        now,
        imageId
      );
    } else {
      this.statements.insertImage.run(
        imageId,
        payload.gameIdentificationNumber !== undefined ? Number(payload.gameIdentificationNumber) : null,
        fileName,
        String(payload.mimeType || 'application/octet-stream'),
        payload.description ? String(payload.description) : null,
        storagePath,
        digest,
        now,
        now
      );
    }
    return this.getImage(imageId);
  }

  deleteImage(id) {
    const image = this.getImage(id);
    if (!image) {
      return false;
    }
    this.statements.deleteImage.run(String(id));
    if (image.storagePath && fs.existsSync(image.storagePath)) {
      fs.rmSync(image.storagePath, { force: true });
    }
    return true;
  }

  createApiKey(payload = {}) {
    const id = crypto.randomUUID();
    const plainText = `ams_${crypto.randomBytes(18).toString('hex')}`;
    const now = new Date().toISOString();
    this.statements.insertApiKey.run(
      id,
      String(payload.label || 'integration'),
      hashSecret(plainText),
      serializePermissions(payload.permissions),
      now
    );
    return {
      id,
      token: plainText,
      label: String(payload.label || 'integration'),
      permissions: Array.isArray(payload.permissions) ? payload.permissions : ['read', 'write'],
      createdAt: now
    };
  }

  listApiKeys() {
    return this.statements.selectApiKeys.all().map((row) => ({
      id: row.id,
      label: row.label,
      permissions: deserializePermissions(row.permissions_json),
      active: Boolean(row.active),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at
    }));
  }

  revokeApiKey(id) {
    const now = new Date().toISOString();
    this.statements.revokeApiKey.run(now, String(id));
    return this.listApiKeys().find((entry) => entry.id === String(id)) || null;
  }

  authenticateApiKey(token) {
    if (!token) {
      return null;
    }
    const row = this.statements.selectApiKeys.all()
      .find((entry) => Boolean(entry.active) && verifyHashedSecret(token, entry.key_hash));
    if (!row) {
      return null;
    }
    this.statements.touchApiKey.run(new Date().toISOString(), row.id);
    return {
      id: row.id,
      label: row.label,
      permissions: deserializePermissions(row.permissions_json)
    };
  }

  createGame(payload = {}) {
    const baseGame = payload.baseGameIdentificationNumber
      ? this.findGameById(payload.baseGameIdentificationNumber)
      : (this.games[0] || buildGameFromRecord(createCatalogRecordFromBaseGame(this.baseGames[0])));
    const newGame = clone(baseGame);
    newGame.gameIdentificationNumber = this.getNextGameIdentificationNumber();
    newGame.displayName = String(payload.displayName || `${baseGame.displayName} Copy`);
    newGame.gameName = String(payload.gameName || baseGame.gameName);
    newGame.gameType = String(payload.gameType || baseGame.gameType);
    newGame.engineType = String(payload.engineType || baseGame.engineType);
    newGame.status = String(payload.status || 'draft');
    newGame.mathConfig = normalizeMathConfig(payload.mathConfig || newGame.mathConfig);
    newGame.settings = createGameSettings({
      engineType: newGame.engineType,
      gameType: newGame.gameType,
      staticSettings: payload.staticConfig || newGame.staticConfig,
      buildTime: newGame.buildTime,
      mathConfig: newGame.mathConfig
    });
    newGame.initialState = createDefaultSessionState(newGame);
    this.persistCatalogGame(newGame);
    return this.findGameById(newGame.gameIdentificationNumber);
  }

  duplicateGame(id, payload = {}) {
    const game = this.findGameById(id);
    if (!game) {
      return null;
    }
    return this.createGame({
      baseGameIdentificationNumber: game.gameIdentificationNumber,
      displayName: payload.displayName || `${game.displayName} Copy`,
      status: payload.status || 'draft',
      mathConfig: payload.mathConfig || game.mathConfig
    });
  }

  updateGame(id, payload = {}) {
    const game = this.findGameById(id);
    if (!game) {
      return null;
    }
    game.displayName = payload.displayName !== undefined ? String(payload.displayName) : game.displayName;
    game.status = payload.status !== undefined ? String(payload.status) : game.status;
    game.gameName = payload.gameName !== undefined ? String(payload.gameName) : game.gameName;
    game.gameType = payload.gameType !== undefined ? String(payload.gameType) : game.gameType;
    game.engineType = payload.engineType !== undefined ? String(payload.engineType) : game.engineType;
    game.staticConfig = payload.staticConfig !== undefined ? clone(payload.staticConfig) : game.staticConfig;
    game.mathConfig = payload.mathConfig !== undefined ? normalizeMathConfig(payload.mathConfig) : game.mathConfig;
    game.settings = createGameSettings({
      engineType: game.engineType,
      gameType: game.gameType,
      staticSettings: game.staticConfig,
      buildTime: game.buildTime,
      mathConfig: game.mathConfig
    });
    game.initialState = createDefaultSessionState(game);
    this.persistCatalogGame(game);
    return this.findGameById(id);
  }

  publishGame(id) {
    const game = this.findGameById(id);
    if (!game) {
      return null;
    }
    game.status = 'published';
    this.persistCatalogGame(game, { publish: true });
    return this.findGameById(id);
  }

  simulateGameRtp(id, simulationOptions = {}) {
    const game = this.findGameById(id);
    if (!game) {
      return null;
    }
    return simulateRtp(game.mathConfig, simulationOptions);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
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
      if (totalLength > 4 * 1024 * 1024) {
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

function parseQueryParams(requestUrl) {
  return Object.fromEntries(new URL(requestUrl, 'http://localhost').searchParams.entries());
}

function buildFailureResponse(request, reason, command) {
  return {
    messageId: toResponseMessageId(request && request.messageId),
    command: command || (request && request.command ? request.command : 'event'),
    qName: RESPONSE_QNAMES.base,
    eventTimestamp: Date.now(),
    msg: 'failure',
    reason
  };
}

function validateBetPayload(game, denomination, numberOfLines, betPerLine) {
  const supportedDenominations = game.mathConfig.denominations.map((entry) => Number(entry));
  if (!supportedDenominations.includes(denomination)) {
    return `Unsupported denomination: ${denomination}`;
  }

  const supportedLines = game.mathConfig.layout.mode === 'ways'
    ? [game.mathConfig.layout.reels]
    : Array.from({ length: game.mathConfig.layout.paylines.length }, (_, index) => index + 1);
  if (!supportedLines.includes(numberOfLines)) {
    return `Unsupported line count: ${numberOfLines}`;
  }

  if (betPerLine < denomination || betPerLine % denomination !== 0) {
    return `Unsupported bet amount: ${betPerLine}`;
  }

  const betUnits = betPerLine / denomination;
  if (!game.mathConfig.bets.map((value) => Number(value)).includes(betUnits)) {
    return `Unsupported bet amount: ${betPerLine}`;
  }

  return null;
}

function buildLoginResponse(request, session, games) {
  const complex = {};
  games.forEach((game) => {
    if (!complex[game.gameType]) {
      complex[game.gameType] = [];
    }
    complex[game.gameType].push({
      gameIdentificationNumber: game.gameIdentificationNumber,
      gameName: game.displayName,
      displayName: game.displayName,
      groups: clone(game.groups),
      recovery: game.recovery,
      featured: game.featured,
      mlmJackpot: game.mlmJackpot,
      bonusSpins: clone(game.bonusSpins)
    });
  });

  return {
    messageId: toResponseMessageId(request.messageId),
    command: request.command === 'login' ? 'login' : request.command,
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
    protocolVersion: 'v1',
    complex
  };
}

function buildSettingsResponse(request, session, game, command = 'settings') {
  const sessionGame = session.games[game.gameIdentificationNumber];
  return {
    messageId: toResponseMessageId(request.messageId),
    command,
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

function buildPingResponse(request) {
  return {
    messageId: toResponseMessageId(request.messageId),
    command: 'ping',
    qName: RESPONSE_QNAMES.base,
    eventTimestamp: Date.now(),
    msg: 'success'
  };
}

function buildBalanceUpdateResponse(request, session, command = 'balanceUpdate') {
  return {
    messageId: toResponseMessageId(request.messageId),
    command,
    qName: RESPONSE_QNAMES.base,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance
  };
}

function buildSpinResponse(request, session, game, nextState, result, command = 'bet') {
  return {
    messageId: toResponseMessageId(request.messageId),
    command,
    qName: RESPONSE_QNAMES.gameEvent,
    eventTimestamp: Date.now(),
    msg: 'success',
    balance: session.balance,
    winAmount: result.totalWin,
    state: nextState.state,
    gameIdentificationNumber: game.gameIdentificationNumber,
    gameNumber: session.games[game.gameIdentificationNumber].gameNumber,
    complex: {
      gameCommand: request.command === 'spin' ? 'spin' : ((request.bet && request.bet.gameCommand) || 'bet'),
      jackpot: false,
      reels: clone(nextState.reels),
      lines: clone(nextState.lines),
      combos: clone(nextState.combos),
      scatters: clone(nextState.scatters),
      expand: clone(nextState.expand),
      gambles: nextState.gambles,
      freespins: nextState.freespins,
      freespinScatters: clone(nextState.freespinScatters),
      balanceUpdate: {
        before: result.balanceBefore,
        after: result.balanceAfter,
        delta: result.balanceAfter - result.balanceBefore
      },
      result: {
        totalBet: result.totalBet,
        totalWin: result.totalWin,
        lineWinAmount: result.lineWinAmount,
        scatterWinAmount: result.scatterWinAmount,
        bonusWinAmount: result.bonusWinAmount,
        rngBefore: result.rngBefore,
        rngAfter: result.rngAfter
      },
      bonus: {
        triggered: result.bonusWinAmount > 0,
        winAmount: result.bonusWinAmount,
        respinsAwarded: result.respinsAwarded
      },
      freeSpins: {
        awarded: result.freeSpinsAwarded,
        consumed: result.freeSpinsConsumed,
        remaining: result.remainingFreeSpins
      }
    }
  };
}

function handleSpinRequest(request, session, game, sessionStore) {
  const sessionGame = sessionStore.ensureSessionGame(session, game);
  const payload = request.command === 'spin' ? (request.spin || request.bet || {}) : (request.bet || {});
  const previousState = sessionGame.state || game.initialState;
  const denomination = normalizeNumber(payload.denomination, previousState.denomination || game.mathConfig.denominations[0]);
  const numberOfLines = normalizeNumber(payload.lines !== undefined ? payload.lines : payload.numberOfLines, previousState.numberOfLines || Math.min(game.mathConfig.layout.paylines.length, 10));
  const betPerLine = normalizeNumber(payload.bet, previousState.bet || denomination);
  const validationError = validateBetPayload(game, denomination, numberOfLines, betPerLine);
  if (validationError) {
    return buildFailureResponse(request, validationError);
  }

  const balanceBefore = session.balance;
  const spinResult = spin(game.mathConfig, sessionGame.rng, {
    previousState,
    denomination,
    lines: numberOfLines,
    betPerLine
  });

  if (balanceBefore < spinResult.totalBet) {
    return {
      messageId: toResponseMessageId(request.messageId),
      command: request.command === 'spin' ? 'result' : 'bet',
      qName: RESPONSE_QNAMES.gameEvent,
      eventTimestamp: Date.now(),
      msg: 'insufficientFunds',
      balance: session.balance,
      state: 'idle',
      gameIdentificationNumber: game.gameIdentificationNumber,
      gameNumber: session.games[game.gameIdentificationNumber].gameNumber,
      complex: {
        gameCommand: request.command === 'spin' ? 'spin' : 'bet'
      }
    };
  }

  session.balance -= spinResult.totalBet;
  session.balance += spinResult.totalWin;
  sessionGame.gameNumber += 1;
  sessionGame.state = spinResult.currentState;
  sessionStore.saveSessionGame(session, game.gameIdentificationNumber);

  const historyEntry = {
    sessionId: session.id,
    gameIdentificationNumber: game.gameIdentificationNumber,
    requestMessageId: request.messageId,
    wager: spinResult.totalBet,
    denomination,
    betPerLine,
    numberOfLines,
    balanceBefore,
    balanceAfter: session.balance,
    winAmount: spinResult.totalWin,
    lineWinAmount: spinResult.lineWins.reduce((sum, entry) => sum + entry.winAmount, 0),
    scatterWinAmount: spinResult.scatterWin,
    bonusWinAmount: spinResult.bonusWin,
    rngBefore: spinResult.rngBefore,
    rngAfter: spinResult.rngAfter,
    grid: spinResult.grid,
    lineWins: spinResult.lineWins,
    featureLog: spinResult.featureLog
  };
  sessionStore.recordSpin(historyEntry);

  return buildSpinResponse(request, session, game, sessionGame.state, {
    ...historyEntry,
    totalBet: spinResult.totalBet,
    totalWin: spinResult.totalWin,
    freeSpinsAwarded: spinResult.freeSpinsAwarded,
    freeSpinsConsumed: spinResult.freeSpinsConsumed,
    remainingFreeSpins: spinResult.remainingFreeSpins,
    respinsAwarded: spinResult.respinsAwarded
  }, request.command === 'spin' ? 'result' : 'bet');
}

function handleCollect(request, session, game, sessionStore) {
  const sessionGame = sessionStore.ensureSessionGame(session, game);
  sessionGame.state = {
    ...clone(sessionGame.state),
    state: 'idle',
    winAmount: 0,
    previousGambles: [],
    gambles: 0,
    gamblesUsed: 0
  };
  sessionStore.saveSessionGame(session, game.gameIdentificationNumber);
  return buildSpinResponse(request, session, game, sessionGame.state, {
    balanceBefore: session.balance,
    balanceAfter: session.balance,
    totalBet: 0,
    totalWin: 0,
    lineWinAmount: 0,
    scatterWinAmount: 0,
    bonusWinAmount: 0,
    freeSpinsAwarded: 0,
    freeSpinsConsumed: 0,
    remainingFreeSpins: sessionGame.state.freespins || 0,
    respinsAwarded: 0,
    rngBefore: serializeSeed(sessionGame.rng.value),
    rngAfter: serializeSeed(sessionGame.rng.value)
  }, 'bet');
}

function createAdminPanelHtml({ versionedApiBase }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ActionMoneySlot Admin</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; background: #101522; color: #f6f7fb; }
    textarea, input, select, button { font: inherit; margin: 0.25rem 0; width: 100%; }
    section { border: 1px solid #2d3650; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; background: #151c2d; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
    pre { white-space: pre-wrap; background: #0b1020; padding: 1rem; border-radius: 8px; overflow: auto; }
  </style>
</head>
<body>
  <h1>ActionMoneySlot Admin</h1>
  <p>Motor propio para demostración. No es un casino real y no incluye pagos, KYC ni cumplimiento regulatorio.</p>
  <div class="grid">
    <section>
      <h2>Juegos</h2>
      <button id="load-games">Recargar catálogo</button>
      <button id="duplicate-game">Duplicar juego 1</button>
      <button id="publish-game">Publicar juego 1</button>
      <pre id="games-output"></pre>
    </section>
    <section>
      <h2>Configurar juego 1</h2>
      <textarea id="game-config" rows="14">{ "displayName": "Original Action Money Slot", "status": "draft" }</textarea>
      <button id="save-game-config">Guardar configuración</button>
    </section>
    <section>
      <h2>Subir imagen</h2>
      <input id="image-name" value="demo.png" />
      <textarea id="image-content" rows="6">iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+s9xkAAAAASUVORK5CYII=</textarea>
      <button id="upload-image">Subir</button>
      <pre id="images-output"></pre>
    </section>
    <section>
      <h2>RTP</h2>
      <button id="simulate-rtp">Simular RTP juego 1</button>
      <pre id="rtp-output"></pre>
    </section>
    <section>
      <h2>API Keys</h2>
      <input id="api-key-label" value="partner-demo" />
      <button id="create-api-key">Crear API key</button>
      <pre id="api-key-output"></pre>
    </section>
  </div>
  <script>
    async function call(path, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const csrfHeaders = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        ? { 'X-CSRF-Token': window.__ACTION_MONEY_SLOT_ADMIN_CSRF__ }
        : {};
      const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', ...csrfHeaders, ...(options.headers || {}) }
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        return { raw: text, status: response.status };
      }
    }
    document.getElementById('load-games').onclick = async () => {
      document.getElementById('games-output').textContent = JSON.stringify(await call('${versionedApiBase}/admin/games'), null, 2);
    };
    document.getElementById('duplicate-game').onclick = async () => {
      document.getElementById('games-output').textContent = JSON.stringify(await call('${versionedApiBase}/admin/games/1/duplicate', { method: 'POST' }), null, 2);
    };
    document.getElementById('publish-game').onclick = async () => {
      document.getElementById('games-output').textContent = JSON.stringify(await call('${versionedApiBase}/admin/games/1/publish', { method: 'POST' }), null, 2);
    };
    document.getElementById('save-game-config').onclick = async () => {
      const payload = JSON.parse(document.getElementById('game-config').value);
      document.getElementById('games-output').textContent = JSON.stringify(await call('${versionedApiBase}/admin/games/1/config', { method: 'PUT', body: JSON.stringify(payload) }), null, 2);
    };
    document.getElementById('upload-image').onclick = async () => {
      const payload = {
        gameIdentificationNumber: 1,
        fileName: document.getElementById('image-name').value,
        mimeType: 'image/png',
        contentBase64: document.getElementById('image-content').value
      };
      document.getElementById('images-output').textContent = JSON.stringify(await call('${versionedApiBase}/images', { method: 'POST', body: JSON.stringify(payload) }), null, 2);
    };
    document.getElementById('simulate-rtp').onclick = async () => {
      document.getElementById('rtp-output').textContent = JSON.stringify(await call('${versionedApiBase}/games/1/rtp', { method: 'POST', body: JSON.stringify({ spins: 2000 }) }), null, 2);
    };
    document.getElementById('create-api-key').onclick = async () => {
      document.getElementById('api-key-output').textContent = JSON.stringify(await call('${versionedApiBase}/api-keys', { method: 'POST', body: JSON.stringify({ label: document.getElementById('api-key-label').value }) }), null, 2);
    };
  </script>
</body>
</html>`;
}

function createAdminLoginHtml() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ActionMoneySlot Admin Login</title>
</head>
<body>
  <h1>ActionMoneySlot Admin</h1>
  <form id="login-form">
    <label>Admin token <input id="token" type="password" autocomplete="current-password" /></label>
    <button type="submit">Entrar</button>
  </form>
  <pre id="status"></pre>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const response = await fetch('/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: document.getElementById('token').value })
      });
      if (response.ok) {
        window.location.href = '/admin';
        return;
      }
      document.getElementById('status').textContent = await response.text();
    });
  </script>
</body>
</html>`;
}

function extractToken(req, headerName) {
  const header = req.headers[headerName.toLowerCase()];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function parseGameIdFromPath(pattern, pathname) {
  const match = pathname.match(pattern);
  return match ? Number(match[1]) : null;
}

function createBackend(options) {
  const rootDir = options.rootDir;
  const apiBase = options.apiBase || DEFAULT_API_BASE;
  if (apiBase === '/' || apiBase === '/ws') {
    throw new Error('ACTION_MONEY_SLOT_API_BASE cannot be "/" or "/ws" because those paths are reserved for WebSocket upgrades.');
  }
  const versionedApiBase = buildVersionedApiBase(apiBase);
  const apiBasePattern = escapeRegex(apiBase);
  const versionedApiBasePattern = escapeRegex(versionedApiBase);
  const baseGames = discoverGames(rootDir);
  const sessionStore = new SessionStore(baseGames, {
    rootDir,
    dbPath: options.dbPath,
    balance: options.defaults && options.defaults.balance,
    currency: options.defaults && options.defaults.currency,
    language: options.defaults && options.defaults.language,
    playerName: options.defaults && options.defaults.playerName
  });
  const configuredAdminToken = String(process.env.ACTION_MONEY_SLOT_ADMIN_TOKEN || '').trim();
  const adminEnabled = configuredAdminToken && configuredAdminToken !== DEFAULT_ADMIN_TOKEN;
  const adminToken = adminEnabled ? configuredAdminToken : '';
  const adminSessions = new Map();
  const sockets = new Set();
  const webSocketServer = new WebSocketServer({ noServer: true });

  function getAdminSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies.ams_admin_session ? adminSessions.get(cookies.ams_admin_session) || null : null;
  }

  function createAdminSession() {
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomBytes(24).toString('hex');
    adminSessions.set(sessionId, {
      csrfToken,
      createdAt: Date.now()
    });
    return {
      sessionId,
      csrfToken
    };
  }

  function requireAdmin(req, res, shouldSendBody, options = {}) {
    if (!adminEnabled) {
      sendApiJson(res, 503, { error: 'Admin features are disabled until ACTION_MONEY_SLOT_ADMIN_TOKEN is configured.' }, shouldSendBody);
      return false;
    }
    const supplied = extractToken(req, 'x-admin-token');
    const session = getAdminSession(req);
    const method = (req.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (supplied === adminToken) {
      return true;
    }
    if (session && !isMutating) {
      return true;
    }
    if (session && isMutating && extractToken(req, 'x-csrf-token') === session.csrfToken) {
      return true;
    }
    sendApiJson(res, session ? 403 : 401, { error: session ? 'CSRF token required.' : 'Admin token required.' }, shouldSendBody);
    return false;
  }

  function validateImagePayload(payload) {
    const content = Buffer.from(String(payload.contentBase64 || ''), 'base64');
    const detectedMimeType = detectImageMime(content);
    const declaredMimeType = String(payload.mimeType || '').trim().toLowerCase();
    if (!detectedMimeType) {
      return { error: 'Uploaded content is not a supported image.' };
    }
    if (declaredMimeType && detectedMimeType !== declaredMimeType) {
      return { error: `Declared mime type does not match content: ${detectedMimeType}` };
    }
    return {
      content,
      mimeType: detectedMimeType
    };
  }

  function maybeRedactSpinAudit(spins, req) {
    if (adminEnabled && (
      extractToken(req, 'x-admin-token') === adminToken
      || getAdminSession(req)
    )) {
      return spins;
    }
    return spins.map(({ rngBefore, rngAfter, ...entry }) => entry);
  }

  function handleAdminSessionRequest(req, res, shouldSendBody) {
    if (!adminEnabled) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(shouldSendBody ? 'Admin disabled until ACTION_MONEY_SLOT_ADMIN_TOKEN is configured.' : undefined);
      return true;
    }
    if (req.method === 'POST') {
      return readJsonBody(req).then((payload) => {
        const suppliedToken = String(payload.token || extractToken(req, 'x-admin-token') || '').trim();
        if (suppliedToken !== adminToken) {
          sendApiJson(res, 401, { error: 'Admin token required.' }, shouldSendBody);
          return true;
        }
        const sessionInfo = createAdminSession();
        res.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `ams_admin_session=${sessionInfo.sessionId}; HttpOnly; SameSite=Strict; Path=/`
        });
        res.end(shouldSendBody ? JSON.stringify({ ok: true, csrfToken: sessionInfo.csrfToken }) : undefined);
        return true;
      }).catch((error) => {
        sendApiJson(res, 400, { error: error.message }, shouldSendBody);
        return true;
      });
    }
    if (req.method === 'DELETE') {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies.ams_admin_session) {
        adminSessions.delete(cookies.ams_admin_session);
      }
      res.writeHead(204, {
        'Set-Cookie': 'ams_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
      });
      res.end();
      return true;
    }
    res.setHeader('Allow', 'POST, DELETE');
    sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
    return true;
  }

  function requireIntegrationKey(req, res, shouldSendBody) {
    const token = extractToken(req, 'x-api-key');
    const apiKey = sessionStore.authenticateApiKey(token);
    if (!apiKey) {
      sendApiJson(res, 401, { error: 'API key required.' }, shouldSendBody);
      return null;
    }
    return apiKey;
  }

  function getGames() {
    return sessionStore.games;
  }

  webSocketServer.on('connection', (ws) => {
    sockets.add(ws);
    ws.send('1::');

    ws.on('message', (rawMessage) => {
      let request;
      try {
        request = parseIncomingFrame(rawMessage);
      } catch (error) {
        writeJsonFrame(ws, buildFailureResponse(null, error.message));
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

      const games = getGames();
      const requestedGameId = request.gameIdentificationNumber;
      const game = requestedGameId === undefined || requestedGameId === null
        ? resolveGameSelection(games, { gameIdentificationNumber: session.selectedGameId }) || games[0]
        : sessionStore.findGameById(requestedGameId);
      if (!game) {
        writeJsonFrame(ws, buildFailureResponse(request, `Unknown gameIdentificationNumber: ${requestedGameId}`));
        return;
      }

      sessionStore.ensureSessionGame(session, game);

      let response;
      switch (request.command) {
        case 'login':
          response = buildLoginResponse(request, session, games);
          break;
        case 'settings':
          response = buildSettingsResponse(request, session, game, 'settings');
          break;
        case 'configuration':
          response = buildSettingsResponse(request, session, game, 'configuration');
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
        case 'balance':
          response = buildBalanceUpdateResponse(request, session);
          break;
        case 'spin':
          response = handleSpinRequest(request, session, game, sessionStore);
          break;
        case 'bet': {
          const gameCommand = request.bet && request.bet.gameCommand ? request.bet.gameCommand : 'bet';
          if (gameCommand === 'bet' || gameCommand === 'setResult') {
            response = handleSpinRequest(request, session, game, sessionStore);
          } else if (gameCommand === 'collect') {
            response = handleCollect(request, session, game, sessionStore);
          } else {
            response = buildSpinResponse(request, session, game, session.games[game.gameIdentificationNumber].state, {
              balanceBefore: session.balance,
              balanceAfter: session.balance,
              totalBet: 0,
              totalWin: 0,
              lineWinAmount: 0,
              scatterWinAmount: 0,
              bonusWinAmount: 0,
              freeSpinsAwarded: 0,
              freeSpinsConsumed: 0,
              remainingFreeSpins: session.games[game.gameIdentificationNumber].state.freespins || 0,
              respinsAwarded: 0,
              rngBefore: serializeSeed(session.games[game.gameIdentificationNumber].rng.value),
              rngAfter: serializeSeed(session.games[game.gameIdentificationNumber].rng.value)
            }, 'bet');
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

  async function handleVersionedApiRequest(req, res, pathname, shouldSendBody, query, routeOptions = {}) {
    const games = getGames();

    if (pathname === `${versionedApiBase}/games`) {
      if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
        res.setHeader('Allow', 'GET, HEAD');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const demoSession = sessionStore.ensureSession('demo-session');
      sendApiJson(res, 200, { games: games.map((game) => buildGameCatalogEntry(game, demoSession, apiBase, versionedApiBase)) }, shouldSendBody);
      return true;
    }

    const gameDetailsMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/games\\/(\\d+)$`));
    if (gameDetailsMatch) {
      const game = sessionStore.findGameById(gameDetailsMatch[1]);
      if (!game) {
        sendApiJson(res, 404, { error: 'Game not found.' }, shouldSendBody);
        return true;
      }
      const demoSession = sessionStore.ensureSession('demo-session');
      sendApiJson(res, 200, { game: buildGameCatalogEntry(game, demoSession, apiBase, versionedApiBase) }, shouldSendBody);
      return true;
    }

    const gameConfigMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/games\\/(\\d+)\\/config$`));
    if (gameConfigMatch) {
      const game = sessionStore.findGameById(gameConfigMatch[1]);
      if (!game) {
        sendApiJson(res, 404, { error: 'Game not found.' }, shouldSendBody);
        return true;
      }
      sendApiJson(res, 200, {
        gameIdentificationNumber: game.gameIdentificationNumber,
        displayName: game.displayName,
        status: game.status,
        settings: clone(game.settings),
        mathConfig: clone(game.mathConfig)
      }, shouldSendBody);
      return true;
    }

    const gameRtpMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/games\\/(\\d+)\\/rtp$`));
    if (gameRtpMatch) {
      if (!['POST', 'GET', 'HEAD'].includes(req.method || 'GET')) {
        res.setHeader('Allow', 'GET, HEAD, POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const payload = req.method === 'POST' ? await readJsonBody(req) : query;
      const simulation = sessionStore.simulateGameRtp(gameRtpMatch[1], payload);
      if (!simulation) {
        sendApiJson(res, 404, { error: 'Game not found.' }, shouldSendBody);
        return true;
      }
      sendApiJson(res, 200, { simulation }, shouldSendBody);
      return true;
    }

    if (pathname === `${versionedApiBase}/sessions`) {
      if (req.method === 'POST') {
        const payload = await readJsonBody(req);
        const selectedGame = hasGameSelectionInput(payload)
          ? resolveGameSelection(games, payload, { allowDefault: false })
          : resolveGameSelection(games, payload);
        if (!selectedGame) {
          sendApiJson(res, 400, { error: 'Game selection is invalid.' }, shouldSendBody);
          return true;
        }
        const session = sessionStore.createSession({ ...payload, gameIdentificationNumber: selectedGame.gameIdentificationNumber });
        sendApiJson(res, 201, {
          session: sanitizeSessionForApi(session, games),
          launchUrl: buildLaunchUrl(session, selectedGame, apiBase)
        }, shouldSendBody);
        return true;
      }
      if (['GET', 'HEAD'].includes(req.method || 'GET')) {
        sendApiJson(res, 200, { sessions: sessionStore.listSessions().map((session) => sanitizeSessionForApi(session, games)) }, shouldSendBody);
        return true;
      }
      res.setHeader('Allow', 'GET, HEAD, POST');
      sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
      return true;
    }

    const sessionMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/sessions\\/([^/]+)$`));
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
        return true;
      }
      const selectedGame = resolveGameSelection(games, { gameIdentificationNumber: session.selectedGameId }) || games[0];
      sendApiJson(res, 200, {
        session: sanitizeSessionForApi(session, games),
        launchUrl: buildLaunchUrl(session, selectedGame, apiBase)
      }, shouldSendBody);
      return true;
    }

    const sessionBalanceMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/sessions\\/([^/]+)\\/balance$`));
    if (sessionBalanceMatch) {
      const sessionId = decodeURIComponent(sessionBalanceMatch[1]);
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
        return true;
      }
      if (routeOptions.legacyAlias && ['GET', 'HEAD'].includes(req.method || 'GET')) {
        res.setHeader('Allow', 'POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      if (['GET', 'HEAD'].includes(req.method || 'GET')) {
        sendApiJson(res, 200, { balance: session.balance, currency: session.currency }, shouldSendBody);
        return true;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, HEAD, POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
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
      const nextBalance = hasBalance ? Number(payload.balance) : session.balance + Number(payload.amount);
      const updated = sessionStore.updateBalance(sessionId, nextBalance);
      sendApiJson(res, 200, { session: sanitizeSessionForApi(updated, games) }, shouldSendBody);
      return true;
    }

    const sessionSelectMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/sessions\\/([^/]+)\\/select-game$`));
    if (sessionSelectMatch) {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const sessionId = decodeURIComponent(sessionSelectMatch[1]);
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
        return true;
      }
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
      return true;
    }

    const spinHistoryMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/sessions\\/([^/]+)\\/spins$`));
    if (spinHistoryMatch) {
      const sessionId = decodeURIComponent(spinHistoryMatch[1]);
      if (!sessionStore.getSession(sessionId)) {
        sendApiJson(res, 404, { error: 'Session not found.' }, shouldSendBody);
        return true;
      }
      const spins = sessionStore.listSpinHistory(sessionId, query);
      sendApiJson(res, 200, { sessionId, spins: maybeRedactSpinAudit(spins, req) }, shouldSendBody);
      return true;
    }

    if (pathname === `${versionedApiBase}/images`) {
      if (['GET', 'HEAD'].includes(req.method || 'GET')) {
        sendApiJson(res, 200, {
          images: sessionStore.listImages(query).map((image) => ({
            ...image,
            url: buildImageUrl(image.id, versionedApiBase)
          }))
        }, shouldSendBody);
        return true;
      }
      if (req.method === 'POST') {
        if (!requireAdmin(req, res, shouldSendBody)) {
          return true;
        }
        const payload = await readJsonBody(req);
        if (!payload.fileName || !payload.contentBase64) {
          sendApiJson(res, 400, { error: 'fileName and contentBase64 are required.' }, shouldSendBody);
          return true;
        }
        const validatedImage = validateImagePayload(payload);
        if (validatedImage.error) {
          sendApiJson(res, 400, { error: validatedImage.error }, shouldSendBody);
          return true;
        }
        const image = sessionStore.saveImage({ ...payload, mimeType: validatedImage.mimeType });
        sendApiJson(res, 201, { image: { ...image, url: buildImageUrl(image.id, versionedApiBase) } }, shouldSendBody);
        return true;
      }
      res.setHeader('Allow', 'GET, HEAD, POST');
      sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
      return true;
    }

    const imageContentMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/images\\/([^/]+)\\/content$`));
    if (imageContentMatch) {
      const image = sessionStore.getImage(decodeURIComponent(imageContentMatch[1]));
      if (!image || !fs.existsSync(image.storagePath)) {
        sendApiJson(res, 404, { error: 'Image not found.' }, shouldSendBody);
        return true;
      }
      res.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${sanitizeFileName(image.fileName)}"`,
        'Content-Type': image.mimeType,
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(shouldSendBody ? fs.readFileSync(image.storagePath) : undefined);
      return true;
    }

    const imageUpdateMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/images\\/([^/]+)$`));
    if (imageUpdateMatch) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      const imageId = decodeURIComponent(imageUpdateMatch[1]);
      if (req.method === 'PUT') {
        const payload = await readJsonBody(req);
        if (!payload.fileName || !payload.contentBase64) {
          sendApiJson(res, 400, { error: 'fileName and contentBase64 are required.' }, shouldSendBody);
          return true;
        }
        const validatedImage = validateImagePayload(payload);
        if (validatedImage.error) {
          sendApiJson(res, 400, { error: validatedImage.error }, shouldSendBody);
          return true;
        }
        const image = sessionStore.saveImage({ ...payload, mimeType: validatedImage.mimeType }, imageId);
        sendApiJson(res, 200, { image: { ...image, url: buildImageUrl(image.id, versionedApiBase) } }, shouldSendBody);
        return true;
      }
      if (req.method === 'DELETE') {
        const removed = sessionStore.deleteImage(imageId);
        sendApiJson(res, removed ? 200 : 404, removed ? { removed: true } : { error: 'Image not found.' }, shouldSendBody);
        return true;
      }
      res.setHeader('Allow', 'PUT, DELETE');
      sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
      return true;
    }

    if (pathname === `${versionedApiBase}/api-keys`) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (['GET', 'HEAD'].includes(req.method || 'GET')) {
        sendApiJson(res, 200, { apiKeys: sessionStore.listApiKeys() }, shouldSendBody);
        return true;
      }
      if (req.method === 'POST') {
        const payload = await readJsonBody(req);
        const apiKey = sessionStore.createApiKey(payload);
        sendApiJson(res, 201, { apiKey }, shouldSendBody);
        return true;
      }
      res.setHeader('Allow', 'GET, HEAD, POST');
      sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
      return true;
    }

    const apiKeyMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/api-keys\\/([^/]+)$`));
    if (apiKeyMatch) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (req.method !== 'DELETE') {
        res.setHeader('Allow', 'DELETE');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const apiKey = sessionStore.revokeApiKey(decodeURIComponent(apiKeyMatch[1]));
      sendApiJson(res, apiKey ? 200 : 404, apiKey ? { apiKey } : { error: 'API key not found.' }, shouldSendBody);
      return true;
    }

    if (pathname === `${versionedApiBase}/integrations/session-catalog`) {
      const apiKey = requireIntegrationKey(req, res, shouldSendBody);
      if (!apiKey) {
        return true;
      }
      sendApiJson(res, 200, {
        apiKey,
        games: games.map((game) => ({
          gameIdentificationNumber: game.gameIdentificationNumber,
          displayName: game.displayName,
          status: game.status
        }))
      }, shouldSendBody);
      return true;
    }

    if (pathname === `${versionedApiBase}/admin/games`) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (!['GET', 'HEAD', 'POST'].includes(req.method || 'GET')) {
        res.setHeader('Allow', 'GET, HEAD, POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      if (req.method === 'POST') {
        const payload = await readJsonBody(req);
        const game = sessionStore.createGame(payload);
        sendApiJson(res, 201, { game: buildGameCatalogEntry(game, sessionStore.ensureSession('demo-session'), apiBase, versionedApiBase) }, shouldSendBody);
        return true;
      }
      sendApiJson(res, 200, { games: games.map((game) => buildGameCatalogEntry(game, sessionStore.ensureSession('demo-session'), apiBase, versionedApiBase)) }, shouldSendBody);
      return true;
    }

    const adminDuplicateMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/admin\\/games\\/(\\d+)\\/duplicate$`));
    if (adminDuplicateMatch) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const payload = await readJsonBody(req);
      const game = sessionStore.duplicateGame(adminDuplicateMatch[1], payload);
      sendApiJson(res, game ? 201 : 404, game ? { game: buildGameCatalogEntry(game, sessionStore.ensureSession('demo-session'), apiBase, versionedApiBase) } : { error: 'Game not found.' }, shouldSendBody);
      return true;
    }

    const adminConfigMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/admin\\/games\\/(\\d+)\\/config$`));
    if (adminConfigMatch) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (req.method !== 'PUT') {
        res.setHeader('Allow', 'PUT');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const payload = await readJsonBody(req);
      const game = sessionStore.updateGame(adminConfigMatch[1], payload);
      sendApiJson(res, game ? 200 : 404, game ? { game: buildGameCatalogEntry(game, sessionStore.ensureSession('demo-session'), apiBase, versionedApiBase) } : { error: 'Game not found.' }, shouldSendBody);
      return true;
    }

    const adminPublishMatch = pathname.match(new RegExp(`^${versionedApiBasePattern}\\/admin\\/games\\/(\\d+)\\/publish$`));
    if (adminPublishMatch) {
      if (!requireAdmin(req, res, shouldSendBody)) {
        return true;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        sendApiJson(res, 405, { error: 'Method Not Allowed' }, shouldSendBody);
        return true;
      }
      const game = sessionStore.publishGame(adminPublishMatch[1]);
      sendApiJson(res, game ? 200 : 404, game ? { game: buildGameCatalogEntry(game, sessionStore.ensureSession('demo-session'), apiBase, versionedApiBase) } : { error: 'Game not found.' }, shouldSendBody);
      return true;
    }

    return false;
  }

  return {
    get games() {
      return getGames();
    },
    versionedApiBase,
    adminToken,
    sessionStore,
    async handleApiRequest(req, res, pathname, shouldSendBody) {
      const query = parseQueryParams(req.url || '/');
      try {
        if (pathname === apiBase || pathname.startsWith(`${apiBase}/`)) {
          const legacyAlias = !pathname.startsWith(versionedApiBase);
          const translatedPath = pathname.startsWith(versionedApiBase)
            ? pathname
            : pathname.replace(new RegExp(`^${apiBasePattern}`), versionedApiBase);
          return await handleVersionedApiRequest(req, res, translatedPath, shouldSendBody, query, { legacyAlias });
        }
        if (pathname === versionedApiBase || pathname.startsWith(`${versionedApiBase}/`)) {
          return await handleVersionedApiRequest(req, res, pathname, shouldSendBody, query, { legacyAlias: false });
        }
      } catch (error) {
        sendApiJson(res, 400, { error: error.message || 'Bad Request' }, shouldSendBody);
        return true;
      }
      return false;
    },
    handleAdminRequest(req, res, pathname, shouldSendBody) {
      if (pathname === '/admin/session') {
        return handleAdminSessionRequest(req, res, shouldSendBody);
      }
      if (pathname !== '/admin' && pathname !== '/admin/' && pathname !== '/admin/index.html') {
        return false;
      }
      if (!adminEnabled) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(shouldSendBody ? 'Admin disabled until ACTION_MONEY_SLOT_ADMIN_TOKEN is configured.' : undefined);
        return true;
      }
      const session = getAdminSession(req);
      if (!session) {
        res.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8'
        });
        res.end(shouldSendBody ? createAdminLoginHtml() : undefined);
        return true;
      }
      res.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end(shouldSendBody ? createAdminPanelHtml({ versionedApiBase }).replace('</body>', `<script>window.__ACTION_MONEY_SLOT_ADMIN_CSRF__=${JSON.stringify(session.csrfToken)};</script></body>`) : undefined);
      return true;
    },
    handleUpgrade(req, socket, head) {
      if ((req.method || 'GET') !== 'GET') {
        socket.destroy();
        return;
      }
      const upgradeHeader = String(req.headers.upgrade || '').toLowerCase();
      const connectionHeader = String(req.headers.connection || '').toLowerCase();
      if (
        upgradeHeader !== 'websocket'
        || !connectionHeader.split(',').map((value) => value.trim()).includes('upgrade')
        || !req.headers['sec-websocket-key']
      ) {
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
      let finalized = false;
      const shutdownTimer = setTimeout(() => {
        trackedSockets.forEach((ws) => {
          try {
            ws.terminate();
          } catch (error) {}
        });
        finalize(new Error('Timed out shutting down backend WebSocket connections.'));
      }, SHUTDOWN_TIMEOUT_MS);

      function finalize(error) {
        if (finalized) {
          return;
        }
        finalized = true;
        clearTimeout(shutdownTimer);
        sessionStore.close();
        done(error || null);
      }

      if (!trackedSockets.length) {
        finalize(null);
        return;
      }

      let remaining = trackedSockets.length;
      trackedSockets.forEach((ws) => {
        const finishOne = () => {
          remaining -= 1;
          if (remaining <= 0) {
            finalize(null);
          }
        };
        ws.once('close', finishOne);
        try {
          ws.close();
        } catch (error) {
          finishOne();
        }
      });
    }
  };
}

module.exports = {
  DEFAULT_API_BASE,
  buildDefaultMathConfig,
  createBackend,
  discoverGames,
  parsePathname,
  simulateRtp,
  spin
};
