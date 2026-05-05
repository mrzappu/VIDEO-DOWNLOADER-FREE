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
    
    // Fetch the page with a browser-like User-Agent
    const response = await axios.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Look for video or image in meta tags
    const video = $('meta[property="og:video"]').attr('content') || 
                  $('meta[property="og:video:secure_url"]').attr('content');
    
    const image = $('meta[property="og:image"]').attr('content');
    const title = $('meta[property="og:title"]').attr('content') || 'Instagram Media';

    if (video) {
      return { url: video, filename: title, type: 'video' };
    } else if (image) {
      return { url: image, filename: title, type: 'image' };
    }

    // Fallback if meta tags fail: Try Vevioz Proxy (Internal)
    const backupRes = await axios.get(`https://api.vytal.io/api/info?url=${encodeURIComponent(videoUrl)}`);
    if (backupRes.data && backupRes.data.url) {
      return { url: backupRes.data.url, filename: backupRes.data.title || title };
    }

    throw new Error('Could not find media link.');
  } catch (err) {
    console.error(`[Scraper] Error: ${err.message}`);
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
