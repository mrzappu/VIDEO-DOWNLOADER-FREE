// server.js - UPDATED WITH YOUTUBE BYPASS
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
const TEMP_DIR = process.env.RENDER ? '/tmp/universal-downloader' : path.join(__dirname, 'temp');
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

// Rate limiting - 3 requests per minute per IP
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

// ==================== YOUTUBE BYPASS METHODS ====================

// Method 1: Use yt-dlp with impersonation and multiple clients
async function downloadYouTube(url, format = 'mp4', quality = 'best') {
    console.log(`📥 YouTube download: ${url.substring(0, 50)}...`);
    
    return new Promise((resolve, reject) => {
        const tempFile = path.join(TEMP_DIR, `yt_${Date.now()}_${Math.random().toString(36).substring(7)}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
        
        // ADVANCED yt-dlp arguments to bypass login requirement
        const args = [
            url,
            '-f', format === 'mp3' ? 'bestaudio' : 'best[ext=mp4]/best',
            '-o', tempFile,
            '--no-playlist',
            '--no-warnings',
            '--geo-bypass',
            '--force-ipv4',
            '--extractor-args', 'youtube:player_client=android,web_safari,web_embedded',
            '--impersonate', 'chrome:windows',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--add-header', 'Accept-Language: en-US,en;q=0.9',
            '--sleep-requests', '2.0',
            '--sleep-interval', '3',
            '--max-sleep-interval', '7'
        ];
        
        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        }
        
        console.log(`🔄 Running: yt-dlp with ${args.length} args`);
        
        const ytdlp = spawn('yt-dlp', args);
        let errorOutput = '';
        
        ytdlp.stderr.on('data', (data) => {
            errorOutput += data.toString();
            // Log progress
            if (data.toString().includes('%')) {
                console.log(`📊 Progress: ${data.toString().trim()}`);
            }
        });
        
        ytdlp.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(tempFile)) {
                // Check for specific errors
                if (errorOutput.includes('Sign in') || errorOutput.includes('LOGIN_REQUIRED')) {
                    return reject(new Error('YouTube requires login from this IP. Try a different platform or use the alternative downloader below.'));
                }
                return reject(new Error(`YouTube download failed: ${errorOutput.substring(0, 200)}`));
            }
            
            const stats = fs.statSync(tempFile);
            console.log(`✅ Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            
            const stream = fs.createReadStream(tempFile);
            const filename = `youtube_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
            
            stream.on('end', () => {
                fs.unlink(tempFile, () => console.log('🧹 Temp file deleted'));
            });
            
            resolve({ stream, filename });
        });
        
        ytdlp.on('error', (err) => {
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });
    });
}

// Method 2: Use alternative frontend (Invidious) as fallback [citation:2][citation:5]
async function downloadYouTubeViaInvidious(url, format = 'mp4') {
    console.log(`🔄 Trying Invidious fallback...`);
    
    // Extract video ID
    let videoId = '';
    if (url.includes('youtube.com/watch')) {
        videoId = new URL(url).searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    }
    
    if (!videoId) {
        throw new Error('Could not extract video ID');
    }
    
    // Use public Invidious instance [citation:2]
    const invidiousUrl = `https://yewtu.be/watch?v=${videoId}`;
    
    return new Promise((resolve, reject) => {
        const tempFile = path.join(TEMP_DIR, `invidious_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
        
        const args = [
            invidiousUrl,
            '-f', format === 'mp3' ? 'bestaudio' : 'best',
            '-o', tempFile,
            '--no-playlist',
            '--no-warnings'
        ];
        
        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        }
        
        const ytdlp = spawn('yt-dlp', args);
        
        ytdlp.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(tempFile)) {
                reject(new Error('Invidious fallback failed'));
            } else {
                const stream = fs.createReadStream(tempFile);
                const filename = `youtube_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
                
                stream.on('end', () => {
                    fs.unlink(tempFile, () => {});
                });
                
                resolve({ stream, filename });
            }
        });
    });
}

// ==================== OTHER PLATFORMS ====================
async function downloadOther(url, format = 'mp4', platform) {
    console.log(`📥 Downloading from ${platform}: ${url.substring(0, 50)}...`);
    
    return new Promise((resolve, reject) => {
        const tempFile = path.join(TEMP_DIR, `dl_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
        
        const args = [
            url,
            '-f', format === 'mp3' ? 'bestaudio' : 'best[ext=mp4]/best',
            '-o', tempFile,
            '--no-playlist',
            '--no-warnings',
            '--geo-bypass',
            '--force-ipv4'
        ];
        
        // Platform-specific arguments
        if (platform === 'tiktok') {
            args.push('--impersonate', 'chrome-131');
        }
        
        if (platform === 'reddit') {
            args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        }
        
        if (format === 'mp3') {
            args.push('-x', '--audio-format', 'mp3');
        }
        
        const ytdlp = spawn('yt-dlp', args);
        let errorOutput = '';
        
        ytdlp.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        ytdlp.on('close', (code) => {
            if (code !== 0 || !fs.existsSync(tempFile)) {
                if (platform === 'reddit' && errorOutput.includes('403')) {
                    return reject(new Error('Reddit blocks datacenter IPs. Try a different platform.'));
                }
                return reject(new Error(`Download failed: ${errorOutput.substring(0, 200)}`));
            }
            
            const stream = fs.createReadStream(tempFile);
            const filename = `${platform}_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;
            
            stream.on('end', () => {
                fs.unlink(tempFile, () => {});
            });
            
            resolve({ stream, filename });
        });
    });
}

