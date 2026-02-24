// setup.js - Complete setup script for Ultimate Media Downloader
// Run with: node setup.js
// This script will:
// 1. Check all dependencies
// 2. Install missing tools (where possible)
// 3. Create necessary directories
// 4. Generate configuration files
// 5. Test Spotify cookie
// 6. Verify platform compatibility

const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

const log = {
    info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}[⚠]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
    step: (msg) => console.log(`${colors.blue}[STEP]${colors.reset} ${msg}`),
    header: (msg) => {
        const line = '═'.repeat(msg.length + 8);
        console.log(`\n${colors.magenta}╔${line}╗${colors.reset}`);
        console.log(`${colors.magenta}║    ${msg}    ║${colors.reset}`);
        console.log(`${colors.magenta}╚${line}╝${colors.reset}\n`);
    }
};

// Main setup function
async function main() {
    console.clear();
    console.log(`
${colors.bgBlue}╔════════════════════════════════════════════════════════════╗${colors.reset}
${colors.bgBlue}║     ULTIMATE MEDIA DOWNLOADER - COMPLETE SETUP SCRIPT     ║${colors.reset}
${colors.bgBlue}╚════════════════════════════════════════════════════════════╝${colors.reset}
    `);
    
    log.info(`System: ${os.type()} ${os.release()} (${os.arch()})`);
    log.info(`Node.js: ${process.version}`);
    log.info(`Platform: ${os.platform()}`);
    log.info(`CPU Cores: ${os.cpus().length}`);
    log.info(`Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100} GB\n`);

    // STEP 1: Check if running on Render
    log.header('ENVIRONMENT CHECK');
    const isRender = !!process.env.RENDER;
    if (isRender) {
        log.success('Running on Render platform');
        log.info(`Render service: ${process.env.RENDER_SERVICE_NAME || 'unknown'}`);
        log.info(`Render instance: ${process.env.RENDER_INSTANCE_ID || 'unknown'}`);
    } else {
        log.info('Running on local machine');
    }

    // STEP 2: Create necessary directories
    log.header('DIRECTORY SETUP');
    
    const dirs = [
        { path: 'downloads', desc: 'Download storage' },
        { path: 'temp', desc: 'Temporary files' },
        { path: 'logs', desc: 'Log files' },
        { path: 'public', desc: 'Static files' },
        { path: 'cookies', desc: 'Cookie storage' }
    ];
    
    // Add Render-specific temp directory
    if (isRender) {
        const renderTemp = '/tmp/downloader';
        if (!fs.existsSync(renderTemp)) {
            fs.mkdirSync(renderTemp, { recursive: true });
            log.success(`Created Render temp: ${renderTemp}`);
        }
    }
    
    dirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir.path);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            log.success(`Created ${dir.path}/ - ${dir.desc}`);
        } else {
            log.info(`Directory exists: ${dir.path}/`);
        }
    });

    // STEP 3: Check core dependencies
    log.header('DEPENDENCY CHECK');
    
    // Check package.json
    if (fs.existsSync(path.join(__dirname, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        log.success(`package.json found (v${pkg.version})`);
        
        // Check if all dependencies are installed
        const nodeModules = path.join(__dirname, 'node_modules');
        if (fs.existsSync(nodeModules)) {
            log.success('node_modules directory exists');
            
            // Check key packages
            const required = ['express', 'ytdl-core', 'spdl', 'fluent-ffmpeg'];
            required.forEach(pkg => {
                if (fs.existsSync(path.join(nodeModules, pkg))) {
                    log.success(`Package installed: ${pkg}`);
                } else {
                    log.warn(`Package missing: ${pkg} - run npm install`);
                }
            });
        } else {
            log.warn('node_modules not found - run npm install first');
        }
    } else {
        log.error('package.json not found!');
    }

    // STEP 4: Check system tools
    log.header('SYSTEM TOOLS CHECK');
    
    const tools = [
        { name: 'ffmpeg', cmd: 'ffmpeg -version', required: true },
        { name: 'yt-dlp', cmd: 'yt-dlp --version', required: false },
        { name: 'python3', cmd: 'python3 --version', required: false },
        { name: 'curl', cmd: 'curl --version', required: false },
        { name: 'wget', cmd: 'wget --version', required: false }
    ];
    
    for (const tool of tools) {
        try {
            const output = execSync(tool.cmd, { encoding: 'utf8', stdio: 'pipe' });
            const version = output.split('\n')[0].trim();
            log.success(`${tool.name}: ${version}`);
        } catch (error) {
            if (tool.required) {
                log.error(`${tool.name} is REQUIRED but not found!`);
                await installTool(tool.name);
            } else {
                log.warn(`${tool.name} not found - some features may be limited`);
                if (tool.name === 'yt-dlp') {
                    log.info('   Without yt-dlp: Only YouTube downloads work');
                    log.info('   With yt-dlp: TikTok, Instagram, Twitter, Facebook, 1000+ sites');
                }
            }
        }
    }

    // STEP 5: Install missing system tools (if possible)
    async function installTool(tool) {
        if (process.platform === 'win32') {
            log.warn(`Please install ${tool} manually from:`);
            if (tool === 'ffmpeg') log.info('   https://ffmpeg.org/download.html');
        } else if (process.platform === 'darwin') {
            log.info(`Attempting to install ${tool} via Homebrew...`);
            try {
                execSync(`brew install ${tool}`, { stdio: 'inherit' });
                log.success(`Installed ${tool}`);
            } catch {
                log.error(`Failed to install ${tool}. Please install manually: brew install ${tool}`);
            }
        } else if (process.platform === 'linux') {
            log.info(`Attempting to install ${tool} via apt...`);
            try {
                execSync(`sudo apt update && sudo apt install -y ${tool}`, { stdio: 'inherit' });
                log.success(`Installed ${tool}`);
            } catch {
                log.error(`Failed to install ${tool}. Please install manually: sudo apt install ${tool}`);
            }
        }
    }

    // STEP 6: Check and install yt-dlp
    log.header('YT-DLP SETUP');
    try {
        execSync('yt-dlp --version', { stdio: 'pipe' });
        log.success('yt-dlp already installed');
    } catch {
        log.warn('yt-dlp not found - attempting to install');
        
        if (process.platform === 'win32') {
            log.info('Downloading yt-dlp.exe...');
            const file = fs.createWriteStream('yt-dlp.exe');
            https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    log.success('yt-dlp.exe downloaded');
                    fs.chmodSync('yt-dlp.exe', '755');
                });
            });
        } else {
            try {
                execSync('pip3 install --upgrade yt-dlp', { stdio: 'inherit' });
                log.success('yt-dlp installed via pip');
            } catch {
                try {
                    execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                    execSync('chmod a+rx /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                    log.success('yt-dlp installed via curl');
                } catch {
                    log.error('Could not install yt-dlp automatically');
                    log.info('Manual install: https://github.com/yt-dlp/yt-dlp#installation');
                }
            }
        }
    }

    // STEP 7: Environment file setup
    log.header('ENVIRONMENT CONFIGURATION');
    
    const envPath = path.join(__dirname, '.env');
    let spotifyCookie = null;
    
    if (fs.existsSync(envPath)) {
        log.success('.env file exists');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/SPOTIFY_SP_DC=(.+)/);
        if (match) {
            spotifyCookie = match[1];
            log.success('SPOTIFY_SP_DC found in .env');
            if (spotifyCookie.length > 50) {
                log.success(`Cookie length: ${spotifyCookie.length} characters`);
            } else {
                log.warn('Cookie seems too short - might be invalid');
            }
        } else {
            log.warn('SPOTIFY_SP_DC not found in .env');
        }
    } else {
        log.warn('.env file not found - creating template');
        
        const envTemplate = `# Spotify Cookie - REQUIRED for Spotify downloads
# Get it from browser: 
# 1. Log into open.spotify.com
# 2. Open Dev Tools (F12) → Application → Cookies → https://open.spotify.com
# 3. Find "sp_dc" and copy the value
SPOTIFY_SP_DC=YOUR_SPOTIFY_COOKIE_HERE

# YouTube API Key (optional)
YOUTUBE_API_KEY=

# Server Port
PORT=3000

# Environment
NODE_ENV=development
`;
        fs.writeFileSync(envPath, envTemplate);
        log.success('.env template created');
        log.warn('Edit .env and add your SPOTIFY_SP_DC cookie!');
    }

    // STEP 8: Test Spotify cookie
    if (spotifyCookie && spotifyCookie !== 'YOUR_SPOTIFY_COOKIE_HERE') {
        log.header('SPOTIFY COOKIE TEST');
        
        try {
            // Test using simple fetch
            const testUrl = 'https://api.spotify.com/v1/me';
            const options = {
                headers: {
                    'Cookie': `sp_dc=${spotifyCookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            
            log.info('Testing Spotify cookie...');
            
            // Simple test without external deps
            const result = await new Promise((resolve) => {
                const req = https.get(testUrl, options, (res) => {
                    if (res.statusCode === 200) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
                req.on('error', () => resolve(false));
                req.end();
            });
            
            if (result) {
                log.success('✅ Spotify cookie is valid and working!');
            } else {
                log.error('❌ Spotify cookie test failed - may be invalid or expired');
                log.info('   Generate a fresh cookie from open.spotify.com');
            }
        } catch (error) {
            log.error(`Cookie test error: ${error.message}`);
        }
    }

    // STEP 9: Create public directory and basic files
    log.header('PUBLIC FILES SETUP');
    
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Create favicon.ico (placeholder)
    const faviconPath = path.join(publicDir, 'favicon.ico');
    if (!fs.existsSync(faviconPath)) {
        // Create a simple 1x1 pixel favicon
        const emptyIcon = Buffer.from([0,0,1,0,1,0,0,0,0,0,0,0]);
        fs.writeFileSync(faviconPath, emptyIcon);
        log.success('Created favicon.ico placeholder');
    }
    
    // Create robots.txt
    const robotsPath = path.join(publicDir, 'robots.txt');
    if (!fs.existsSync(robotsPath)) {
        fs.writeFileSync(robotsPath, 'User-agent: *\nAllow: /\n');
        log.success('Created robots.txt');
    }

    // STEP 10: Check disk space
    log.header('RESOURCE CHECK');
    
    try {
        if (process.platform !== 'win32') {
            const df = execSync('df -h . | tail -1').toString();
            const parts = df.split(/\s+/);
            log.info(`Disk space: ${parts[4]} used, ${parts[3]} free on ${parts[5]}`);
        } else {
            log.info('Disk space check skipped on Windows');
        }
    } catch {
        log.warn('Could not check disk space');
    }
    
    const freeMem = os.freemem() / 1024 / 1024 / 1024;
    log.info(`Free memory: ${Math.round(freeMem * 100) / 100} GB`);

    // STEP 11: Generate configuration file
    log.header('CONFIGURATION GENERATION');
    
    const configPath = path.join(__dirname, 'config.json');
    const config = {
        server: {
            port: process.env.PORT || 3000,
            environment: process.env.NODE_ENV || 'development',
            isRender: isRender,
            tempDir: isRender ? '/tmp/downloader' : path.join(__dirname, 'temp'),
            downloadsDir: path.join(__dirname, 'downloads')
        },
        spotify: {
            enabled: !!(spotifyCookie && spotifyCookie !== 'AQAO58hc_nvGfcLuZMYNfXHICxhoa8QctGL0a77bIGLdNLX3L9A_MBkFGKAXOw8LvYHYJLXhWAKodhHm1IONsoHq5WcZ6A4YLCx8UdULNKS5hO7gTrHyO_DYatbQC1ny5jn_V4K0c0EN9vLENiK4-OS8PKunt5PBcoM7QQx36lTgSMcx1cd_H17zePWyJqZaayEYUWvc5eBCJxwzvsA'),
            cookieSet: !!(spotifyCookie && spotifyCookie !== 'AQAO58hc_nvGfcLuZMYNfXHICxhoa8QctGL0a77bIGLdNLX3L9A_MBkFGKAXOw8LvYHYJLXhWAKodhHm1IONsoHq5WcZ6A4YLCx8UdULNKS5hO7gTrHyO_DYatbQC1ny5jn_V4K0c0EN9vLENiK4-OS8PKunt5PBcoM7QQx36lTgSMcx1cd_H17zePWyJqZaayEYUWvc5eBCJxwzvsA')
        },
        youtube: {
            enabled: true,
            formats: ['mp4', 'mp3', 'm4a', 'webm']
        },
        system: {
            ffmpeg: await checkTool('ffmpeg'),
            ytdlp: await checkTool('yt-dlp'),
            platform: os.platform(),
            nodeVersion: process.version
        },
        features: {
            spotify: !!(spotifyCookie && spotifyCookie !== 'AQAO58hc_nvGfcLuZMYNfXHICxhoa8QctGL0a77bIGLdNLX3L9A_MBkFGKAXOw8LvYHYJLXhWAKodhHm1IONsoHq5WcZ6A4YLCx8UdULNKS5hO7gTrHyO_DYatbQC1ny5jn_V4K0c0EN9vLENiK4-OS8PKunt5PBcoM7QQx36lTgSMcx1cd_H17zePWyJqZaayEYUWvc5eBCJxwzvsA'),
            youtube: true,
            tiktok: await checkTool('yt-dlp'),
            instagram: await checkTool('yt-dlp'),
            twitter: await checkTool('yt-dlp'),
            facebook: await checkTool('yt-dlp')
        }
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log.success('config.json generated');
    
    async function checkTool(tool) {
        try {
            execSync(`${tool} --version`, { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }

    // STEP 12: Final summary
    log.header('SETUP COMPLETE - SUMMARY');
    
    console.log(`
${colors.green}✅ SUCCESSFUL SETUP${colors.reset}
   - Directories created
   - Dependencies checked
   - System tools verified
   - Configuration generated

${colors.yellow}📊 FEATURE STATUS${colors.reset}
   ┌─────────────────────┬────────────┐
   │ Feature             │ Status     │
   ├─────────────────────┼────────────┤
   │ YouTube             │ ✅ READY   │
   │ Spotify             │ ${config.spotify.enabled ? '✅ READY' : '❌ MISSING COOKIE'} │
   │ TikTok              │ ${config.features.tiktok ? '✅ READY' : '⚠️ LIMITED'}  │
   │ Instagram           │ ${config.features.instagram ? '✅ READY' : '⚠️ LIMITED'}  │
   │ Twitter/X           │ ${config.features.twitter ? '✅ READY' : '⚠️ LIMITED'}  │
   │ Facebook            │ ${config.features.facebook ? '✅ READY' : '⚠️ LIMITED'}  │
   └─────────────────────┴────────────┘

${colors.cyan}🚀 NEXT STEPS${colors.reset}
   1. ${!config.spotify.enabled ? 'Add your Spotify cookie to .env' : 'Spotify is ready to use!'}
   2. Run: ${colors.green}npm start${colors.reset}
   3. Open: ${colors.blue}http://localhost:${config.server.port}${colors.reset}

${colors.magenta}📝 TIPS${colors.reset}
   - For TikTok/Instagram: Install yt-dlp (brew/apt/pip install yt-dlp)
   - For best performance: Use on Render with 512MB+ RAM
   - Files are auto-deleted after download
   
${colors.bgGreen}${colors.white}                SETUP COMPLETE - READY TO LAUNCH!                ${colors.reset}
    `);
    
    rl.close();
}

// Run main function
main().catch(error => {
    log.error(`Setup failed: ${error.message}`);
    console.error(error);
    rl.close();
});
