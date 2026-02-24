// setup.js - Auto-installs yt-dlp and creates directories
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 SETUP: YouTube Direct Downloader');
console.log('====================================');

// Create directories
const dirs = ['temp', 'downloads', 'logs'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created /${dir} directory`);
    }
});

// Create Render temp if needed
if (process.env.RENDER) {
    const renderTemp = '/tmp/youtube-downloader';
    if (!fs.existsSync(renderTemp)) {
        fs.mkdirSync(renderTemp, { recursive: true });
        console.log(`✅ Created Render temp: ${renderTemp}`);
    }
}

// Check for yt-dlp
console.log('\n🔍 Checking for yt-dlp...');
try {
    const version = execSync('yt-dlp --version', { encoding: 'utf8' }).trim();
    console.log(`✅ yt-dlp found (version ${version})`);
} catch (error) {
    console.log('⚠️ yt-dlp not found - installing...');
    
    // Install yt-dlp based on platform
    try {
        if (os.platform() === 'win32') {
            console.log('Windows: Please install yt-dlp manually from: https://github.com/yt-dlp/yt-dlp/releases');
        } else {
            // Linux/Mac - try pip first, then curl
            try {
                execSync('pip3 install --upgrade yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed via pip');
            } catch {
                try {
                    execSync('sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                    console.log('✅ yt-dlp installed via curl');
                } catch (e) {
                    console.log('❌ Failed to install yt-dlp automatically');
                }
            }
        }
    } catch (e) {
        console.log('❌ Installation failed - continuing without yt-dlp');
    }
}

// Check for ffmpeg
console.log('\n🔍 Checking for ffmpeg...');
try {
    const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`✅ ffmpeg found: ${version}`);
} catch (error) {
    console.log('⚠️ ffmpeg not found - audio conversion may not work');
    if (os.platform() === 'linux' && !process.env.RENDER) {
        console.log('   Run: sudo apt update && sudo apt install -y ffmpeg');
    } else if (os.platform() === 'darwin') {
        console.log('   Run: brew install ffmpeg');
    }
}

// Create .env file if not exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `PORT=3000
NODE_ENV=production
`;
    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ Created .env file');
}

console.log('\n🎯 SETUP COMPLETE!');
console.log('Run: npm start');
