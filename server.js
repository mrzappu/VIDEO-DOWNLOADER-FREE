const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create temp directory
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// Store download jobs
const jobs = new Map();

// Clean temp files every hour
setInterval(() => {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > 30 * 60 * 1000) {
            fs.unlinkSync(filePath);
        }
    });
}, 60 * 60 * 1000);

// Detect platform from URL
function getPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('instagram.com')) return 'instagram';
    if (u.includes('tiktok.com')) return 'tiktok';
    if (u.includes('facebook.com')) return 'facebook';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
    if (u.includes('vimeo.com')) return 'vimeo';
    return 'other';
}

// API: Get video info
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const platform = getPlatform(url);
    const jobId = crypto.randomBytes(8).toString('hex');
    
    jobs.set(jobId, { status: 'processing', progress: 0, url, platform });

    // Get video info using yt-dlp
    const command = `yt-dlp --dump-json --no-playlist "${url}"`;
    
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
            jobs.set(jobId, { status: 'error', error: error.message });
            return res.status(500).json({ error: 'Failed to fetch video info' });
        }
        
        try {
            const info = JSON.parse(stdout);
            const formats = [];
            
            // Add video formats
            const videoFormats = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');
            const seen = new Set();
            
            videoFormats.forEach(f => {
                let quality = f.height || 0;
                if (quality >= 2160 && !seen.has('4k')) {
                    seen.add('4k');
                    formats.push({ quality: '4k', label: '4K Ultra HD', ext: 'mp4', type: 'video' });
                } else if (quality >= 1440 && !seen.has('2k')) {
                    seen.add('2k');
                    formats.push({ quality: '2k', label: '2K Quad HD', ext: 'mp4', type: 'video' });
                } else if (quality >= 1080 && !seen.has('1080p')) {
                    seen.add('1080p');
                    formats.push({ quality: '1080p', label: 'Full HD 1080p', ext: 'mp4', type: 'video' });
                } else if (quality >= 720 && !seen.has('720p')) {
                    seen.add('720p');
                    formats.push({ quality: '720p', label: 'HD 720p', ext: 'mp4', type: 'video' });
                } else if (quality >= 480 && !seen.has('480p')) {
                    seen.add('480p');
                    formats.push({ quality: '480p', label: '480p', ext: 'mp4', type: 'video' });
                }
            });
            
            // Add audio formats
            formats.push({ quality: 'mp3', label: 'MP3 Audio (320kbps)', ext: 'mp3', type: 'audio' });
            formats.push({ quality: 'm4a', label: 'M4A Audio (AAC)', ext: 'm4a', type: 'audio' });
            
            const result = {
                title: info.title,
                thumbnail: info.thumbnail,
                channel: info.uploader,
                duration: formatDuration(info.duration),
                platform: platform.toUpperCase(),
                formats: formats.slice(0, 8),
                jobId: jobId
            };
            
            jobs.set(jobId, { ...jobs.get(jobId), info: result, status: 'ready' });
            res.json(result);
            
        } catch (err) {
            res.status(500).json({ error: 'Parse error: ' + err.message });
        }
    });
});

// API: Download video
app.post('/api/download', async (req, res) => {
    const { url, quality, jobId } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    
    const downloadId = crypto.randomBytes(16).toString('hex');
    const filename = `video_${Date.now()}_${quality}.${quality === 'mp3' ? 'mp3' : 'mp4'}`;
    const filepath = path.join(TEMP_DIR, filename);
    
    jobs.set(downloadId, { status: 'downloading', progress: 0, filepath, filename });
    
    // Build yt-dlp command
    let command = '';
    if (quality === 'mp3') {
        command = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 -o "${filepath}" "${url}"`;
    } else if (quality === 'm4a') {
        command = `yt-dlp -f bestaudio --extract-audio --audio-format m4a -o "${filepath}" "${url}"`;
    } else {
        let format = 'bestvideo+bestaudio';
        if (quality === '4k') format = 'bestvideo[height<=2160]+bestaudio/best[height<=2160]';
        else if (quality === '2k') format = 'bestvideo[height<=1440]+bestaudio/best[height<=1440]';
        else if (quality === '1080p') format = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
        else if (quality === '720p') format = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
        else if (quality === '480p') format = 'bestvideo[height<=480]+bestaudio/best[height<=480]';
        command = `yt-dlp -f "${format}" --merge-output-format mp4 -o "${filepath}" "${url}"`;
    }
    
    // Execute download
    const process = exec(command);
    
    process.stderr.on('data', (data) => {
        const match = data.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (match) {
            const progress = parseFloat(match[1]);
            jobs.set(downloadId, { ...jobs.get(downloadId), progress: Math.floor(progress) });
        }
    });
    
    process.on('close', (code) => {
        if (code === 0 && fs.existsSync(filepath)) {
            jobs.set(downloadId, { status: 'completed', progress: 100, filepath, filename });
        } else {
            jobs.set(downloadId, { status: 'error', error: 'Download failed' });
        }
    });
    
    res.json({ downloadId });
});

// API: Get download progress
app.get('/api/progress/:downloadId', (req, res) => {
    const job = jobs.get(req.params.downloadId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ status: job.status, progress: job.progress });
});

// API: Get file
app.get('/api/file/:downloadId', (req, res) => {
    const job = jobs.get(req.params.downloadId);
    if (!job || job.status !== 'completed') {
        return res.status(404).json({ error: 'File not ready' });
    }
    res.download(job.filepath, job.filename);
});

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📥 Make sure yt-dlp is installed: npm install -g yt-dlp`);
});
