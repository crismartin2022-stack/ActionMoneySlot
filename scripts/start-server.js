const fs = require('fs');
const path = require('path');
const http = require('http');
const { DEFAULT_API_BASE, createBackend, parsePathname } = require('./game-backend');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = normalizePort(process.env.PORT, 8080);
const ROOT = path.resolve(__dirname, '..');
const STATIC_ROUTE_PREFIX = '/ActionMoneyEGT';
const STATIC_ROOT = path.join(ROOT, 'ActionMoneyEGT');
const APP_ROUTE_PREFIX = '/app';
const APP_ROOT = path.join(ROOT, 'app');
const LEGACY_ENTRYPOINT = '/ActionMoneyEGT/html5/index.html';
const DEFAULT_ENTRYPOINT = '/app/index.html';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.fnt': 'text/plain; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function buildRuntimeConfig(env) {
  const source = env || process.env;
  const tcpHost = getFirstDefined([
    source.ACTION_MONEY_SLOT_TCP_HOST,
    source.TCP_HOST
  ]);
  const tcpPort = getFirstDefined([
    source.ACTION_MONEY_SLOT_TCP_PORT,
    source.TCP_PORT
  ]);
  const gameName = getFirstDefined([
    source.ACTION_MONEY_SLOT_GAME_NAME,
    source.GAME_NAME,
    'ActionMoneySlot'
  ]);
  const language = getFirstDefined([
    source.ACTION_MONEY_SLOT_LANGUAGE,
    source.LANGUAGE,
    'en'
  ]);
  const currency = getFirstDefined([
    source.ACTION_MONEY_SLOT_CURRENCY,
    source.CURRENCY,
    'EUR'
  ]);
  const token = getFirstDefined([
    source.ACTION_MONEY_SLOT_TOKEN,
    source.TOKEN
  ]);
  const apiBase = getFirstDefined([
    source.ACTION_MONEY_SLOT_API_BASE,
    source.API_BASE,
    DEFAULT_API_BASE
  ]);
  const sslHostValue = getFirstDefined([
    source.ACTION_MONEY_SLOT_SSL_HOST,
    source.SSL_HOST
  ]);

  const runtimeConfig = {
    gameName,
    game: gameName,
    language,
    currency,
    apiBase
  };

  if (tcpHost) {
    runtimeConfig.tcpHost = tcpHost;
  }
  if (tcpPort) {
    runtimeConfig.tcpPort = tcpPort;
  }

  const sslHost = normalizeOptionalBoolean(sslHostValue);
  if (typeof sslHost === 'boolean') {
    runtimeConfig.sslHost = sslHost;
  }
  if (token) {
    runtimeConfig.token = token;
    runtimeConfig.sessionId = token;
  }

  return runtimeConfig;
}

function getFirstDefined(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function normalizeOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return undefined;
}

function normalizePort(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  if (!/^\d+$/.test(String(value).trim())) {
    throw new Error('PORT must be a numeric TCP port.');
  }

  const port = Number(String(value).trim());
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535.');
  }

  return port;
}

function sendJson(res, statusCode, body, shouldSendBody) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(shouldSendBody ? JSON.stringify(body) : undefined);
}

function inferSameOriginRuntimeConfig(req, runtimeConfig) {
  const inferredConfig = { ...runtimeConfig };
  const forwardedProtoHeader = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'];
  const forwardedProto = typeof forwardedProtoHeader === 'string'
    ? forwardedProtoHeader.split(',')[0].trim().toLowerCase()
    : '';
  const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const requestUrl = hostHeader ? `http://${hostHeader}` : null;
  const parsedHost = requestUrl ? new URL(requestUrl) : null;

  if (!inferredConfig.tcpHost && parsedHost) {
    inferredConfig.tcpHost = parsedHost.hostname;
  }

  if (!inferredConfig.tcpPort) {
    if (parsedHost && parsedHost.port) {
      inferredConfig.tcpPort = parsedHost.port;
    } else {
      inferredConfig.tcpPort = forwardedProto === 'https' ? '443' : '80';
    }
  }

  if (typeof inferredConfig.sslHost !== 'boolean') {
    inferredConfig.sslHost = forwardedProto === 'https';
  }

  return inferredConfig;
}

