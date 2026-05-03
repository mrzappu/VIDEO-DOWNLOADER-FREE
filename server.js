const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Store active downloads
const downloads = new Map();

// Create temp directory
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Clean old files every hour
setInterval(() => {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > 15 * 60 * 1000) { // 15 minutes
            fs.unlinkSync(filePath);
        }
    });
}, 60 * 60 * 1000);

// Helper: Get platform from URL
function getPlatform(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
    if (urlLower.includes('instagram.com')) return 'instagram';
    if (urlLower.includes('tiktok.com')) return 'tiktok';
    if (urlLower.includes('facebook.com')) return 'facebook';
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('vimeo.com')) return 'vimeo';
    return 'other';
}

// Helper: Format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// API: Get video info
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    const platform = getPlatform(url);
    
    try {
        if (platform === 'youtube') {
            // Get YouTube video info
            const info = await ytdl.getInfo(url);
            const formats = [];
            const seenQualities = new Set();
            
            // Get video formats with both video and audio
            const videoFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);
            
            const qualityMap = {
                '2160p': { key: '4k', label: '4K Ultra HD', badge: '4K' },
                '1440p': { key: '2k', label: '2K Quad HD', badge: '2K' },
                '1080p': { key: '1080', label: 'Full HD 1080p', badge: '1080p' },
                '720p': { key: '720', label: 'HD 720p', badge: '720p' },
                '480p': { key: '480', label: '480p', badge: '480p' },
                '360p': { key: '360', label: '360p', badge: '360p' },
                '240p': { key: '240', label: '240p', badge: '240p' },
                '144p': { key: '144', label: '144p', badge: '144p' }
            };
            
            videoFormats.forEach(format => {
                const qualityLabel = format.qualityLabel;
                if (qualityLabel && qualityMap[qualityLabel] && !seenQualities.has(qualityLabel)) {
                    seenQualities.add(qualityLabel);
                    formats.push({
                        quality: qualityMap[qualityLabel].key,
                        label: qualityMap[qualityLabel].label,
                        ext: 'mp4',
                        type: 'video',
                        badge: qualityMap[qualityLabel].badge,
                        itag: format.itag
                    });
                }
            });
            
            // Add audio formats
            formats.push({
                quality: 'mp3',
                label: 'MP3 Audio (320kbps)',
                ext: 'mp3',
                type: 'audio',
                badge: 'MP3'
            });
            
            formats.push({
                quality: 'm4a',
                label: 'M4A Audio (AAC)',
                ext: 'm4a',
                type: 'audio',
                badge: 'M4A'
            });
            
            res.json({
                title: info.videoDetails.title,
                thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
                channel: info.videoDetails.author.name,
                duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
                platform: 'YOUTUBE',
                formats: formats.slice(0, 10)
            });
        } 
        else {
            // Mock response for other platforms (Instagram, TikTok, etc.)
            const platformNames = {
                instagram: 'INSTAGRAM',
                tiktok: 'TIKTOK',
                facebook: 'FACEBOOK',
                twitter: 'TWITTER/X',
                vimeo: 'VIMEO'
            };
            
            res.json({
                title: `${platformNames[platform] || 'VIDEO'} - Trending Content`,
                thumbnail: `https://picsum.photos/id/${Math.floor(Math.random() * 100)}/128/76`,
                channel: '@content_creator',
                duration: '01:30',
                platform: platformNames[platform] || platform.toUpperCase(),
                formats: [
                    { quality: '1080', label: 'Full HD 1080p', ext: 'mp4', type: 'video', badge: '1080p' },
                    { quality: '720', label: 'HD 720p', ext: 'mp4', type: 'video', badge: '720p' },
                    { quality: '480', label: '480p', ext: 'mp4', type: 'video', badge: '480p' },
                    { quality: 'mp3', label: 'MP3 Audio', ext: 'mp3', type: 'audio', badge: 'MP3' }
                ]
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
    }
});

// API: Start download
app.post('/api/download', async (req, res) => {
    const { url, quality } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    const jobId = crypto.randomBytes(16).toString('hex');
    const platform = getPlatform(url);
    
    downloads.set(jobId, {
        status: 'processing',
        progress: 0,
        url: url,
        quality: quality,
        platform: platform
    });
    
    // Start download in background
    startDownload(jobId, url, quality, platform);
    
    res.json({ job_id: jobId });
});

async function startDownload(jobId, url, quality, platform) {
    const job = downloads.get(jobId);
    
    try {
        if (platform === 'youtube') {
            const info = await ytdl.getInfo(url);
            let stream = null;
            let filename = '';
            
            // Select format based on quality
            if (quality === 'mp3' || quality === 'm4a') {
                // Audio only
                const audioFormat = ytdl.chooseFormat(info.formats, { 
                    quality: 'lowestaudio',
                    filter: 'audioonly'
                });
                stream = ytdl(url, { format: audioFormat });
                filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}_${quality}.mp3`;
            } else {
                // Video with audio
                let qualityFilter = 'highest';
                if (quality === '4k') qualityFilter = 'highestvideo';
                else if (quality === '1080') qualityFilter = '137+140'; // 1080p
                else if (quality === '720') qualityFilter = '136+140'; // 720p
                else if (quality === '480') qualityFilter = '135+140'; // 480p
                
                stream = ytdl(url, { quality: qualityFilter });
                filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}_${quality}.mp4`;
            }
            
            const filePath = path.join(TEMP_DIR, `${jobId}_${filename}`);
            const writeStream = fs.createWriteStream(filePath);
            
            let downloadedBytes = 0;
            let totalBytes = 0;
            
            stream.on('progress', (chunkLength, downloaded, total) => {
                downloadedBytes = downloaded;
                totalBytes = total;
                const progress = Math.floor((downloaded / total) * 100);
                job.progress = progress;
                downloads.set(jobId, job);
            });
            
            stream.pipe(writeStream);
            
            writeStream.on('finish', () => {
                job.status = 'done';
                job.progress = 100;
                job.filePath = filePath;
                job.filename = filename;
                downloads.set(jobId, job);
                
                // Schedule file deletion
                setTimeout(() => {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        downloads.delete(jobId);
                    }
                }, 15 * 60 * 1000);
            });
            
            writeStream.on('error', (err) => {
                job.status = 'error';
                job.error = err.message;
                downloads.set(jobId, job);
            });
            
            stream.on('error', (err) => {
                job.status = 'error';
                job.error = err.message;
                downloads.set(jobId, job);
            });
        } else {
            // Mock download for other platforms
            setTimeout(() => {
                job.status = 'done';
                job.progress = 100;
                job.directUrl = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';
                downloads.set(jobId, job);
            }, 3000);
        }
    } catch (error) {
        job.status = 'error';
        job.error = error.message;
        downloads.set(jobId, job);
    }
}

// API: Get download progress
app.get('/api/progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = downloads.get(jobId);
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
        status: job.status,
        progress: job.progress,
        speed: '2.4 MB/s',
        eta: `${Math.ceil((100 - job.progress) / 10)}s`
    });
});

// API: Download file
app.get('/api/file/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = downloads.get(jobId);
    
    if (!job || job.status !== 'done') {
        return res.status(404).json({ error: 'File not ready' });
    }
    
    if (job.filePath && fs.existsSync(job.filePath)) {
        res.download(job.filePath, job.filename);
    } else if (job.directUrl) {
        res.redirect(job.directUrl);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ IMPOSTER DOWNLOAD Server running on http://localhost:${PORT}`);
});
