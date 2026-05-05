const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const axios = require('axios');
const cheerio = require('cheerio');

// Render Port
const PORT = process.env.PORT || 3000;

// DIRECT SCRAPER LOGIC
async function scrapeInstagram(videoUrl) {
  try {
    console.log(`[Scraper] Analysing: ${videoUrl}`);
    
    // Method 1: Vytal API (Most stable for Render)
    try {
      const res = await axios.get(`https://api.vytal.io/api/info?url=${encodeURIComponent(videoUrl)}`);
      if (res.data && res.data.url) {
        console.log('[Scraper] Method 1 Success');
        return { url: res.data.url, filename: res.data.title || 'Instagram Media' };
      }
    } catch(e) { console.log('[Scraper] Method 1 Failed'); }

    // Method 2: Pawan API
    try {
      const res = await axios.get(`https://api.pawan.krd/api/download?url=${encodeURIComponent(videoUrl)}`);
      if (res.data && (res.data.url || res.data.link)) {
        console.log('[Scraper] Method 2 Success');
        return { url: res.data.url || res.data.link, filename: res.data.title || 'Instagram Media' };
      }
    } catch(e) { console.log('[Scraper] Method 2 Failed'); }

    // Method 3: Direct Meta Extraction (Fallback)
    const response = await axios.get(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);
    const video = $('meta[property="og:video"]').attr('content');
    const image = $('meta[property="og:image"]').attr('content');
    
    if (video) return { url: video, filename: 'Instagram Video' };
    if (image) return { url: image, filename: 'Instagram Photo' };

    throw new Error('All methods failed. Please check if the link is public.');
  } catch (err) {
    throw err;
  }
}

// SERVER
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const cors = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json' 
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method === 'POST' && parsed.pathname === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url: targetUrl } = JSON.parse(body);
        const result = await scrapeInstagram(targetUrl);
        res.writeHead(200, cors);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Serve static files
  let file = path.join(__dirname, parsed.pathname === '/' ? 'downloadweb.html' : parsed.pathname);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      const ext = path.extname(file);
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Direct Scraper Server running on port ${PORT}`);
});