function sendRuntimeConfig(req, res, runtimeConfig, shouldSendBody) {
  const effectiveRuntimeConfig = inferSameOriginRuntimeConfig(req, runtimeConfig);
  const body = `window.__ACTION_MONEY_SLOT_CONFIG = ${JSON.stringify(effectiveRuntimeConfig, null, 2)};\n`;
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/javascript; charset=utf-8'
  });
  res.end(shouldSendBody ? body : undefined);
}

function sendFile(filePath, res, shouldSendBody) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      const statusCode = error.code === 'ENOENT' ? 404 : 500;
      res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(shouldSendBody ? (statusCode === 404 ? 'Not Found' : 'Internal Server Error') : undefined);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
    });
    res.end(shouldSendBody ? content : undefined);
  });
}

function decodeRequestPath(requestPath) {
  let cleanPath;

  try {
    cleanPath = decodeURIComponent((requestPath || '/').split('?')[0]);
  } catch (error) {
    return {
      error: 400
    };
  }

  return {
    cleanPath
  };
}

function resolveMountedPath(cleanPath, routePrefix, rootPath) {
  if (cleanPath !== routePrefix && !cleanPath.startsWith(`${routePrefix}/`)) {
    return null;
  }
  const relativeRequestPath = cleanPath === routePrefix
    ? ''
    : cleanPath.slice(routePrefix.length + 1);
  const normalizedPath = path.resolve(rootPath, relativeRequestPath || '.');
  const relativeToRoot = path.relative(rootPath, normalizedPath);
  if (
    relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToRoot)
  ) {
    return { error: 403 };
  }
  return { filePath: normalizedPath };
}

function resolveRequestPath(cleanPath) {
  if (cleanPath === '/') {
    return {
      redirect: DEFAULT_ENTRYPOINT
    };
  }

  if (cleanPath === '/legacy') {
    return {
      redirect: LEGACY_ENTRYPOINT
    };
  }

  if (cleanPath === APP_ROUTE_PREFIX) {
    return {
      redirect: DEFAULT_ENTRYPOINT
    };
  }

  if (cleanPath === STATIC_ROUTE_PREFIX) {
    return {
      redirect: LEGACY_ENTRYPOINT
    };
  }

  const appPath = resolveMountedPath(cleanPath, APP_ROUTE_PREFIX, APP_ROOT);
  if (appPath) {
    return appPath;
  }

  const staticPath = resolveMountedPath(cleanPath, STATIC_ROUTE_PREFIX, STATIC_ROOT);
  if (staticPath) {
    return staticPath;
  }

  return {
    error: 404
  };
}

