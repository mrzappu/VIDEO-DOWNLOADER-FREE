const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Use Render's PORT or default to 3000
const PORT = process.env.PORT || 3000;

// High-performance Cobalt mirrors for social media (Non-YouTube focus)
const MIRRORS = [
  'cobalt.canine.tools',
  'cobalt.meowing.de',
  'cobalt.clxxped.lol',
  'cobalt.kittycat.boo',
  'cobalt.liubquanti.click',
  'dl.woof.monster',
  'qwkuns.me',
  'cobalt.cjs.nz',
  'cobalt.0x51d.io',
  'cobalt.api.kwi.be'
];

// Try paths for a mirror
function tryPaths(mirrorHost, body, res, mirrorIndex) {
  const paths = ['/', '/api/json'];
  let pathIndex = 0;

  function nextPath() {
    if (pathIndex >= paths.length) {
      tryMirrors(body, mirrorIndex + 1, res);
      return;
    }

    const currentPath = paths[pathIndex];
    console.log(`[Server] Trying ${mirrorHost}${currentPath}...`);
    
    requestCobalt(mirrorHost, currentPath, body, (err, data) => {
      if (err || (data && data.status === 'error')) {
        console.warn(`[Server] ${mirrorHost}${currentPath} failed.`);
        pathIndex++;
        nextPath();
      } else {
        console.log(`[Server] ✅ Success!`);
        res.writeHead(200, corsHeaders());
        res.end(JSON.stringify(data));
      }
    });
  }

  nextPath();
}

// Low-level request with enhanced headers
function requestCobalt(mirrorHost, apiPath, body, callback) {
  const options = {
    hostname: mirrorHost,
    port: 443,
    path: apiPath,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': `https://${mirrorHost}`,
      'Referer': `https://${mirrorHost}/`
    }
  };

  const req = https.request(options, (res) => {
    const encoding = res.headers['content-encoding'];
    let stream = res;
    if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
    else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
    else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

    let data = '';
    stream.on('data', chunk => data += chunk);
    stream.on('end', () => {
      try {
        callback(null, JSON.parse(data));
      } catch(e) {
        callback(new Error(`Status ${res.statusCode}`));
      }
    });
  });

  req.on('error', (e) => callback(e));
  req.setTimeout(10000, () => { req.destroy(); callback(new Error('Timeout')); });
  req.write(body);
  req.end();
}

function tryMirrors(body, index, res) {
  if (index >= MIRRORS.length) {
    // Cobalt failed, try Fallback Engine
    console.log('[Server] ⚠️ All Cobalt mirrors failed. Trying Fallback Engine...');
    tryFallback(body, res);
    return;
  }
  tryPaths(MIRRORS[index], body, res, index);
}

// Fallback Engine (Using a different API provider)
function tryFallback(body, res) {
  try {
    const data = JSON.parse(body);
    const targetUrl = data.url;
    
    // Backup API: Vytal (Good for Instagram/TikTok)
    const backupUrl = `https://api.vytal.io/api/info?url=${encodeURIComponent(targetUrl)}`;
    
    https.get(backupUrl, (backupRes) => {
      let dataStr = '';
      backupRes.on('data', chunk => dataStr += chunk);
      backupRes.on('end', () => {
        try {
          const result = JSON.parse(dataStr);
          if (result.status === 'ok') {
            console.log('[Server] ✅ Success via Fallback Engine!');
            res.writeHead(200, corsHeaders());
            res.end(JSON.stringify({
              status: 'stream',
              url: result.url,
              filename: result.title || 'video'
            }));
          } else {
            throw new Error('Fallback failed');
          }
        } catch (e) {
          res.writeHead(502, corsHeaders());
          res.end(JSON.stringify({ status: 'error', error: { code: 'all_engines_failed' } }));
        }
      });
    }).on('error', (err) => {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ status: 'error', error: { code: 'network_error' } }));
    });
  } catch (e) {
    res.writeHead(500, corsHeaders());
    res.end(JSON.stringify({ status: 'error', error: { code: 'server_error' } }));
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type': 'application/json'
  };
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === 'POST' && parsedUrl.pathname === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      tryMirrors(body, 0, res);
    });
    return;
  }

  // Serve static files (Crucial for Render)
  let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'downloadweb.html' : parsedUrl.pathname);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

