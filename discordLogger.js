// discordLogger.js - Discord Integration for IMPOSTER
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config.js');

class DiscordLogger {
    constructor() {
        this.client = null;
        this.channelId = config.discord.channelId;
        this.enabled = config.discord.enabled;
        this.ready = false;
        
        if (this.enabled && config.discord.token !== 'YOUR_DISCORD_BOT_TOKEN_HERE') {
            this.init();
        }
    }
    
    init() {
        this.client = new Client({ 
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
        });
        
        this.client.once('ready', () => {
            console.log('✅ Discord Logger connected');
            this.ready = true;
            
            // Send startup message
            this.sendStartupLog();
        });
        
        this.client.on('error', (error) => {
            console.error('Discord client error:', error);
            this.ready = false;
        });
        
        this.client.login(config.discord.token).catch(err => {
            console.error('Failed to login to Discord:', err.message);
            this.ready = false;
        });
    }
    
    async sendToDiscord(embed) {
        if (!this.ready || !this.enabled || !this.channelId) return;
        
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            if (channel) {
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Failed to send to Discord:', error.message);
        }
    }
    
    async sendStartupLog() {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🚀 IMPOSTER DOWNLOADER STARTED')
            .setDescription('Server is now online and ready')
            .addFields(
                { name: 'Version', value: config.server.version, inline: true },
                { name: 'Environment', value: config.server.environment, inline: true },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: '© IMPOSTER 2026-2027' })
            .setTimestamp();
        
        await this.sendToDiscord(embed);
    }
    
    async logVisit(ip, userAgent, deviceInfo, location) {
        if (!config.discord.logVisits) return;
        
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('👁️ NEW VISITOR')
            .addFields(
                { name: 'IP Address', value: ip || 'Unknown', inline: false },
                { name: 'Device', value: deviceInfo || 'Unknown', inline: true },
                { name: 'Browser', value: userAgent || 'Unknown', inline: true },
                { name: 'Location', value: location || 'Unknown', inline: true },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: '© IMPOSTER 2026-2027' })
            .setTimestamp();
        
        await this.sendToDiscord(embed);
    }
    
    async logDownload(url, platform, format, ip, deviceInfo, success = true) {
        if (!config.discord.logDownloads) return;
        
        const color = success ? 0x00ff00 : 0xff0000;
        const title = success ? '✅ DOWNLOAD COMPLETED' : '❌ DOWNLOAD FAILED';
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .addFields(
                { name: 'Platform', value: platform || 'Unknown', inline: true },
                { name: 'Format', value: format || 'mp4', inline: true },
                { name: 'IP Address', value: ip || 'Unknown', inline: false },
                { name: 'Device', value: deviceInfo || 'Unknown', inline: true },
                { name: 'URL', value: url.substring(0, 100) + '...', inline: false },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: '© IMPOSTER 2026-2027' })
            .setTimestamp();
        
        await this.sendToDiscord(embed);
    }
    
    async logError(error, ip, url) {
        if (!config.discord.logErrors) return;
        
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('⚠️ ERROR OCCURRED')
            .addFields(
                { name: 'Error', value: error.message || 'Unknown error', inline: false },
                { name: 'IP', value: ip || 'Unknown', inline: true },
                { name: 'URL', value: url ? url.substring(0, 100) + '...' : 'N/A', inline: false },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: '© IMPOSTER 2026-2027' })
            .setTimestamp();
        
        await this.sendToDiscord(embed);
    }
    
    async logUserAction(action, details, ip) {
        const embed = new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle(`👤 USER ACTION: ${action}`)
            .addFields(
                { name: 'Details', value: details || 'N/A', inline: false },
                { name: 'IP', value: ip || 'Unknown', inline: true },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setFooter({ text: '© IMPOSTER 2026-2027' })
            .setTimestamp();
        
        await this.sendToDiscord(embed);
    }
}

module.exports = DiscordLogger;
