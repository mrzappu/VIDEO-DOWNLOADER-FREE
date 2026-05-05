const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Render Port
const PORT = process.env.PORT || 3000;

// HELPERS
function getRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function postRequest(targetUrl, body) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'Mozilla/5.0'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// THE ULTIMATE ENGINE
async function findDownload(videoUrl) {
  console.log(`[Server] Searching: ${videoUrl}`);
  
  // Strategy 1: Vytal API (Very stable for Insta/TikTok)
  try {
    const res = await getRequest(`https://api.vytal.io/api/info?url=${encodeURIComponent(videoUrl)}`);
    if (res.status === 'ok' && res.url) {
      console.log('[Server] Success via Vytal');
      return { url: res.url, filename: res.title || 'video' };
    }
  } catch(e) {}

  // Strategy 2: Pawan API (Good Backup)
  try {
    const res = await getRequest(`https://api.pawan.krd/api/download?url=${encodeURIComponent(videoUrl)}`);
    if (res.status === 'ok' || res.url) {
      console.log('[Server] Success via Pawan');
      return { url: res.url || res.link, filename: res.title || 'video' };
    }
  } catch(e) {}

  // Strategy 3: Cobalt Mirrors (Final Hope)
  const mirrors = ['https://cobalt.canine.tools', 'https://cobalt.liubquanti.click', 'https://cobalt.meowing.de'];
  for (const m of mirrors) {
    try {
      const res = await postRequest(m + '/api/json', { url: videoUrl, videoQuality: '1080' });
      if (res.status !== 'error' && res.url) {
        console.log(`[Server] Success via Mirror: ${m}`);
        return { url: res.url, filename: res.filename || 'video' };
      }
    } catch(e) {}
  }

  throw new Error('All engines busy. Try another link.');
}

// SERVER
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (req.method === 'POST' && parsed.pathname === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const result = await findDownload(JSON.parse(body).url);
        res.writeHead(200, cors);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ status: 'error', error: { code: err.message } }));
      }
    });
    return;
  }

  // Serving static files
  let file = path.join(__dirname, parsed.pathname === '/' ? 'downloadweb.html' : parsed.pathname);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); }
    else {
      const ext = path.extname(file);
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ultimate Server on ${PORT}`));