function createServer(options) {
  const runtimeConfig = options && options.runtimeConfig ? options.runtimeConfig : buildRuntimeConfig();
  const backend = createBackend({
    rootDir: ROOT,
    apiBase: runtimeConfig.apiBase,
    dbPath: options && options.backendOptions && options.backendOptions.dbPath
      ? options.backendOptions.dbPath
      : process.env.ACTION_MONEY_SLOT_DB_PATH,
    defaults: {
      balance: process.env.ACTION_MONEY_SLOT_START_BALANCE,
      currency: runtimeConfig.currency,
      language: runtimeConfig.language,
      playerName: process.env.ACTION_MONEY_SLOT_PLAYER_NAME
    }
  });

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const shouldSendBody = method !== 'HEAD';
    const pathname = parsePathname(req.url || '/');

    if (pathname === runtimeConfig.apiBase || pathname.startsWith(`${runtimeConfig.apiBase}/`)) {
      const handled = await backend.handleApiRequest(req, res, pathname, shouldSendBody);
      if (!handled) {
        sendJson(res, 404, { error: 'Not Found' }, shouldSendBody);
      }
      return;
    }

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const handled = backend.handleAdminRequest(req, res, pathname, shouldSendBody);
      if (!handled) {
        sendJson(res, 404, { error: 'Not Found' }, shouldSendBody);
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(method)) {
      res.writeHead(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(shouldSendBody ? 'Method Not Allowed' : undefined);
      return;
    }

    const decodedRequestPath = decodeRequestPath(req.url);

    if (decodedRequestPath.error) {
      res.writeHead(decodedRequestPath.error, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end(shouldSendBody ? 'Bad Request' : undefined);
      return;
    }

    const requestPath = decodedRequestPath.cleanPath;

    if (requestPath === '/health' || requestPath === '/healthz') {
      sendJson(res, 200, {
        ok: true,
        entrypoint: DEFAULT_ENTRYPOINT,
        legacyEntrypoint: LEGACY_ENTRYPOINT,
        apiBase: runtimeConfig.apiBase,
        versionedApiBase: backend.versionedApiBase,
        games: backend.games.map((game) => ({
          gameIdentificationNumber: game.gameIdentificationNumber,
          gameName: game.gameName,
          gameType: game.gameType
        }))
      }, shouldSendBody);
      return;
    }

    if (requestPath === '/runtime-config.js') {
      sendRuntimeConfig(req, res, runtimeConfig, shouldSendBody);
      return;
    }

    const resolvedPath = resolveRequestPath(requestPath);

    if (resolvedPath.redirect) {
      res.writeHead(302, {
        Location: resolvedPath.redirect
      });
      res.end();
      return;
    }

    if (resolvedPath.error) {
      const statusCode = resolvedPath.error;
      res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      let responseBody = 'Forbidden';
      if (statusCode === 400) {
        responseBody = 'Bad Request';
      } else if (statusCode === 404) {
        responseBody = 'Not Found';
      }
      res.end(shouldSendBody ? responseBody : undefined);
      return;
    }

    fs.stat(resolvedPath.filePath, (error, stats) => {
      if (!error && stats.isDirectory()) {
        sendFile(path.join(resolvedPath.filePath, 'index.html'), res, shouldSendBody);
        return;
      }

      sendFile(resolvedPath.filePath, res, shouldSendBody);
    });
  });

  const upgradeHandler = (req, socket, head) => {
    backend.handleUpgrade(req, socket, head);
  };
  server.on('upgrade', upgradeHandler);

  const originalClose = server.close.bind(server);
  let isClosing = false;
  let isClosed = false;
  const closeCallbacks = [];
  server.once('close', () => {
    isClosed = true;
  });

  function createNotRunningError() {
    const error = new Error('Server is not running.');
    error.code = 'ERR_SERVER_NOT_RUNNING';
    return error;
  }

  function flushCloseCallbacks(error) {
    while (closeCallbacks.length) {
      const callback = closeCallbacks.shift();
      callback(error);
    }
  }

  server.close = (callback) => {
    if (isClosed) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(createNotRunningError()));
      }
      return server;
    }
    if (typeof callback === 'function') {
      closeCallbacks.push(callback);
    }
    if (isClosing) {
      return server;
    }
    isClosing = true;
    server.off('upgrade', upgradeHandler);
    if (!server.listening) {
      backend.shutdown((backendError) => {
        isClosed = true;
        isClosing = false;
        flushCloseCallbacks(backendError || createNotRunningError());
      });
      return server;
    }
    backend.shutdown((backendError) => {
      originalClose((serverError) => {
        const finalError = backendError || serverError || null;
        if (finalError && finalError.code !== 'ERR_SERVER_NOT_RUNNING' && !isClosed) {
          isClosing = false;
        } else {
          isClosed = true;
        }
        flushCloseCallbacks(finalError);
      });
    });
    return server;
  };

  return server;
}

function startServer() {
  const server = createServer();

  server.on('error', (error) => {
    console.error('Failed to start ActionMoneySlot server:', error);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(
      `ActionMoneySlot server listening on http://${HOST}:${PORT} -> ${DEFAULT_ENTRYPOINT} (legacy: ${LEGACY_ENTRYPOINT})`
    );
  });

  return server;
}

module.exports = {
  APP_ROUTE_PREFIX,
  DEFAULT_ENTRYPOINT,
  LEGACY_ENTRYPOINT,
  HOST,
  PORT,
  buildRuntimeConfig,
  createServer,
  decodeRequestPath,
  inferSameOriginRuntimeConfig,
  normalizeOptionalBoolean,
  normalizePort,
  resolveRequestPath,
  startServer
};

if (require.main === module) {
  startServer();
}
