const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Use Render's PORT or default to 3000
const PORT = process.env.PORT || 3000;

// High-performance Cobalt mirrors
const MIRRORS = [
  'https://cobalt.canine.tools',
  'https://cobalt.meowing.de',
  'https://cobalt.clxxped.lol',
  'https://cobalt.kittycat.boo',
  'https://cobalt.liubquanti.click',
  'https://dl.woof.monster',
  'https://qwkuns.me',
  'https://cobalt.cjs.nz',
  'https://cobalt.0x51d.io',
  'https://cobalt.api.kwi.be'
];

// Fallback APIs
const FALLBACK_APIS = [
  'https://api.vytal.io/api/info?url=',
  'https://api.downloadanyvideo.com/api/info?url='
];

// Helper to make POST requests
function postRequest(targetUrl, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path === '/' ? '/' : parsedUrl.path,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': `https://${parsedUrl.hostname}`,
        'Referer': `https://${parsedUrl.hostname}/`
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Helper to make GET requests
function getRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

// Main logic to find a working download link (Ultra-Stable Version)
async function findDownload(videoUrl) {
  console.log(`[Server] Analysing: ${videoUrl}`);
  
  // High-reliability engine
  const api = `https://api.vytal.io/api/info?url=${encodeURIComponent(videoUrl)}`;

  try {
    const result = await getRequest(api);
    if (result.status === 'ok' || result.url) {
      return {
        status: 'stream',
        url: result.url || result.data?.url,
        filename: result.title || 'video'
      };
    } else {
      throw new Error('API returned invalid status');
    }
  } catch (err) {
    console.error(`[Server] Error: ${err.message}`);
    throw new Error('Could not find video. Please check the link.');
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);

  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // API Endpoint
  if (req.method === 'POST' && parsedUrl.pathname === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const result = await findDownload(params.url, params.videoQuality);
        res.writeHead(200, headers);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(502, headers);
        res.end(JSON.stringify({ status: 'error', error: { code: err.message } }));
      }
    });
    return;
  }

  // Serve static files (HTML/CSS)
  let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'downloadweb.html' : parsedUrl.pathname);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

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
  console.log(`🚀 Master Server running on port ${PORT}`);
});
