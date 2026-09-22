const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = normalizePort(process.env.PORT, 8080);
const ROOT = path.resolve(__dirname, '..');
const STATIC_ROUTE_PREFIX = '/ActionMoneyEGT';
const STATIC_ROOT = path.join(ROOT, 'ActionMoneyEGT');
const DEFAULT_ENTRYPOINT = '/ActionMoneyEGT/html5/index.html';

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
  const sslHostValue = getFirstDefined([
    source.ACTION_MONEY_SLOT_SSL_HOST,
    source.SSL_HOST
  ]);

  const runtimeConfig = {
    gameName,
    game: gameName,
    language,
    currency
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

function sendRuntimeConfig(res, runtimeConfig, shouldSendBody) {
  const body = `window.__ACTION_MONEY_SLOT_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`;
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

function resolveRequestPath(cleanPath) {
  if (cleanPath === '/') {
    return {
      redirect: DEFAULT_ENTRYPOINT
    };
  }

  if (cleanPath === STATIC_ROUTE_PREFIX) {
    return {
      redirect: DEFAULT_ENTRYPOINT
    };
  }

  if (!cleanPath.startsWith(`${STATIC_ROUTE_PREFIX}/`)) {
    return {
      error: 404
    };
  }

  const relativeRequestPath = cleanPath.slice(STATIC_ROUTE_PREFIX.length + 1);
  const normalizedPath = path.resolve(STATIC_ROOT, relativeRequestPath || '.');
  const relativeToStaticRoot = path.relative(STATIC_ROOT, normalizedPath);

  if (
    relativeToStaticRoot === '..'
    || relativeToStaticRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToStaticRoot)
  ) {
    return {
      error: 403
    };
  }

  return {
    filePath: normalizedPath
  };
}

function createServer(options) {
  const runtimeConfig = options && options.runtimeConfig ? options.runtimeConfig : buildRuntimeConfig();

  return http.createServer((req, res) => {
    const method = req.method || 'GET';
    const shouldSendBody = method !== 'HEAD';
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
        entrypoint: DEFAULT_ENTRYPOINT
      }, shouldSendBody);
      return;
    }

    if (requestPath === '/runtime-config.js') {
      sendRuntimeConfig(res, runtimeConfig, shouldSendBody);
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
}

function startServer() {
  const server = createServer();

  server.on('error', (error) => {
    console.error('Failed to start ActionMoneySlot server:', error);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(
      `ActionMoneySlot server listening on http://${HOST}:${PORT} -> ${DEFAULT_ENTRYPOINT}`
    );
  });

  return server;
}

module.exports = {
  DEFAULT_ENTRYPOINT,
  HOST,
  PORT,
  buildRuntimeConfig,
  createServer,
  decodeRequestPath,
  normalizeOptionalBoolean,
  normalizePort,
  resolveRequestPath,
  startServer
};

if (require.main === module) {
  startServer();
}
