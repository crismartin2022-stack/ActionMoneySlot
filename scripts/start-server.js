const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, '..');
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

const runtimeConfig = buildRuntimeConfig();

function buildRuntimeConfig() {
  const tcpHost = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_TCP_HOST,
    process.env.TCP_HOST,
    'mgs-demo.egtmgs.com'
  ]);
  const tcpPort = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_TCP_PORT,
    process.env.TCP_PORT,
    '8095'
  ]);
  const gameName = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_GAME_NAME,
    process.env.GAME_NAME,
    'ActionMoneySlot'
  ]);
  const language = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_LANGUAGE,
    process.env.LANGUAGE,
    'en'
  ]);
  const currency = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_CURRENCY,
    process.env.CURRENCY,
    'EUR'
  ]);
  const token = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_TOKEN,
    process.env.TOKEN,
    'local-test-token'
  ]);
  const sslHostValue = getFirstDefined([
    process.env.ACTION_MONEY_SLOT_SSL_HOST,
    process.env.SSL_HOST,
    'true'
  ]);

  return {
    tcpHost,
    tcpPort,
    sslHost: normalizeBoolean(sslHostValue, true),
    gameName,
    game: gameName,
    language,
    currency,
    token
  };
}

function getFirstDefined(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
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

  return fallback;
}

function sendJson(res, statusCode, body, shouldSendBody) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(shouldSendBody ? JSON.stringify(body) : undefined);
}

function sendRuntimeConfig(res, shouldSendBody) {
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

  const relativeRequestPath = cleanPath.replace(/^\/+/, '');
  const normalizedPath = path.normalize(path.join(ROOT, relativeRequestPath));
  const relativePath = path.relative(ROOT, normalizedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return {
      error: 403
    };
  }

  return {
    filePath: normalizedPath
  };
}

const server = http.createServer((req, res) => {
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
    sendRuntimeConfig(res, shouldSendBody);
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
    res.end(shouldSendBody ? (statusCode === 400 ? 'Bad Request' : 'Forbidden') : undefined);
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

server.listen(PORT, HOST, () => {
  console.log(
    `ActionMoneySlot server listening on http://${HOST}:${PORT} -> ${DEFAULT_ENTRYPOINT}`
  );
});
