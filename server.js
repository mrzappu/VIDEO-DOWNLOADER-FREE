// server.js - IMPOSTER DOWNLOADER
require('dotenv').config();

// ==================== DEPENDENCIES ====================
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const contentDisposition = require('content-disposition');
const mime = require('mime-types');
const sanitize = require('sanitize-filename');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const TEMP_DIR = process.env.RENDER ? '/tmp/imposter-downloader' : path.join(__dirname, 'temp');
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
    max: 3,
    message: { error: 'Too many requests, slow down!' }
});
app.use('/api/', limiter);

// ==================== PLATFORM DETECTION ====================
function detectPlatform(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
    if (urlLower.includes('tiktok.com')) return 'tiktok';
    if (urlLower.includes('instagram.com')) return 'instagram';
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('facebook.com')) return 'facebook';
    if (urlLower.includes('reddit.com')) return 'reddit';
    if (urlLower.includes('twitch.tv')) return 'twitch';
    if (urlLower.includes('vimeo.com')) return 'vimeo';
    if (urlLower.includes('soundcloud.com')) return 'soundcloud';
    return 'unknown';
}

// ==================== DOWNLOAD FUNCTIONS ====================
async function downloadMedia(url, format = 'mp4', platform) {
    console.log(`📥 IMPOSTER Download: ${platform} - ${url.substring(0, 50)}...`);
    
    return new Promise((resolve, reject) => {
        const tempFile = path.join(TEMP_DIR, `imposter_${Date.now()}_${Math.random().toString(36).substring(7)}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
        
        const args = [
            url,
            '-f', format === 'mp3' ? 'bestaudio' : 'best[ext=mp4]/best',
            '-o', tempFile,
            '--no-playlist',
            '--no-warnings',
            '--geo-bypass',
            '--force-ipv4',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ];

        // Platform-specific optimizations
        if (platform === 'tiktok') {
            args.push('--impersonate', 'chrome-131');
        }
        
        if (platform === 'youtube') {
            args.push('--extractor-args', 'youtube:player_client=android,web_safari');
            args.push('--sleep-requests', '2.0');
        }

        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        }

        const ytdlp = spawn('yt-dlp', args);
        let errorOutput = '';

        ytdlp.stderr.on('data', (data) => {
            errorOutput += data.toString();
            if (data.toString().includes('%')) {
                console.log(`📊 Progress: ${data.toString().trim()}`);
            }
        });

        ytdlp.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(tempFile)) {
                if (platform === 'youtube' && errorOutput.includes('Sign in')) {
                    return reject(new Error('YOUTUBE_BLOCKED'));
                }
                if (platform === 'reddit' && errorOutput.includes('403')) {
                    return reject(new Error('REDDIT_BLOCKED'));
                }
                return reject(new Error(`Download failed: ${errorOutput.substring(0, 200)}`));
            }

            const stats = fs.statSync(tempFile);
            console.log(`✅ Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            const stream = fs.createReadStream(tempFile);
            const filename = `imposter_${platform}_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;

            stream.on('end', () => {
                fs.unlink(tempFile, () => console.log('🧹 Temp file deleted'));
            });

            resolve({ stream, filename });
        });
    });
}

// ==================== WEB INTERFACE ====================
app.get('/', (req, res) => {
    const isRender = !!process.env.RENDER;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>IMPOSTER DOWNLOADER</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', sans-serif;
                    background: linear-gradient(135deg, #1a1a1a 0%, #2c3e50 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .container {
                    background: rgba(20, 20, 20, 0.95);
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 60px rgba(255, 0, 0, 0.3);
                    max-width: 700px;
                    width: 100%;
                    border: 1px solid #ff0000;
                }
                h1 { 
                    color: #ff0000; 
                    text-align: center; 
                    margin-bottom: 10px;
                    font-size: 3em;
                    text-shadow: 0 0 10px rgba(255,0,0,0.5);
                    letter-spacing: 2px;
                }
                .subtitle { 
                    text-align: center; 
                    color: #888; 
                    margin-bottom: 30px;
                    font-style: italic;
                }
                .warning-box {
                    background: #2a0000;
                    border: 1px solid #ff0000;
                    color: #ff6666;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .platform-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 30px;
                }
                .platform-badge {
                    background: #2a2a2a;
                    padding: 8px;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 0.9em;
                    font-weight: 500;
                    color: white;
                    border: 1px solid #444;
                }
                .platform-badge.youtube { background: #8b0000; }
                .platform-badge.tiktok { background: #000000; }
                .platform-badge.instagram { background: #8b004b; }
                .platform-badge.twitter { background: #002b8b; }
                .input-group { margin-bottom: 20px; }
                input[type="url"] {
                    width: 100%;
                    padding: 15px;
                    font-size: 16px;
                    background: #2a2a2a;
                    border: 2px solid #444;
                    border-radius: 10px;
                    outline: none;
                    color: white;
                }
                input[type="url"]:focus { border-color: #ff0000; }
                input[type="url"]::placeholder { color: #666; }
                .options {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                select {
                    width: 100%;
                    padding: 10px;
                    background: #2a2a2a;
                    border: 2px solid #444;
                    border-radius: 8px;
                    color: white;
                }
                button {
                    width: 100%;
                    padding: 15px;
                    background: #ff0000;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                button:hover { 
                    background: #cc0000;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(255,0,0,0.4);
                }
                .info {
                    margin-top: 30px;
                    padding: 20px;
                    background: #1a1a1a;
                    border-radius: 10px;
                    color: #ccc;
                }
                .info h3 { color: #ff0000; margin-bottom: 10px; }
                #status {
                    margin-top: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    display: none;
                }
                .status-success { background: #004d00; color: #00ff00; }
                .status-error { background: #4d0000; color: #ff6666; }
                .status-info { background: #002b4d; color: #66ccff; }
                .progress {
                    margin-top: 20px;
                    height: 30px;
                    background: #2a2a2a;
                    border-radius: 15px;
                    overflow: hidden;
                    display: none;
                }
                .progress-bar {
                    height: 100%;
                    background: #ff0000;
                    width: 0%;
                    color: white;
                    text-align: center;
                    line-height: 30px;
                }
                .footer { 
                    margin-top: 30px; 
                    text-align: center; 
                    color: #ff0000;
                    font-size: 0.9em;
                }
                .footer span { color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>IMPOSTER</h1>
                <div class="subtitle">DOWNLOADER</div>
                
                <div class="warning-box">
                    <strong>⚠️ YOUTUBE NOTICE:</strong> YouTube blocks datacenter IPs. Use TikTok/Instagram/Twitter for instant downloads.
                </div>
                
                <div class="platform-grid">
                    <div class="platform-badge youtube">YouTube*</div>
                    <div class="platform-badge tiktok">TikTok</div>
                    <div class="platform-badge instagram">Instagram</div>
                    <div class="platform-badge twitter">Twitter/X</div>
                </div>
                
                <div class="input-group">
                    <input type="url" id="url" placeholder="Paste any video URL (TikTok, Instagram, Twitter...)" required>
                </div>
                
                <div class="options">
                    <div style="flex:1">
                        <label style="color: #ccc;">Format</label>
                        <select id="format">
                            <option value="mp4">MP4 Video</option>
                            <option value="mp3">MP3 Audio</option>
                        </select>
                    </div>
                </div>
                
                <button id="downloadBtn">⬇️ DOWNLOAD</button>
                
                <div id="status"></div>
                <div class="progress">
                    <div class="progress-bar" id="progressBar">0%</div>
                </div>
                
                <div class="info">
                    <h3>✨ IMPOSTER FEATURES</h3>
                    <p>✅ TikTok, Instagram, Twitter, Facebook</p>
                    <p>✅ Twitch, Vimeo, SoundCloud, 1000+ sites</p>
                    <p>⚠️ YouTube currently blocked on datacenter IPs</p>
                </div>
                
                <div class="footer">
                    © IMPOSTER 2026-2027
                </div>
            </div>
            
            <script>
                document.getElementById('downloadBtn').addEventListener('click', async () => {
                    const url = document.getElementById('url').value.trim();
                    const format = document.getElementById('format').value;
                    
                    if (!url) {
                        showStatus('Please enter a URL', 'error');
                        return;
                    }
                    
                    showStatus('Processing...', 'info');
                    showProgress(30);
                    
                    try {
                        const downloadUrl = \`/api/download?url=\${encodeURIComponent(url)}&format=\${format}\`;
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

// ==================== API ENDPOINT ====================
app.get('/api/download', async (req, res) => {
    const { url, format = 'mp4' } = req.query;
    
    if (!url) {
        return res.status(400).send('URL required');
    }

    // Rate limiting
    const clientIP = req.ip;
    const now = Date.now();
    const timestamps = (rateLimitMap.get(clientIP) || []).filter(t => now - t < 60000);
    
    if (timestamps.length > 3) {
        return res.status(429).send('Rate limit exceeded. Try again later.');
    }
    
    timestamps.push(now);
    rateLimitMap.set(clientIP, timestamps);

    const platform = detectPlatform(url);

    try {
        const { stream, filename } = await downloadMedia(url, format, platform);
        
        res.setHeader('Content-Disposition', contentDisposition(filename));
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('X-Platform', platform);
        
        stream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        
        if (error.message === 'YOUTUBE_BLOCKED') {
            return res.status(400).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a1a; color: white;">
                    <h1 style="color: #ff0000;">❌ YOUTUBE BLOCKED</h1>
                    <p>YouTube blocks downloads from datacenter IPs.</p>
                    <p style="color: #00ff00;">✅ Try TikTok, Instagram, or Twitter instead!</p>
                    <a href="/" style="display: inline-block; margin-top: 20px; background: #ff0000; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">BACK</a>
                    <div style="margin-top: 50px; color: #ff0000;">© IMPOSTER 2026-2027</div>
                </body>
                </html>
            `);
        }
        
        res.status(500).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a1a; color: white;">
                <h1 style="color: #ff0000;">❌ DOWNLOAD FAILED</h1>
                <p>${error.message}</p>
                <a href="/" style="display: inline-block; margin-top: 20px; background: #ff0000; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">BACK</a>
                <div style="margin-top: 50px; color: #ff0000;">© IMPOSTER 2026-2027</div>
            </body>
            </html>
        `);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'IMPOSTER ONLINE',
        version: '4.2.0',
        copyright: 'IMPOSTER 2026-2027',
        tempDir: TEMP_DIR
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   ██╗███╗   ███╗██████╗  ██████╗ ███████╗████████╗     ║
║   ██║████╗ ████║██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝     ║
║   ██║██╔████╔██║██████╔╝██║   ██║███████╗   ██║        ║
║   ██║██║╚██╔╝██║██╔═══╝ ██║   ██║╚════██║   ██║        ║
║   ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████║   ██║        ║
║   ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝   ╚═╝        ║
╠══════════════════════════════════════════════════════════╣
║   📍 Port: ${PORT}                                           
║   🌐 URL: http://localhost:${PORT}                             
║   🔥 WORKING: TikTok • Instagram • Twitter • Facebook                 
║   ⚠️ YOUTUBE: Blocked on datacenter IPs     
║   © IMPOSTER 2026-2027                          
╚══════════════════════════════════════════════════════════╝
    `);
});
