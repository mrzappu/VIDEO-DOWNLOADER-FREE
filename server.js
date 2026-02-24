// server.js - YouTube Direct Downloader - COMPLETE FIXED VERSION
require('dotenv').config();

// ==================== UNDICI PATCH FOR NODE 18 ====================
// This must be at the VERY TOP before any other requires
if (process.versions.node.startsWith('18')) {
    console.log('⚠️ Node.js 18 detected - applying undici polyfill');
    if (typeof globalThis.File === 'undefined') {
        globalThis.File = class File {
            constructor(bits, name, options = {}) {
                this.name = name;
                this.size = Array.isArray(bits) ? bits.length : (bits?.length || 0);
                this.type = options.type || '';
                this.lastModified = options.lastModified || Date.now();
            }
        };
        console.log('✅ Added File polyfill for Node.js 18');
    }
}

// ==================== DEPENDENCIES ====================
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const contentDisposition = require('content-disposition');
const mime = require('mime-types');
const sanitize = require('sanitize-filename');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const TEMP_DIR = process.env.RENDER ? '/tmp/youtube-downloader' : path.join(__dirname, 'temp');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Ensure directories exist
[TEMP_DIR, DOWNLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Rate limiting map
const rateLimitMap = new Map();

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many requests, slow down!' }
});
app.use('/api/', limiter);

// ==================== USER AGENTS FOR ROTATION ====================
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// ==================== CLIENT TYPES ====================
const clients = [
    { name: 'ANDROID', id: '3', version: '19.09.37' },
    { name: 'IOS', id: '5', version: '19.09.3' },
    { name: 'WEB', id: '1', version: '2.20250101.00.00' },
    { name: 'WEB_EMBEDDED', id: '56', version: '2.20250101.00.00' }
];

// ==================== UTILITY FUNCTIONS ====================
function sanitizeFilename(name) {
    return sanitize(name).replace(/\s+/g, '_').substring(0, 100) || 'video';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== MAIN DOWNLOAD FUNCTION ====================
async function downloadYouTube(url, format = 'mp4', quality = 'highest') {
    console.log(`📥 Downloading: ${url.substring(0, 50)}...`);
    
    // Try multiple methods in sequence
    const methods = [
        { name: 'ytdl-android', fn: tryYtdlWithClient('ANDROID') },
        { name: 'ytdl-ios', fn: tryYtdlWithClient('IOS') },
        { name: 'ytdl-web', fn: tryYtdlWithClient('WEB') },
        { name: 'yt-dlp', fn: tryYtDlp }
    ];
    
    for (const method of methods) {
        try {
            console.log(`🔄 Trying method: ${method.name}`);
            const result = await method.fn(url, format, quality);
            if (result) return result;
        } catch (e) {
            console.log(`❌ ${method.name} failed: ${e.message}`);
        }
        await delay(1000);
    }
    
    throw new Error('All download methods failed');
}

// Method 1: ytdl-core with different clients
function tryYtdlWithClient(clientType) {
    return async (url, format, quality) => {
        const client = clients.find(c => c.name === clientType) || clients[0];
        
        const options = {
            requestOptions: {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'X-YouTube-Client-Name': client.id,
                    'X-YouTube-Client-Version': client.version,
                    'Origin': 'https://www.youtube.com',
                    'Referer': 'https://www.youtube.com/'
                }
            },
            playerClients: [clientType]
        };
        
        const info = await ytdl.getInfo(url, options);
        const title = sanitizeFilename(info.videoDetails.title);
        
        let stream;
        let filename;
        
        if (format === 'mp3' || quality === 'audio') {
            const audioFormat = ytdl.chooseFormat(info.formats, {
                quality: 'highestaudio',
                filter: 'audioonly'
            });
            filename = `${title}.mp3`;
            stream = ytdl(url, { format: audioFormat, requestOptions: options.requestOptions });
        } else {
            const videoFormat = ytdl.chooseFormat(info.formats, {
                quality: quality === 'highest' ? 'highestvideo' : quality,
                filter: f => f.hasVideo && f.hasAudio
            });
            filename = `${title}.${format}`;
            stream = ytdl(url, { format: videoFormat, requestOptions: options.requestOptions });
        }
        
        return { stream, filename, title };
    };
}

