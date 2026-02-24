// setup.js - Complete setup with undici patch
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 SETUP: YouTube Direct Downloader');
console.log('====================================');

// Clean node_modules if there's an undici error
function cleanInstall() {
    console.log('\n🧹 Checking for clean install...');
    
    const nodeModules = path.join(__dirname, 'node_modules');
    const packageLock = path.join(__dirname, 'package-lock.json');
    
    // Check if undici error exists by looking at package.json
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        if (pkg.dependencies.undici && pkg.dependencies.undici !== '5.28.4') {
            console.log('⚠️ Found incompatible undici version - cleaning...');
            
            if (fs.existsSync(nodeModules)) {
                fs.rmSync(nodeModules, { recursive: true, force: true });
                console.log('✅ Removed node_modules');
            }
            
            if (fs.existsSync(packageLock)) {
                fs.unlinkSync(packageLock);
                console.log('✅ Removed package-lock.json');
            }
        }
    } catch (e) {
        console.log('⚠️ Could not check package.json');
    }
}

cleanInstall();

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
    
    try {
        if (os.platform() === 'win32') {
            console.log('Windows: Please install yt-dlp manually from: https://github.com/yt-dlp/yt-dlp/releases');
        } else {
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
        console.log('❌ Installation failed');
    }
}

// Check for ffmpeg
console.log('\n🔍 Checking for ffmpeg...');
try {
    const version = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`✅ ffmpeg found: ${version}`);
} catch (error) {
    console.log('⚠️ ffmpeg not found');
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

// Create undici patch file
const patchPath = path.join(__dirname, 'undici-patch.js');
const patchContent = `// undici-patch.js - Fix for Node.js 18
if (process.versions.node.startsWith('18')) {
    if (typeof globalThis.File === 'undefined') {
        globalThis.File = class File {
            constructor(bits, name, options = {}) {
                this.name = name;
                this.size = bits.length || 0;
                this.type = options.type || '';
                this.lastModified = options.lastModified || Date.now();
            }
        };
        console.log('✅ Applied undici File polyfill for Node.js 18');
    }
}
`;
fs.writeFileSync(patchPath, patchContent);
console.log('✅ Created undici patch file');

console.log('\n🎯 SETUP COMPLETE!');
console.log('Run: npm start');
