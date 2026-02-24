// setup.js - IMPOSTER Downloader Setup with Discord
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🚀 IMPOSTER DOWNLOADER - DISCORD EDITION');
console.log('==========================================');

// Create directories
const dirs = ['temp', 'downloads', 'logs', 'sessions'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created /${dir} directory`);
    }
});

// Create Render temp if needed
if (process.env.RENDER) {
    const renderTemp = '/tmp/imposter-downloader';
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
    console.log('⚠️ yt-dlp not found - INSTALLING...');
    try {
        if (os.platform() === 'win32') {
            console.log('Windows: Download from: https://github.com/yt-dlp/yt-dlp/releases');
        } else {
            try {
                execSync('pip3 install --upgrade yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed via pip');
            } catch {
                execSync('sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp', { stdio: 'inherit' });
                console.log('✅ yt-dlp installed via curl');
            }
        }
    } catch (e) {
        console.log('❌ Failed to install yt-dlp automatically');
    }
}

// Check for ffmpeg
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
        }
    } catch (e) {
        console.log('❌ ffmpeg installation failed');
    }
}

// Discord Bot Setup
console.log('\n🤖 Discord Bot Configuration');
console.log('----------------------------');

const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};

async function setupDiscord() {
    const setupDiscord = await askQuestion('Do you want to set up Discord integration? (y/n): ');
    
    if (setupDiscord.toLowerCase() === 'y') {
        const botToken = await askQuestion('Enter your Discord Bot Token: ');
        const channelId = await askQuestion('Enter your Discord Channel ID for logs: ');
        
        // Update .env file
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        envContent += `\n# Discord Configuration\nDISCORD_BOT_TOKEN=${botToken}\nDISCORD_CHANNEL_ID=${channelId}\n`;
        fs.writeFileSync(envPath, envContent);
        
        console.log('✅ Discord configuration saved to .env');
    }
}

// Run Discord setup
setupDiscord().then(() => {
    // Create .env file with defaults if not exists
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        const envContent = `PORT=3000
NODE_ENV=production
# Add your Discord bot token below
# DISCORD_BOT_TOKEN=your_token_here
# DISCORD_CHANNEL_ID=your_channel_id_here
`;
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ Created .env file');
    }

    console.log('\n🎯 IMPOSTER DOWNLOADER SETUP COMPLETE!');
    console.log('© IMPOSTER 2026-2027');
    console.log('Run: npm start');
    
    rl.close();
});
