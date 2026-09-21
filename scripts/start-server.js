const server = http.createServer((req, res) => {
  const cleanPath = decodeURIComponent(
    (req.url || '/').split('?')[0]
  );

  if (cleanPath === '/') {
    res.writeHead(302, {
      Location: '/ActionMoneyEGT/html5/index.html'
    });
    res.end();
    return;
  }

  const relativePath = cleanPath;
  const absolutePath = path.join(ROOT, relativePath);
  const normalizedPath = path.normalize(absolutePath);

  if (!normalizedPath.startsWith(ROOT)) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('Forbidden');
    return;
  }

  fs.stat(normalizedPath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      return sendFile(
        path.join(normalizedPath, 'index.html'),
        res
      );
    }

    sendFile(normalizedPath, res);
  });
});
