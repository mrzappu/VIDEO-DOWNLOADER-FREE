// config.js - IMPOSTER Downloader Configuration
module.exports = {
    // Discord Bot Configuration
    discord: {
        token: process.env.DISCORD_BOT_TOKEN || 'YOUR_DISCORD_BOT_TOKEN_HERE',
        channelId: process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID_HERE', // Channel where logs will be sent
        enabled: true,
        logDownloads: true,
        logVisits: true,
        logErrors: true
    },
    
    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        name: 'IMPOSTER Downloader',
        version: '5.0.0',
        environment: process.env.NODE_ENV || 'development'
    },
    
    // Tracking Configuration
    tracking: {
        enabled: true,
        storeIPs: true,
        storeUserAgents: true,
        storeDeviceInfo: true,
        maxLogEntries: 1000
    },
    
    // Developer Info
    developer: {
        name: 'Rick',
        role: 'Lead Developer',
        github: 'https://github.com/rick-dev',
        discord: 'rick_imposter',
        email: 'rick@imposter.net',
        website: 'https://imposter.net'
    },
    
    // Privacy Policy
    privacy: {
        lastUpdated: '2026-02-25',
        dataRetention: '24 hours',
        logging: 'IP addresses and device info are logged for security',
        discordSharing: 'Download activity is shared with Discord for monitoring'
    },
    
    // UI Configuration
    ui: {
        theme: 'dark',
        primaryColor: '#ff0000',
        secondaryColor: '#2c3e50',
        accentColor: '#ff4444'
    }
};
