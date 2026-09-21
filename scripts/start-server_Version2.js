 const server = http.createServer((req, res) => {
   const cleanPath = decodeURIComponent((req.url || '/').split('?')[0]);
-  const relativePath = cleanPath === '/' ? '/ActionMoneyEGT/html5/index.html' : cleanPath;
+
+  if (cleanPath === '/') {
+    res.writeHead(302, {
+      Location: '/ActionMoneyEGT/html5/index.html'
+    });
+    res.end();
+    return;
+  }
+
+  const relativePath = cleanPath;
   const absolutePath = path.join(ROOT, relativePath);
