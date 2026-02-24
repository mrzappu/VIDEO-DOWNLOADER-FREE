// setup.js - Universal Media Downloader Setup
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 SETUP: Universal Media Downloader');
console.log('=====================================');

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
    const renderTemp = '/tmp/universal-downloader';
    if (!fs.existsSync(renderTemp)) {
        fs.mkdirSync(renderTemp, { recursive: true });
        console.log(`✅ Created Render temp: ${renderTemp}`);
    }
}

// Check for yt-dlp (REQUIRED for 1000+ sites)
console.log('\n🔍 Checking for yt-dlp...');
try {
    const version = execSync('yt-dlp --version', { encoding: 'utf8' }).trim();
    console.log(`✅ yt-dlp found (version ${version})`);
} catch (error) {
    console.log('⚠️ yt-dlp not found - INSTALLING...');
    
    try {
        if (os.platform() === 'win32') {
            console.log('Windows: Download from: https://github.com/yt-dlp/yt-dlp/releases');
        } else {
            // Try pip first
            try {
                execSync('pip3 install --upgrade yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed via pip');
            } catch {
                // Try curl as fallback
                execSync('sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed via curl');
            }
        }
    } catch (e) {
        console.log('❌ Failed to install yt-dlp automatically');
        console.log('⚠️ Downloader will NOT work without yt-dlp!');
    }
}

// Check for ffmpeg (for audio conversion and merging)
console.log('\n🔍 Checking for ffmpeg...');
try {
    const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`✅ ffmpeg found: ${version}`);
} catch (error) {
    console.log('⚠️ ffmpeg not found - installing...');
    try {
        if (os.platform() === 'linux') {
            execSync('sudo apt update && sudo apt install -y ffmpeg', { stdio: 'inherit' });
            console.log('✅ ffmpeg installed via apt');
        } else if (os.platform() === 'darwin') {
            execSync('brew install ffmpeg', { stdio: 'inherit' });
            console.log('✅ ffmpeg installed via brew');
        } else {
            console.log('⚠️ Please install ffmpeg manually from: https://ffmpeg.org/download.html');
        }
    } catch (e) {
        console.log('❌ ffmpeg installation failed - audio conversion may not work');
    }
}

// Create .env file
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `PORT=3000
NODE_ENV=production
`;
    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ Created .env file');
}

console.log('\n🎯 SETUP COMPLETE!');
console.log('Supported: 1000+ platforms via yt-dlp');
console.log('Run: npm start');
