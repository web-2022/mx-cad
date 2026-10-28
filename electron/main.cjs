const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
let server;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.dxf': 'application/octet-stream' };
app.whenReady().then(() => {
  const root = path.resolve(__dirname, '../dist');
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Archivo no encontrado'); }
  });
  server.listen(0, '127.0.0.1', () => {
    const win = new BrowserWindow({ show: process.env.MX_CAD_TEST !== '1', width: 1440, height: 940, minWidth: 820, minHeight: 620, title: 'MX CAD', backgroundColor: '#10151d', autoHideMenuBar: true, webPreferences: { backgroundThrottling: false, nodeIntegration: false, contextIsolation: true, sandbox: true } });
    const origin = `http://127.0.0.1:${server.address().port}`;
    win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    win.loadURL(origin);
  });
});
app.on('window-all-closed', () => { server?.close(); app.quit(); });
