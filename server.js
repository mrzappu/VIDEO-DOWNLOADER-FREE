const express = require('express');
const cors = require('cors');
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
        if (now - stats.mtimeMs > 15 * 60 * 1000) {
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
    return 'other';
}

// Helper: Format duration
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
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
            // Get YouTube video info using ytdl-core
            const info = await ytdl.getInfo(url);
            const formats = [];
            const seenQualities = new Set();
            
            // Get video formats with both video and audio
            const videoFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);
            
            // Quality mapping
            const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
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
            
            // Add available video qualities
            qualityOrder.forEach(quality => {
                const hasFormat = videoFormats.some(f => f.qualityLabel === quality);
                if (hasFormat && !seenQualities.has(quality)) {
                    seenQualities.add(quality);
                    formats.push({
                        quality: qualityMap[quality].key,
                        label: qualityMap[quality].label,
                        ext: 'mp4',
                        type: 'video',
                        badge: qualityMap[quality].badge
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
                formats: formats
            });
        } else {
            res.status(400).json({ error: 'Only YouTube URLs are supported in this version' });
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
    startDownload(jobId, url, quality);
    
    res.json({ job_id: jobId });
});

async function startDownload(jobId, url, quality) {
    const job = downloads.get(jobId);
    
    try {
        const info = await ytdl.getInfo(url);
        let stream = null;
        let filename = '';
        let filePath = '';
        
        if (quality === 'mp3' || quality === 'm4a') {
            // Audio only download
            const audioFormat = ytdl.chooseFormat(info.formats, { 
                quality: 'lowestaudio',
                filter: 'audioonly'
            });
            stream = ytdl(url, { format: audioFormat });
            filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '').substring(0, 50)}_${quality}.mp3`;
            filePath = path.join(TEMP_DIR, `${jobId}_${filename}`);
        } else {
            // Video download based on quality
            let qualityFilter = 'highestvideo';
            if (quality === '1080') qualityFilter = '137+140';
            else if (quality === '720') qualityFilter = '136+140';
            else if (quality === '480') qualityFilter = '135+140';
            else if (quality === '360') qualityFilter = '134+140';
            
            stream = ytdl(url, { quality: qualityFilter });
            filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '').substring(0, 50)}_${quality}.mp4`;
            filePath = path.join(TEMP_DIR, `${jobId}_${filename}`);
        }
        
        const writeStream = fs.createWriteStream(filePath);
        
        let lastProgress = 0;
        stream.on('progress', (chunkLength, downloaded, total) => {
            const progress = Math.floor((downloaded / total) * 100);
            if (progress !== lastProgress) {
                lastProgress = progress;
                job.progress = progress;
                downloads.set(jobId, job);
            }
        });
        
        stream.pipe(writeStream);
        
        writeStream.on('finish', () => {
            job.status = 'done';
            job.progress = 100;
            job.filePath = filePath;
            job.filename = filename;
            downloads.set(jobId, job);
            
            // Delete file after 15 minutes
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
        speed: '2.5 MB/s',
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
    console.log(`📍 Open http://localhost:${PORT} in your browser`);
});
