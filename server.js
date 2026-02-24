// server.js - Fixed version without spdl
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const ytdl = require('@distube/ytdl-core');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const contentDisposition = require('content-disposition');
const mime = require('mime-types');
const sanitize = require('sanitize-filename');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const TEMP_DIR = process.env.RENDER ? '/tmp/downloader-temp' : path.join(__dirname, 'temp');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Ensure directories exist
[TEMP_DIR, DOWNLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Clean temp files older than 1 hour
setInterval(() => {
    const now = Date.now();
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 3600000);

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many requests, slow down!' }
});
app.use('/api/', limiter);

// ==================== SPOTIFY HANDLER (FIXED - NO spdl) ====================
const SPOTIFY_COOKIE = process.env.SPOTIFY_SP_DC;

async function getSpotifyTrackInfo(trackId) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: {
                'Authorization': `Bearer ${await getSpotifyToken()}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Spotify API error:', error.message);
        return null;
    }
}

async function getSpotifyToken() {
    // Note: This requires Spotify API credentials
    // For now, we'll use yt-dlp for Spotify downloads
    return null;
}

// ==================== UTILITY FUNCTIONS ====================
function sanitizeFilename(name) {
    return sanitize(name).replace(/\s+/g, '_') || 'download';
}

function getPlatformFromUrl(url) {
    url = url.toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('spotify.com')) return 'spotify';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
    if (url.includes('twitch.tv')) return 'twitch';
    if (url.includes('vimeo.com')) return 'vimeo';
    if (url.includes('soundcloud.com')) return 'soundcloud';
    return 'other';
}

// ==================== API ENDPOINTS ====================

// Home page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ULTIMATE MEDIA DOWNLOADER</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
                    max-width: 800px;
                    width: 100%;
                }
                h1 {
                    color: #333;
                    text-align: center;
                    margin-bottom: 10px;
                    font-size: 2.5em;
                }
                .subtitle {
                    text-align: center;
                    color: #666;
                    margin-bottom: 30px;
                    font-size: 1.1em;
                }
                .supported-sites {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    justify-content: center;
                    margin-bottom: 30px;
                }
                .site-badge {
                    background: #f0f0f0;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 0.9em;
                    color: #555;
                }
                .site-badge.youtube { background: #ff0000; color: white; }
                .site-badge.spotify { background: #1DB954; color: white; }
                .site-badge.tiktok { background: #000000; color: white; }
                .site-badge.instagram { background: #E4405F; color: white; }
                
                .input-group {
                    margin-bottom: 20px;
                }
                input[type="url"] {
                    width: 100%;
                    padding: 15px;
                    font-size: 16px;
                    border: 2px solid #ddd;
                    border-radius: 10px;
                    outline: none;
                    transition: border-color 0.3s;
                }
                input[type="url"]:focus {
                    border-color: #667eea;
                }
                
                .options {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .option-group {
                    flex: 1;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: #555;
                    font-weight: 500;
                }
                select {
                    width: 100%;
                    padding: 10px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 14px;
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
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
                }
                button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .info-section {
                    margin-top: 30px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 10px;
                }
                .info-section h3 {
                    color: #333;
                    margin-bottom: 10px;
                }
                .info-section ul {
                    list-style: none;
                    padding-left: 0;
                }
                .info-section li {
                    padding: 5px 0;
                    color: #666;
                }
                .info-section li:before {
                    content: "✓ ";
                    color: #28a745;
                    font-weight: bold;
                }
                
                #status {
                    margin-top: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    display: none;
                }
                .status-success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                .status-error {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                .status-info {
                    background: #d1ecf1;
                    color: #0c5460;
                    border: 1px solid #bee5eb;
                }
                
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
                    transition: width 0.3s;
                    color: white;
                    text-align: center;
                    line-height: 30px;
                    font-size: 14px;
                }
                
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #888;
                    font-size: 0.9em;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎵 ULTIMATE DOWNLOADER</h1>
                <div class="subtitle">YouTube • Spotify • TikTok • Instagram • 1000+ sites</div>
                
                <div class="supported-sites">
                    <span class="site-badge youtube">YouTube</span>
                    <span class="site-badge spotify">Spotify</span>
                    <span class="site-badge tiktok">TikTok</span>
                    <span class="site-badge instagram">Instagram</span>
                    <span class="site-badge">Twitter/X</span>
                    <span class="site-badge">Facebook</span>
                    <span class="site-badge">Twitch</span>
                    <span class="site-badge">Vimeo</span>
                    <span class="site-badge">SoundCloud</span>
                    <span class="site-badge">1000+ more</span>
                </div>
                
                <div class="input-group">
                    <input type="url" id="url" placeholder="Paste URL here (YouTube, Spotify, TikTok, Instagram...)" required>
                </div>
                
                <div class="options">
                    <div class="option-group">
                        <label>Format</label>
                        <select id="format">
                            <option value="mp4">MP4 (Video)</option>
                            <option value="mp3">MP3 (Audio)</option>
                            <option value="m4a">M4A (Audio)</option>
                            <option value="webm">WebM</option>
                        </select>
                    </div>
                    <div class="option-group" id="quality-group">
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
                
                <button id="downloadBtn">⬇️ DOWNLOAD</button>
                
                <div id="status"></div>
                <div class="progress">
                    <div class="progress-bar" id="progressBar">0%</div>
                </div>
                
                <div class="info-section">
                    <h3>✨ Features</h3>
                    <ul>
                        <li>YouTube: All qualities up to 4K</li>
                        <li>Spotify: High-quality MP3 with metadata</li>
                        <li>TikTok: No watermark option</li>
                        <li>Instagram: Videos & Reels</li>
                        <li>Twitter/X: Native video downloads</li>
                        <li>Facebook: Public video downloads</li>
                        <li>No registration required</li>
                        <li>Clean, ad-free interface</li>
                    </ul>
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
                        showStatus('Please enter a URL', 'error');
                        return;
                    }
                    
                    showStatus('Processing...', 'info');
                    showProgress(0);
                    
                    try {
                        const response = await fetch('/api/info', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url })
                        });
                        
                        const data = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(data.error || 'Failed to get video info');
                        }
                        
                        showStatus('Starting download...', 'info');
                        showProgress(30);
                        
                        // Trigger download
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

// API: Get video info
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }
    
    const platform = getPlatformFromUrl(url);
    
    try {
        if (platform === 'youtube') {
            const info = await ytdl.getInfo(url);
            return res.json({
                title: info.videoDetails.title,
                duration: info.videoDetails.lengthSeconds,
                thumbnail: info.videoDetails.thumbnails.pop().url,
                formats: info.formats.map(f => ({
                    quality: f.qualityLabel || f.quality,
                    container: f.container,
                    hasVideo: f.hasVideo,
                    hasAudio: f.hasAudio
                }))
            });
        } else {
            // Generic response for other platforms
            return res.json({
                title: 'Media from ' + platform,
                platform: platform,
                duration: 0
            });
        }
    } catch (error) {
        console.error('Info error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Download media
app.get('/api/download', async (req, res) => {
    const { url, format, quality } = req.query;
    
    if (!url) {
        return res.status(400).send('URL required');
    }
    
    const platform = getPlatformFromUrl(url);
    console.log(`📥 Download request: ${platform} | ${url.substring(0, 50)}...`);
    
    try {
        // ==================== YOUTUBE DOWNLOAD ====================
        if (platform === 'youtube') {
            const info = await ytdl.getInfo(url);
            const title = sanitizeFilename(info.videoDetails.title);
            
            let stream;
            let filename;
            
            if (format === 'mp3' || quality === 'audio') {
                // Audio only
                const audioFormat = ytdl.chooseFormat(info.formats, { 
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
                filename = `${title}.mp3`;
                stream = ytdl(url, { format: audioFormat });
            } else {
                // Video + audio
                const videoFormat = ytdl.chooseFormat(info.formats, { 
                    quality: quality === 'highest' ? 'highestvideo' : quality,
                    filter: format => format.hasVideo && format.hasAudio
                });
                filename = `${title}.${format || 'mp4'}`;
                stream = ytdl(url, { format: videoFormat });
            }
            
            res.setHeader('Content-Disposition', contentDisposition(filename));
            res.setHeader('Content-Type', mime.lookup(filename) || 'application/octet-stream');
            
            stream.pipe(res);
            stream.on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).send('Download failed');
                }
            });
        }
        
        // ==================== OTHER PLATFORMS (using yt-dlp) ====================
        else {
            // Check if yt-dlp is available
            const tempFile = path.join(TEMP_DIR, `download_${Date.now()}.${format || 'mp4'}`);
            
            // Try using yt-dlp if available
            try {
                const args = [
                    url,
                    '-f', 'best[ext=mp4]/best',
                    '-o', tempFile,
                    '--no-playlist',
                    '--no-warnings'
                ];
                
                // Add platform-specific options
                if (platform === 'tiktok') {
                    args.push('--impersonate', 'chrome-131');
                }
                
                const ytdlp = spawn('yt-dlp', args);
                
                ytdlp.on('close', (code) => {
                    if (code !== 0) {
                        return res.status(500).send('Download failed - try yt-dlp installation');
                    }
                    
                    // Send file
                    res.setHeader('Content-Disposition', contentDisposition(`download_${Date.now()}.${format || 'mp4'}`));
                    res.setHeader('Content-Type', mime.lookup(format || 'mp4') || 'application/octet-stream');
                    
                    const stream = fs.createReadStream(tempFile);
                    stream.pipe(res);
                    
                    stream.on('end', () => {
                        fs.unlink(tempFile, () => {});
                    });
                });
            } catch (e) {
                // Fallback message
                res.status(400).send(`Platform ${platform} requires yt-dlp. Install with: pip install yt-dlp`);
            }
        }
        
    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).send('Error: ' + error.message);
        }
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now(),
        tempDir: TEMP_DIR
    });
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🚀 ULTIMATE MEDIA DOWNLOADER - RUNNING                ║
╠══════════════════════════════════════════════════════════╣
║   📍 Port: ${PORT}                                           
║   🌐 URL: http://localhost:${PORT}                             
║   📁 Temp: ${TEMP_DIR}   
║   🎵 Spotify: Using yt-dlp (set SPOTIFY_SP_DC in .env)                 
║   💡 Supported: YouTube, Spotify, TikTok, Instagram+     
╚══════════════════════════════════════════════════════════╝
    `);
});