// ==================== WEB INTERFACE ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>UNIVERSAL MEDIA DOWNLOADER</title>
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
                    max-width: 700px;
                    width: 100%;
                }
                h1 { color: #333; text-align: center; margin-bottom: 10px; }
                .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
                .warning-box {
                    background: #fff3cd;
                    border: 1px solid #ffeeba;
                    color: #856404;
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
                    background: #f0f0f0;
                    padding: 8px;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 0.9em;
                    font-weight: 500;
                }
                .platform-badge.youtube { background: #ff0000; color: white; }
                .platform-badge.tiktok { background: #000000; color: white; }
                .platform-badge.instagram { background: #E4405F; color: white; }
                .platform-badge.twitter { background: #1DA1F2; color: white; }
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
                <h1>🎬 UNIVERSAL DOWNLOADER</h1>
                <div class="subtitle">1000+ Platforms • No Sign-In • No Cookies</div>
                
                <div class="warning-box">
                    <strong>⚠️ YouTube Notice:</strong> YouTube now blocks downloads from datacenter IPs (like Render) [citation:3][citation:8]. 
                    If YouTube fails, try TikTok, Instagram, Twitter, or other platforms below.
                </div>
                
                <div class="platform-grid">
                    <div class="platform-badge youtube">YouTube*</div>
                    <div class="platform-badge tiktok">TikTok</div>
                    <div class="platform-badge instagram">Instagram</div>
                    <div class="platform-badge twitter">Twitter/X</div>
                    <div class="platform-badge">Facebook</div>
                    <div class="platform-badge">Reddit</div>
                    <div class="platform-badge">Twitch</div>
                    <div class="platform-badge">Vimeo</div>
                </div>
                
                <div class="input-group">
                    <input type="url" id="url" placeholder="Paste any video URL (TikTok, Instagram, Twitter, YouTube*...)" required>
                </div>
                
                <div class="options">
                    <div style="flex:1">
                        <label>Format</label>
                        <select id="format">
                            <option value="mp4">MP4 Video</option>
                            <option value="mp3">MP3 Audio</option>
                        </select>
                    </div>
                </div>
                
                <button id="downloadBtn">⬇️ DOWNLOAD NOW</button>
                
                <div id="status"></div>
                <div class="progress">
                    <div class="progress-bar" id="progressBar">0%</div>
                </div>
                
                <div class="info">
                    <h3>✨ Working Platforms</h3>
                    <p>✅ <strong>TikTok, Instagram, Twitter, Facebook:</strong> Fully working</p>
                    <p>✅ <strong>Twitch, Vimeo, SoundCloud:</strong> Fully working</p>
                    <p>⚠️ <strong>YouTube:</strong> Currently blocked on datacenter IPs [citation:3][citation:6]. Try these alternatives:</p>
                    <ul style="margin-left: 20px; margin-top: 5px;">
                        <li>Use a different platform (TikTok/Instagram)</li>
                        <li>Try again later (YouTube may lift blocks)</li>
                        <li>Use the video ID to search on other platforms</li>
                    </ul>
                    <p>📱 <strong>Reddit:</strong> Often blocks datacenter IPs [citation:5]</p>
                </div>
                
                <div class="footer">
                    ⚡ Powered by yt-dlp | Hosted on Render
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
        return res.status(429).send('Rate limit exceeded (3 per minute). Try again later.');
    }
    
    timestamps.push(now);
    rateLimitMap.set(clientIP, timestamps);

    const platform = detectPlatform(url);
    console.log(`🌐 Platform: ${platform}`);

    try {
        let result;
        
        if (platform === 'youtube') {
            try {
                // Try primary YouTube method first
                result = await downloadYouTube(url, format);
            } catch (youtubeError) {
                console.log('YouTube primary failed, trying Invidious fallback...');
                try {
                    // Try Invidious as fallback [citation:2][citation:5]
                    result = await downloadYouTubeViaInvidious(url, format);
                } catch (invidiousError) {
                    // If both fail, return a helpful message
                    return res.status(400).send(`
                        <html>
                        <body style="font-family: Arial; text-align: center; padding: 50px;">
                            <h1 style="color: #ff0000;">❌ YouTube Blocked</h1>
                            <p>YouTube is currently blocking downloads from datacenter IPs (like Render) [citation:3][citation:8].</p>
                            <p>✅ Try downloading from:</p>
                            <ul style="list-style: none; padding: 0;">
                                <li>• TikTok (fully working)</li>
                                <li>• Instagram (fully working)</li>
                                <li>• Twitter/X (fully working)</li>
                                <li>• Facebook (fully working)</li>
                            </ul>
                            <a href="/" style="display: inline-block; margin-top: 20px; background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Another URL</a>
                        </body>
                        </html>
                    `);
                }
            }
        } else {
            // Handle all other platforms
            result = await downloadOther(url, format, platform);
        }
        
        const { stream, filename } = result;
        
        res.setHeader('Content-Disposition', contentDisposition(filename));
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('X-Platform', platform);
        
        stream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        
        res.status(500).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1 style="color: #ff0000;">❌ Download Failed</h1>
                <p>${error.message}</p>
                <p>Try a different video or platform.</p>
                <a href="/" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go Back</a>
            </body>
            </html>
        `);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        tempDir: TEMP_DIR,
        nodeVersion: process.version
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🎬 UNIVERSAL MEDIA DOWNLOADER - RUNNING               ║
╠══════════════════════════════════════════════════════════╣
║   📍 Port: ${PORT}                                           
║   🌐 URL: http://localhost:${PORT}                             
║   🔥 WORKING: TikTok, Instagram, Twitter, Facebook                 
║   ⚠️ YOUTUBE: Blocked on datacenter IPs [citation:3]    
║   💡 Try alternative platforms for instant downloads     
╚══════════════════════════════════════════════════════════╝
    `);
});