// Method 2: yt-dlp fallback
async function tryYtDlp(url, format, quality) {
    return new Promise((resolve, reject) => {
        const tempFile = path.join(TEMP_DIR, `ytdlp_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
        
        const args = [
            url,
            '-f', format === 'mp3' ? 'bestaudio' : 'best[ext=mp4]/best',
            '-o', tempFile,
            '--no-playlist',
            '--no-warnings',
            '--extractor-args', 'youtube:player_client=android,web',
            '--user-agent', getRandomUserAgent(),
            '--add-header', 'Accept-Language: en-US,en;q=0.5',
            '--geo-bypass',
            '--force-ipv4',
            '--sleep-requests', '1.0',
            '--sleep-interval', '2',
            '--max-sleep-interval', '5'
        ];
        
        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        }
        
        const ytdlp = spawn('yt-dlp', args);
        let error = '';
        
        ytdlp.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        ytdlp.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(tempFile)) {
                return reject(new Error(`yt-dlp failed: ${error.substring(0, 100)}`));
            }
            
            const stream = fs.createReadStream(tempFile);
            const filename = `youtube_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
            
            // Clean up after streaming
            stream.on('end', () => {
                fs.unlink(tempFile, () => {});
            });
            
            resolve({ stream, filename, title: 'YouTube Video' });
        });
        
        ytdlp.on('error', reject);
    });
}

