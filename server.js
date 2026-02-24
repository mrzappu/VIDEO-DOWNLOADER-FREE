// server.js - IMPOSTER DOWNLOADER with Discord Integration
require('dotenv').config();
const config = require('./config.js');
const DiscordLogger = require('./discordLogger.js');

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
const useragent = require('useragent');
const requestIp = require('request-ip');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || config.server.port;

// Initialize Discord Logger
const discordLogger = new DiscordLogger();

// ==================== CONFIGURATION ====================
const TEMP_DIR = process.env.RENDER ? '/tmp/imposter-downloader' : path.join(__dirname, 'temp');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure directories exist
[TEMP_DIR, DOWNLOADS_DIR, SESSIONS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Rate limiting map
const rateLimitMap = new Map();

// Session storage for device tracking
const deviceSessions = new Map();

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestIp.mw());
app.use(session({
    secret: 'imposter-secret-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { error: 'Too many requests, slow down!' }
});
app.use('/api/', limiter);

// Device tracking middleware
app.use(async (req, res, next) => {
    if (config.tracking.enabled) {
        const ip = req.clientIp;
        const ua = req.headers['user-agent'];
        const agent = useragent.parse(ua);
        
        const deviceInfo = {
            ip: ip,
            userAgent: ua,
            browser: `${agent.family} ${agent.major}`,
            os: `${agent.os.family} ${agent.os.major}`,
            device: agent.device.family,
            isMobile: agent.device.family === 'iPhone' || agent.device.family === 'iPad' || agent.device.family.includes('Mobile'),
            timestamp: new Date().toISOString(),
            path: req.path,
            sessionId: req.session.id
        };
        
        // Store in session
        if (!req.session.deviceInfo) {
            req.session.deviceInfo = deviceInfo;
            deviceSessions.set(req.session.id, deviceInfo);
            
            // Get location data (optional)
            let location = 'Unknown';
            try {
                const geoRes = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 2000 });
                if (geoRes.data && geoRes.data.status === 'success') {
                    location = `${geoRes.data.city}, ${geoRes.data.country}`;
                }
            } catch (e) {
                // Ignore geo errors
            }
            
            // Log to Discord
            await discordLogger.logVisit(ip, ua, `${deviceInfo.device} (${deviceInfo.os})`, location);
        }
    }
    next();
});

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
async function downloadMedia(url, format = 'mp4', platform, req) {
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
            '--user-agent', req.headers['user-agent'] || 'Mozilla/5.0'
        ];

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
                    discordLogger.logError(new Error('YouTube Blocked'), req.clientIp, url);
                    return reject(new Error('YOUTUBE_BLOCKED'));
                }
                discordLogger.logError(new Error(errorOutput), req.clientIp, url);
                return reject(new Error(`Download failed`));
            }

            const stats = fs.statSync(tempFile);
            console.log(`✅ Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

            const stream = fs.createReadStream(tempFile);
            const filename = `imposter_${platform}_${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`;

            stream.on('end', () => {
                fs.unlink(tempFile, () => {});
            });

            resolve({ stream, filename });
        });
    });
}

// ==================== WEB INTERFACE ====================
app.get('/', (req, res) => {
    const deviceInfo = req.session.deviceInfo || {};
    
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
                    max-width: 800px;
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
                .nav-bar {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .nav-btn {
                    background: #2a2a2a;
                    color: white;
                    border: 1px solid #444;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .nav-btn:hover {
                    background: #ff0000;
                    border-color: #ff0000;
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

                /* Modal Styles */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.8);
                }
                .modal-content {
                    background: #1a1a1a;
                    margin: 5% auto;
                    padding: 30px;
                    border: 2px solid #ff0000;
                    width: 80%;
                    max-width: 600px;
                    border-radius: 15px;
                    color: white;
                    position: relative;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                .close {
                    color: #ff0000;
                    float: right;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    position: sticky;
                    top: 0;
                }
                .close:hover {
                    color: #fff;
                }
                .modal h2 {
                    color: #ff0000;
                    margin-bottom: 20px;
                }
                .modal-section {
                    margin-bottom: 25px;
                    padding: 15px;
                    background: #2a2a2a;
                    border-radius: 8px;
                }
                .modal-section h3 {
                    color: #ff6666;
                    margin-bottom: 10px;
                }
                .device-info {
                    font-family: monospace;
                    background: #333;
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 10px;
                }
                .device-info p {
                    margin: 5px 0;
                    color: #0f0;
                }
                .policy-text {
                    max-height: 300px;
                    overflow-y: auto;
                    padding: 10px;
                    background: #333;
                    border-radius: 5px;
                    font-size: 14px;
                    line-height: 1.6;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>IMPOSTER</h1>
                <div class="subtitle">DOWNLOADER</div>
                
                <div class="nav-bar">
                    <button class="nav-btn" onclick="showModal('about')">👨‍💻 About Rick</button>
                    <button class="nav-btn" onclick="showModal('privacy')">📜 Privacy Policy</button>
                    <button class="nav-btn" onclick="showModal('device')">📱 My Device</button>
                </div>
                
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
                    <p>🔒 Your device info is logged for security</p>
                </div>
                
                <div class="footer">
                    © IMPOSTER 2026-2027
                </div>
            </div>

            <!-- About Rick Modal -->
            <div id="aboutModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="closeModal('about')">&times;</span>
                    <h2>👨‍💻 About Rick</h2>
                    <div class="modal-section">
                        <h3>Lead Developer</h3>
                        <p>Rick is the mastermind behind IMPOSTER Downloader, a powerful tool that gives you access to media from 1000+ platforms.</p>
                    </div>
                    <div class="modal-section">
                        <h3>Contact</h3>
                        <p>📧 Email: rick@imposter.net</p>
                        <p>💬 Discord: rick_imposter</p>
                        <p>🐙 GitHub: https://github.com/rick-dev</p>
                        <p>🌐 Website: https://imposter.net</p>
                    </div>
                    <div class="modal-section">
                        <h3>Technologies Used</h3>
                        <p>• Node.js / Express</p>
                        <p>• yt-dlp (1000+ sites)</p>
                        <p>• Discord.js for logging</p>
                        <p>• ffmpeg for audio conversion</p>
                    </div>
                </div>
            </div>

            <!-- Privacy Policy Modal -->
            <div id="privacyModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="closeModal('privacy')">&times;</span>
                    <h2>📜 Privacy Policy</h2>
                    <div class="modal-section">
                        <h3>Last Updated: ${config.privacy.lastUpdated}</h3>
                        <div class="policy-text">
                            <p><strong>Data Collection:</strong> We collect your IP address, user agent, and device information for security and monitoring purposes.</p>
                            <p><strong>Data Retention:</strong> ${config.privacy.dataRetention}</p>
                            <p><strong>Discord Logging:</strong> ${config.privacy.discordSharing}</p>
                            <p><strong>Cookies:</strong> We use session cookies to track your device during your visit.</p>
                            <p><strong>Third Party:</strong> Download requests are processed through yt-dlp and may be visible to content platforms.</p>
                            <p><strong>Your Rights:</strong> You can request deletion of your logs by contacting rick@imposter.net</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Device Info Modal -->
            <div id="deviceModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="closeModal('device')">&times;</span>
                    <h2>📱 Your Device Info</h2>
                    <div class="modal-section">
                        <h3>What we know about you:</h3>
                        <div class="device-info">
                            <p>🖥️ IP: ${deviceInfo.ip || 'Collecting...'}</p>
                            <p>🌐 Browser: ${deviceInfo.browser || 'Unknown'}</p>
                            <p>💻 OS: ${deviceInfo.os || 'Unknown'}</p>
                            <p>📱 Device: ${deviceInfo.device || 'Unknown'}</p>
                            <p>📱 Mobile: ${deviceInfo.isMobile ? 'Yes' : 'No'}</p>
                            <p>🕒 Time: ${new Date().toLocaleString()}</p>
                        </div>
                        <p style="margin-top: 15px; color: #ff6666;">This information is logged to Discord for security.</p>
                    </div>
                </div>
            </div>

            <script>
                function showModal(type) {
                    document.getElementById(type + 'Modal').style.display = 'block';
                }
                
                function closeModal(type) {
                    document.getElementById(type + 'Modal').style.display = 'none';
                }
                
                window.onclick = function(event) {
                    if (event.target.classList.contains('modal')) {
                        event.target.style.display = 'none';
                    }
                }

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
    const clientIP = req.clientIp;
    const now = Date.now();
    const timestamps = (rateLimitMap.get(clientIP) || []).filter(t => now - t < 60000);
    
    if (timestamps.length > 3) {
        return res.status(429).send('Rate limit exceeded. Try again later.');
    }
    
    timestamps.push(now);
    rateLimitMap.set(clientIP, timestamps);

    const platform = detectPlatform(url);
    const deviceInfo = req.session.deviceInfo || {};

    try {
        const { stream, filename } = await downloadMedia(url, format, platform, req);
        
        // Log successful download to Discord
        await discordLogger.logDownload(
            url, 
            platform, 
            format, 
            clientIP,
            `${deviceInfo.device} (${deviceInfo.os})`,
            true
        );
        
        res.setHeader('Content-Disposition', contentDisposition(filename));
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('X-Platform', platform);
        
        stream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        
        // Log failed download to Discord
        await discordLogger.logDownload(
            url, 
            platform, 
            format, 
            clientIP,
            `${deviceInfo.device} (${deviceInfo.os})`,
            false
        );
        
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

// Device info API
app.get('/api/device', (req, res) => {
    res.json(req.session.deviceInfo || {});
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'IMPOSTER ONLINE',
        version: config.server.version,
        copyright: 'IMPOSTER 2026-2027',
        activeSessions: deviceSessions.size,
        tempDir: TEMP_DIR,
        discord: discordLogger.ready ? 'CONNECTED' : 'DISABLED'
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
║   🤖 Discord Logger: ${discordLogger.ready ? '✅ CONNECTED' : '❌ DISABLED'}
║   👨‍💻 Developer: Rick
║   © IMPOSTER 2026-2027                          
╚══════════════════════════════════════════════════════════╝
    `);
});
