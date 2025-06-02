const { Client, GatewayIntentBits, Events } = require('discord.js');
const TrelloHelper = require('./trello-helper');
const TrelloPoller = require('./trello-poller');
require('dotenv').config();

class DiscordTrelloBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessageReactions
            ]
        });

        this.trello = new TrelloHelper(process.env.TRELLO_KEY, process.env.TRELLO_TOKEN);
        this.threadCardMap = new Map(); // threadId -> cardId
        this.cardThreadMap = new Map(); // cardId -> threadId (reverse mapping)
        this.processingThreads = new Set();
        
        // Initialize polling service if enabled
        if (process.env.ENABLE_TRELLO_POLLING === 'true') {
            const intervalSeconds = parseInt(process.env.POLLING_INTERVAL_SECONDS) || 30;
            this.trelloPoller = new TrelloPoller(this, this.trello, intervalSeconds);
        }

        this.setupEventHandlers();
    }

    // Add method to find thread by card ID
    findThreadByCardId(cardId) {
        return this.cardThreadMap.get(cardId);
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, async () => {
            console.log(`Bot is ready! Logged in as ${this.client.user.tag}`);
            await this.initializeExistingThreads();
            
            // Start polling service after Discord client is ready
            if (this.trelloPoller) {
                this.trelloPoller.start();
            }
        });

        this.client.on(Events.ThreadCreate, async (thread) => {
            if (thread.parentId === process.env.FORUM_CHANNEL_ID) {
                await this.handleNewThread(thread);
            }
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.channel.isThread() &&
                message.channel.parentId === process.env.FORUM_CHANNEL_ID) {
                await this.handleThreadMessage(message);
            }
        });

        this.client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
            if (newMessage.channel.isThread() &&
                newMessage.channel.parentId === process.env.FORUM_CHANNEL_ID) {
                await this.handleThreadMessage(newMessage);
            }
        });
    }

    async initializeExistingThreads() {
        try {
            const guild = this.client.guilds.cache.get(process.env.GUILD_ID);
            const forumChannel = guild.channels.cache.get(process.env.FORUM_CHANNEL_ID);
            if (!forumChannel || !forumChannel.isThreadOnly()) {
                console.error('Forum channel not found or is not a forum channel');
                return;
            }

            const threads = await forumChannel.threads.fetchActive();
            for (const [threadId, thread] of threads.threads) {
                await this.processExistingThread(thread);
            }

            console.log(`Initialized ${threads.threads.size} existing threads`);
        } catch (error) {
            console.error('Error initializing existing threads:', error);
        }
    }

    async processExistingThread(thread) {
        try {
            const threadCreator = await this.getThreadCreator(thread);
            const existingCardId = await this.findExistingCard(thread.name, threadCreator);
            
            if (existingCardId) {
                console.log(`Found existing card for thread: ${thread.name} by ${threadCreator}`);
                this.threadCardMap.set(thread.id, existingCardId);
                this.cardThreadMap.set(existingCardId, thread.id); // Add reverse mapping
                await this.updateCardWithAllMessages(thread, existingCardId);
            } else {
                console.log(`No existing card found for thread: ${thread.name} by ${threadCreator}, creating new one`);
                await this.createNewThreadCard(thread);
            }
        } catch (error) {
            console.error(`Error processing existing thread ${thread.name}:`, error);
        }
    }

    async handleNewThread(thread) {
        if (this.threadCardMap.has(thread.id)) {
            console.log(`Thread ${thread.name} already has a mapped card, updating it`);
            const cardId = this.threadCardMap.get(thread.id);
            await this.updateCardWithAllMessages(thread, cardId);
            return;
        }

        if (this.processingThreads.has(thread.id)) {
            console.log(`Thread ${thread.name} is already being processed, waiting...`);
            let attempts = 0;
            while (this.processingThreads.has(thread.id) && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }

            if (this.threadCardMap.has(thread.id)) {
                console.log(`Thread ${thread.name} card was created while waiting`);
                return;
            }
        }

        this.processingThreads.add(thread.id);
        try {
            const threadCreator = await this.getThreadCreator(thread);
            const existingCardId = await this.findExistingCard(thread.name, threadCreator);
            
            if (existingCardId) {
                console.log(`Thread ${thread.name} by ${threadCreator} already has a card, using existing`);
                this.threadCardMap.set(thread.id, existingCardId);
                this.cardThreadMap.set(existingCardId, thread.id); // Add reverse mapping
                await this.updateCardWithAllMessages(thread, existingCardId);
            } else {
                await this.createNewThreadCard(thread);
            }
        } catch (error) {
            console.error(`Error handling new thread ${thread.name}:`, error);
        } finally {
            this.processingThreads.delete(thread.id);
        }
    }

    async createNewThreadCard(thread) {
        try {
            console.log(`Creating NEW Trello card for thread: ${thread.name}`);
            const cardData = await this.createTrelloCard(thread);
            if (!cardData || !cardData.id) {
                throw new Error('Card creation returned invalid data');
            }

            this.threadCardMap.set(thread.id, cardData.id);
            this.cardThreadMap.set(cardData.id, thread.id); // Add reverse mapping
            
            await this.updateCardWithAllMessages(thread, cardData.id);
            
            console.log(`✅ Successfully created and updated Trello card for thread: ${thread.name} (ID: ${cardData.id})`);
        } catch (error) {
            console.error(`❌ Error creating new card for thread ${thread.name}:`, error.message);
            throw error;
        }
    }

    async createTrelloCard(thread) {
        try {
            const threadCreator = await this.getThreadCreator(thread);
            const cardName = `[Discord] ${thread.name} - by ${threadCreator}`;
            
            const threadCreated = new Date(thread.createdTimestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });

            const cardDescription = `# 💬 ${thread.name}\n\n**📍 Thread Details**\n• **ID:** \`${thread.id}\`\n• **Creator:** ${threadCreator}\n• **Created:** ${threadCreated}\n\n*Loading thread content...*`;

            const cardData = {
                name: cardName,
                desc: cardDescription,
                idList: process.env.TRELLO_LIST_ID,
                pos: 'top'
            };

            console.log(`Making Trello API call to create card: ${cardName}`);
            console.log(`Using List ID: ${process.env.TRELLO_LIST_ID}`);
            console.log(`Card data:`, cardData);

            const result = await this.trello.card.create(cardData);
            console.log(`Trello API response:`, result);
            return result;
        } catch (error) {
            console.error(`Trello card creation failed:`, error);
            throw error;
        }
    }

    async getThreadCreator(thread) {
        try {
            if (thread.ownerId) {
                const owner = await this.client.users.fetch(thread.ownerId);
                return owner.username;
            }

            const starterMessage = await thread.fetchStarterMessage();
            if (starterMessage && starterMessage.author) {
                return starterMessage.author.username;
            }

            return 'Unknown';
        } catch (error) {
            console.error('Error getting thread creator:', error);
            return 'Unknown';
        }
    }

    async handleThreadMessage(message) {
        try {
            // Ignore messages from bots (including this bot's own notifications)
            if (message.author.bot) {
                console.log(`Ignoring bot message from ${message.author.username} in thread: ${message.channel.name}`);
                return;
            }
    
            let cardId = this.threadCardMap.get(message.channel.id);
            if (!cardId) {
                console.log(`No card found for thread ${message.channel.name}, creating one...`);
                await this.handleNewThread(message.channel);
                cardId = this.threadCardMap.get(message.channel.id);
                if (!cardId) {
                    console.error(`❌ Failed to create card for thread ${message.channel.name}`);
                    return;
                }
            }
    
            await this.updateCardWithAllMessages(message.channel, cardId);
            console.log(`✅ Updated Trello card for message in thread: ${message.channel.name}`);
        } catch (error) {
            console.error('Error handling thread message:', error);
        }
    }
    

    async updateCardWithAllMessages(thread, cardId) {
        try {
            const messages = await this.fetchAllThreadMessages(thread);
            const threadCreated = new Date(thread.createdTimestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });

            let description = `# 💬 ${thread.name}\n\n`;
            description += `**📍 Thread Details**\n`;
            description += `• **ID:** \`${thread.id}\`\n`;
            description += `• **Created:** ${threadCreated}\n`;
            description += `• **Messages:** ${messages.length}\n`;
            description += `• **Participants:** ${new Set(messages.map(m => m.author.username)).size}\n\n`;

            const participants = [...new Set(messages.map(m => m.author.username))];
            description += `**👥 Participants:** ${participants.join(', ')}\n\n`;

            const originalPost = messages[0];
            const replies = messages.slice(1);

            description += `## 📋 Original Thread Post\n`;
            description += `**═══════════════════════════════════════**\n\n`;

            if (originalPost) {
                description += await this.formatMessageForCard(originalPost, true);
            }

            description += `\n**═══════════════════════════════════════**\n`;
            description += `**⬆️ END OF ORIGINAL POST ⬆️**\n`;
            description += `**═══════════════════════════════════════**\n\n`;

            if (replies.length > 0) {
                description += `## 💬 Thread Replies & Discussion\n`;
                description += `**🔽 NEW CONTENT STARTS HERE 🔽**\n\n`;

                const repliesByDate = this.groupMessagesByDate(replies);
                for (const [date, dayMessages] of repliesByDate) {
                    description += `### 📅 ${date}\n`;
                    for (const message of dayMessages) {
                        description += await this.formatMessageForCard(message, false);
                    }
                }
            } else {
                description += `## 💬 Thread Replies\n`;
                description += `*No replies yet - this thread only contains the original post.*\n`;
            }

            await this.trello.card.update(cardId, { desc: description });

            // Process attachments
            const existingAttachments = await this.trello.searchAttachments(cardId);
            const existingUrls = new Set();
            const existingNames = new Set();

            existingAttachments.forEach(att => {
                existingUrls.add(att.url);
                existingNames.add(att.name);
                try {
                    const baseUrl = att.url.split('?')[0];
                    existingUrls.add(baseUrl);
                } catch (e) {
                    // Ignore URL parsing errors
                }
            });

            console.log(`Processing attachments for ${messages.length} messages. Existing attachments: ${existingAttachments.length}`);

            const processedUrls = new Set();
            const processedNames = new Set();

            for (const message of messages) {
                // Process Discord attachments
                for (const attachment of message.attachments.values()) {
                    const baseUrl = attachment.url.split('?')[0];
                    const isDuplicateUrl = existingUrls.has(attachment.url) ||
                        existingUrls.has(baseUrl) ||
                        processedUrls.has(attachment.url) ||
                        processedUrls.has(baseUrl);

                    const isDuplicateName = existingNames.has(attachment.name) ||
                        processedNames.has(attachment.name);

                    if (!isDuplicateUrl && !isDuplicateName) {
                        console.log(`Adding new attachment: ${attachment.name}`);
                        try {
                            await this.trello.addAttachment(cardId, {
                                url: attachment.url,
                                name: attachment.name
                            });
                            processedUrls.add(attachment.url);
                            processedUrls.add(baseUrl);
                            processedNames.add(attachment.name);
                            existingUrls.add(attachment.url);
                            existingUrls.add(baseUrl);
                            existingNames.add(attachment.name);
                        } catch (error) {
                            console.error(`Failed to add attachment ${attachment.name}:`, error.message);
                        }
                    } else {
                        console.log(`Skipping duplicate attachment: ${attachment.name}`);
                    }
                }

                // Process embeds
                for (const embed of message.embeds) {
                    let attachmentName = 'Embedded Content';
                    let urlToProcess = null;

                    if (embed.image && embed.image.url) {
                        urlToProcess = embed.image.url;
                        attachmentName = embed.title || 'Embedded Image';
                    } else if (embed.video && embed.video.url) {
                        urlToProcess = embed.video.url;
                        attachmentName = embed.title || 'Embedded Video';
                    } else if (embed.url && embed.type !== 'image' && embed.type !== 'gifv') {
                        urlToProcess = embed.url;
                        attachmentName = embed.title || 'Embedded Link';
                    }

                    if (urlToProcess) {
                        const baseUrl = urlToProcess.split('?')[0];
                        const isDuplicateUrl = existingUrls.has(urlToProcess) ||
                            existingUrls.has(baseUrl) ||
                            processedUrls.has(urlToProcess) ||
                            processedUrls.has(baseUrl);

                        const isDuplicateName = existingNames.has(attachmentName) ||
                            processedNames.has(attachmentName);

                        if (!isDuplicateUrl && !isDuplicateName) {
                            console.log(`Adding new embed attachment: ${attachmentName}`);
                            try {
                                await this.trello.addAttachment(cardId, {
                                    url: urlToProcess,
                                    name: attachmentName
                                });
                                processedUrls.add(urlToProcess);
                                processedUrls.add(baseUrl);
                                processedNames.add(attachmentName);
                                existingUrls.add(urlToProcess);
                                existingUrls.add(baseUrl);
                                existingNames.add(attachmentName);
                            } catch (error) {
                                console.error(`Failed to add embed attachment ${attachmentName}:`, error.message);
                            }
                        } else {
                            console.log(`Skipping duplicate embed: ${attachmentName}`);
                        }
                    }
                }

                // Extract URLs from message content
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const urls = message.content.match(urlRegex) || [];

                for (const url of urls) {
                    const baseUrl = url.split('?')[0];
                    const attachmentName = 'Shared Link';

                    const isDuplicateUrl = existingUrls.has(url) ||
                        existingUrls.has(baseUrl) ||
                        processedUrls.has(url) ||
                        processedUrls.has(baseUrl);

                    if (!isDuplicateUrl) {
                        console.log(`Adding new URL attachment: ${url}`);
                        try {
                            await this.trello.addAttachment(cardId, {
                                url: url,
                                name: attachmentName
                            });
                            processedUrls.add(url);
                            processedUrls.add(baseUrl);
                            existingUrls.add(url);
                            existingUrls.add(baseUrl);
                        } catch (error) {
                            console.error(`Failed to add URL attachment ${url}:`, error.message);
                        }
                    } else {
                        console.log(`Skipping duplicate URL: ${url}`);
                    }
                }
            }

            console.log(`Finished processing attachments. Total processed: ${processedUrls.size}`);
        } catch (error) {
            console.error('Error updating card with all messages:', error);
        }
    }

    groupMessagesByDate(messages) {
        const grouped = new Map();
        messages.forEach(message => {
            const date = new Date(message.createdTimestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date).push(message);
        });
        return grouped;
    }

    async fetchAllThreadMessages(thread) {
        const messages = [];
        let lastMessageId = null;
    
        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
    
            const fetchedMessages = await thread.messages.fetch(options);
            if (fetchedMessages.size === 0) break;
    
            // Filter out bot messages when collecting messages
            const humanMessages = fetchedMessages.filter(msg => !msg.author.bot);
            messages.push(...humanMessages.values());
            
            lastMessageId = fetchedMessages.last().id;
        }
    
        return messages.reverse();
    }
    

    async formatMessageForCard(message, isOriginalPost = false) {
        const timestamp = new Date(message.createdTimestamp).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const author = message.author.username;
        const content = message.content || '';
        const authorPrefix = isOriginalPost ? '👑 **THREAD CREATOR**' : '💭';

        let formattedMessage = `\n${authorPrefix} **${author}** • *${timestamp}*\n`;

        const isJustUrl = this.isJustMediaUrl(content);
        const hasTextContent = content.trim().length > 0 && !isJustUrl;
        const hasAttachments = message.attachments.size > 0;
        const hasEmbeds = message.embeds.length > 0;

        if ((!hasTextContent && (hasAttachments || hasEmbeds)) || isJustUrl) {
            if (isJustUrl) {
                const mediaType = this.getMediaTypeFromUrl(content.trim());
                formattedMessage += `*${author} only attached ${mediaType}*\n`;
                formattedMessage += `🔗 ${content.trim()}\n`;
            } else if (hasAttachments) {
                const attachmentTypes = this.categorizeAttachments(message.attachments);
                formattedMessage += `*${author} only attached ${attachmentTypes}*\n`;
                const firstAttachment = message.attachments.first();
                formattedMessage += `🔗 ${firstAttachment.url}\n`;
            } else if (hasEmbeds) {
                const embedType = this.getEmbedType(message.embeds[0]);
                formattedMessage += `*${author} only attached ${embedType}*\n`;
                if (message.embeds[0].url) {
                    formattedMessage += `🔗 ${message.embeds[0].url}\n`;
                }
            }

            formattedMessage += '\n---\n';
            return formattedMessage;
        }

        if (hasTextContent) {
            if (isOriginalPost) {
                formattedMessage += `**📝 ORIGINAL THREAD CONTENT:**\n`;
            }

            const formattedContent = this.formatDiscordMarkdown(content);
            formattedMessage += `${formattedContent}\n`;

            if (message.embeds.length > 0) {
                const embedInfo = this.processEmbeds(message.embeds, true);
                if (embedInfo.trim()) {
                    formattedMessage += embedInfo;
                }
            }

            if (message.attachments.size > 0) {
                const attachmentInfo = this.processAttachments(message.attachments, true);
                if (attachmentInfo) {
                    formattedMessage += attachmentInfo;
                }
            }
        }

        formattedMessage += '\n---\n';
        return formattedMessage;
    }

    isJustMediaUrl(content) {
        const trimmed = content.trim();
        if (!trimmed) return false;

        const mediaExtensions = /\.(gif|png|jpg|jpeg|webp|mp4|mov|avi|webm|mkv|mp3|wav|ogg|flac|m4a)(\?|$)/i;
        if (mediaExtensions.test(trimmed)) return true;

        const discordCdnRegex = /cdn\.discordapp\.com|media\.discordapp\.net/i;
        if (discordCdnRegex.test(trimmed)) return true;

        const tenorShareRegex = /^https?:\/\/(www\.)?tenor\.com\/view\/[^\s]+$/i;
        if (tenorShareRegex.test(trimmed)) return true;

        return false;
    }

    getMediaTypeFromUrl(url) {
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('.gif') || lowerUrl.includes('gif')) {
            return 'a GIF';
        } else if (lowerUrl.includes('tenor.com/view/')) {
            return 'a GIF';
        } else if (lowerUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/)) {
            return 'an Image';
        } else if (lowerUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/)) {
            return 'a Video';
        } else if (lowerUrl.match(/\.(mp3|wav|ogg|flac|m4a)(\?|$)/)) {
            return 'an Audio File';
        } else {
            return 'a File';
        }
    }

    categorizeAttachments(attachments) {
        const types = {
            images: 0,
            videos: 0,
            audio: 0,
            files: 0,
            gifs: 0
        };

        attachments.forEach(attachment => {
            const ext = attachment.name.split('.').pop()?.toLowerCase();
            const contentType = attachment.contentType?.toLowerCase() || '';

            if (ext === 'gif' || contentType.includes('gif')) {
                types.gifs++;
            } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext) || contentType.startsWith('image/')) {
                types.images++;
            } else if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext) || contentType.startsWith('video/')) {
                types.videos++;
            } else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext) || contentType.startsWith('audio/')) {
                types.audio++;
            } else {
                types.files++;
            }
        });

        const parts = [];
        if (types.gifs > 0) parts.push(types.gifs === 1 ? 'a GIF' : `${types.gifs} GIFs`);
        if (types.images > 0) parts.push(types.images === 1 ? 'an Image' : `${types.images} Images`);
        if (types.videos > 0) parts.push(types.videos === 1 ? 'a Video' : `${types.videos} Videos`);
        if (types.audio > 0) parts.push(types.audio === 1 ? 'an Audio File' : `${types.audio} Audio Files`);
        if (types.files > 0) parts.push(types.files === 1 ? 'a File' : `${types.files} Files`);

        if (parts.length === 0) return 'an Attachment';
        if (parts.length === 1) return parts[0];
        if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;

        const lastPart = parts.pop();
        return `${parts.join(', ')}, and ${lastPart}`;
    }

    getEmbedType(embed) {
        if (embed.type === 'image') return 'an Image';
        if (embed.type === 'gifv') return 'a GIF';
        if (embed.type === 'video') return 'a Video';
        if (embed.type === 'rich' && embed.image) return 'an Image';
        if (embed.type === 'rich' && embed.video) return 'a Video';
        if (embed.url) return 'a Link';
        return 'an Embed';
    }

    formatDiscordMarkdown(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '**$1**')
            .replace(/\*(.*?)\*/g, '*$1*')
            .replace(/__(.*?)__/g, '__$1__')
            .replace(/~~(.*?)~~/g, '~~$1~~')
            .replace(/`(.*?)`/g, '`$1`')
            .replace(/``````/g, '\n``````\n')
            .replace(/> (.*)/g, '> $1')
            .replace(/\|\|(.*?)\|\|/g, '[SPOILER: $1]');
    }

    processEmbeds(embeds, showEmbeds = true) {
        if (!showEmbeds) {
            return '';
        }

        if (embeds.length === 0) {
            return '';
        }

        let embedInfo = '';
        embeds.forEach(embed => {
            if (embed.url) {
                embedInfo += `🔗 ${embed.url}\n`;
            }
        });
        return embedInfo;
    }

    processAttachments(attachments, showAttachments = true) {
        if (!showAttachments || attachments.size === 0) {
            return '';
        }

        let attachmentInfo = '';
        attachments.forEach(attachment => {
            attachmentInfo += `🔗 ${attachment.url}\n`;
        });
        return attachmentInfo;
    }

    async findExistingCard(threadName, threadCreator) {
        try {
            const cards = await this.trello.board.searchCards(process.env.TRELLO_BOARD_ID);
            const cardName = `[Discord] ${threadName} - by ${threadCreator}`;
            const existingCard = cards.find(card => card.name === cardName);
            return existingCard ? existingCard.id : null;
        } catch (error) {
            console.error('Error searching for existing card:', error);
            return null;
        }
    }

    start() {
        this.client.login(process.env.DISCORD_TOKEN);
    }

    stop() {
        if (this.trelloPoller) {
            this.trelloPoller.stop();
        }
        this.client.destroy();
    }
}

const bot = new DiscordTrelloBot();
bot.start();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    bot.stop();
    process.exit(0);
});