// ==================== WEB INTERFACE ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YouTube Direct Downloader</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .container {
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 600px;
                    width: 100%;
                }
                h1 { color: #333; text-align: center; margin-bottom: 10px; }
                .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
                .feature-badge {
                    background: #f0f0f0;
                    padding: 5px 10px;
                    border-radius: 5px;
                    font-size: 0.8em;
                    display: inline-block;
                    margin: 2px;
                }
                .input-group { margin-bottom: 20px; }
                input[type="url"] {
                    width: 100%;
                    padding: 15px;
                    font-size: 16px;
                    border: 2px solid #ddd;
                    border-radius: 10px;
                    outline: none;
                }
                input[type="url"]:focus { border-color: #667eea; }
                .options {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                select {
                    width: 100%;
                    padding: 10px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                }
                button {
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                }
                button:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4); }
                .info {
                    margin-top: 30px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 10px;
                }
                #status {
                    margin-top: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    display: none;
                }
                .status-success { background: #d4edda; color: #155724; }
                .status-error { background: #f8d7da; color: #721c24; }
                .status-info { background: #d1ecf1; color: #0c5460; }
                .progress {
                    margin-top: 20px;
                    height: 30px;
                    background: #f0f0f0;
                    border-radius: 15px;
                    overflow: hidden;
                    display: none;
                }
                .progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    width: 0%;
                    color: white;
                    text-align: center;
                    line-height: 30px;
                }
                .footer { margin-top: 30px; text-align: center; color: #888; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎬 YouTube Direct Downloader</h1>
                <div class="subtitle">No Cookies • No Sign-In • Direct Download</div>
                
                <div style="text-align: center; margin-bottom: 20px;">
                    <span class="feature-badge">✓ 1080p</span>
                    <span class="feature-badge">✓ 4K</span>
                    <span class="feature-badge">✓ MP3</span>
                    <span class="feature-badge">✓ No Login</span>
                </div>
                
                <div class="input-group">
                    <input type="url" id="url" placeholder="Paste YouTube URL here" required>
                </div>
                
                <div class="options">
                    <div style="flex:1">
                        <label>Format</label>
                        <select id="format">
                            <option value="mp4">MP4 Video</option>
                            <option value="mp3">MP3 Audio</option>
                        </select>
                    </div>
                    <div style="flex:1">
                        <label>Quality</label>
                        <select id="quality">
                            <option value="highest">Highest</option>
                            <option value="1080p">1080p</option>
                            <option value="720p">720p</option>
                            <option value="480p">480p</option>
                            <option value="360p">360p</option>
                            <option value="audio">Audio Only</option>
                        </select>
                    </div>
                </div>
                
                <button id="downloadBtn">⬇️ DOWNLOAD NOW</button>
                
                <div id="status"></div>
                <div class="progress">
                    <div class="progress-bar" id="progressBar">0%</div>
                </div>
                
                <div class="info">
                    <h3>✨ How it works</h3>
                    <p>• No cookies or login required</p>
                    <p>• Works on Render datacenter IPs</p>
                    <p>• Multiple fallback methods</p>
                    <p>• Auto-retry with different clients</p>
                    <p>• Files deleted after download</p>
                </div>
                
                <div class="footer">
                    ⚡ By Rick Ser | Hosted on Render
                </div>
            </div>
            
            <script>
                document.getElementById('downloadBtn').addEventListener('click', async () => {
                    const url = document.getElementById('url').value.trim();
                    const format = document.getElementById('format').value;
                    const quality = document.getElementById('quality').value;
                    
                    if (!url) {
                        showStatus('Please enter a YouTube URL', 'error');
                        return;
                    }
                    
                    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
                        showStatus('Please enter a valid YouTube URL', 'error');
                        return;
                    }
                    
                    showStatus('Processing...', 'info');
                    showProgress(30);
                    
                    try {
                        const downloadUrl = \`/api/download?url=\${encodeURIComponent(url)}&format=\${format}&quality=\${quality}\`;
                        window.location.href = downloadUrl;
                        
                        showStatus('Download started!', 'success');
                        showProgress(100);
                        setTimeout(() => hideStatus(), 3000);
                    } catch (error) {
                        showStatus('Error: ' + error.message, 'error');
                        hideProgress();
                    }
                });
                
                function showStatus(message, type) {
                    const status = document.getElementById('status');
                    status.textContent = message;
                    status.className = \`status-\${type}\`;
                    status.style.display = 'block';
                }
                
                function hideStatus() {
                    document.getElementById('status').style.display = 'none';
                }
                
                function showProgress(percent) {
                    const progress = document.querySelector('.progress');
                    const bar = document.getElementById('progressBar');
                    progress.style.display = 'block';
                    bar.style.width = percent + '%';
                    bar.textContent = percent + '%';
                }
                
                function hideProgress() {
                    document.querySelector('.progress').style.display = 'none';
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== API ENDPOINTS ====================
app.get('/api/download', async (req, res) => {
    const { url, format = 'mp4', quality = 'highest' } = req.query;
    
    if (!url) {
        return res.status(400).send('URL required');
    }
    
    // Simple rate limiting
    const clientIP = req.ip;
    const now = Date.now();
    const timestamps = (rateLimitMap.get(clientIP) || []).filter(t => now - t < 60000);
    
    if (timestamps.length > 3) {
        return res.status(429).send('Rate limit exceeded. Try again later.');
    }
    
    timestamps.push(now);
    rateLimitMap.set(clientIP, timestamps);
    
    try {
        const { stream, filename } = await downloadYouTube(url, format, quality);
        
        res.setHeader('Content-Disposition', contentDisposition(filename));
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        
        stream.pipe(res);
        
        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).send('Download failed');
            }
        });
        
    } catch (error) {
        console.error('Download error:', error);
        
        // Try yt-dlp as final fallback
        try {
            await tryYtDlp(url, format, quality).then(({ stream, filename }) => {
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
                stream.pipe(res);
            }).catch(() => {
                res.status(500).send(`
                    <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1 style="color: #ff0000;">❌ Download Failed</h1>
                        <p>${error.message}</p>
                        <p>Try a different video or format.</p>
                        <a href="/" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go Back</a>
                    </body>
                    </html>
                `);
            });
        } catch {
            res.status(500).send('All download methods failed');
        }
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        tempDir: TEMP_DIR,
        methods: ['ytdl-android', 'ytdl-ios', 'ytdl-web', 'yt-dlp'],
        nodeVersion: process.version
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🎬 YOUTUBE DIRECT DOWNLOADER - RUNNING                ║
╠══════════════════════════════════════════════════════════╣
║   📍 Port: ${PORT}                                           
║   🌐 URL: http://localhost:${PORT}                             
║   📁 Temp: ${TEMP_DIR}   
║   🔥 NO COOKIES • NO SIGN-IN REQUIRED                 
║   💡 Methods: Android • iOS • Web • yt-dlp     
║   🟢 Node.js: ${process.version}                         
╚══════════════════════════════════════════════════════════╝
    `);
});
