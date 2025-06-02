class TrelloPoller {
    constructor(discordBot, trelloHelper, intervalSeconds = 60) {
        this.discordBot = discordBot;
        this.trelloHelper = trelloHelper;
        this.intervalSeconds = intervalSeconds;
        this.lastCheckTime = new Date();
        this.pollingInterval = null;
        this.isPolling = false;
        this.maxLookbackHours = parseInt(process.env.MAX_LOOKBACK_HOURS) || 24;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 5;
        
        // Simplified and more reliable tracking
        this.processedActions = new Set(); // Only track Trello action IDs
        this.sentNotifications = new Map(); // cardId -> Set of notification content hashes
    }

    start() {
        if (this.isPolling) return;
        console.log(`🔄 Starting Trello polling every ${this.intervalSeconds} seconds`);
        this.isPolling = true;
        
        // Load existing notifications efficiently
        this.loadExistingNotifications();
        
        // Shorter lookback to prevent spam on startup
        this.lastCheckTime = new Date(Date.now() - (30 * 60 * 1000)); // Only 30 minutes lookback
        
        this.pollingInterval = setInterval(async () => {
            await this.checkForUpdates();
        }, this.intervalSeconds * 1000);

        // Run initial check immediately
        this.checkForUpdates();
    }

    stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            this.isPolling = false;
            console.log('🔄 Stopped Trello polling');
        }
    }

    async loadExistingNotifications() {
        try {
            console.log('🔍 Loading existing notifications to prevent duplicates...');
            
            // Get all threads that have linked cards
            const cardThreadPairs = Array.from(this.discordBot.cardThreadMap.entries());
            let totalNotifications = 0;
            
            for (const [cardId, threadId] of cardThreadPairs) {
                try {
                    const thread = await this.discordBot.client.channels.fetch(threadId);
                    if (!thread) continue;
                    
                    const notificationCount = await this.scanThreadNotifications(thread, cardId);
                    totalNotifications += notificationCount;
                } catch (error) {
                    console.error(`Error scanning thread ${threadId}:`, error.message);
                }
            }
            
            console.log(`📊 Loaded ${totalNotifications} existing notifications from ${cardThreadPairs.length} threads`);
        } catch (error) {
            console.error('Error loading existing notifications:', error);
        }
    }

    async scanThreadNotifications(thread, cardId) {
        try {
            // Fetch recent messages (last 100 to be thorough)
            const messages = await thread.messages.fetch({ limit: 100 });
            
            const botMessages = messages.filter(msg =>
                msg.author.bot &&
                msg.embeds.length > 0 &&
                msg.embeds[0].footer?.text === 'Trello'
            );

            if (!this.sentNotifications.has(cardId)) {
                this.sentNotifications.set(cardId, new Set());
            }

            let notificationCount = 0;
            for (const message of botMessages.values()) {
                const embed = message.embeds[0];
                const contentHash = this.createContentHash(embed);
                
                this.sentNotifications.get(cardId).add(contentHash);
                notificationCount++;
            }
            
            return notificationCount;
        } catch (error) {
            console.error(`Error scanning notifications for thread ${thread.name}:`, error.message);
            return 0;
        }
    }

    createContentHash(embed) {
        // Create a simple content-based hash for duplicate detection
        const content = `${embed.title}:${embed.description}`;
        return this.simpleHash(content);
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }

    async checkForUpdates() {
        try {
            const since = this.lastCheckTime.toISOString();
            const actions = await this.trelloHelper.getBoardActions(process.env.TRELLO_BOARD_ID, since);
            
            this.consecutiveErrors = 0;
            console.log(`📊 Found ${actions.length} actions since ${since}`);

            // Primary filter: Only use action IDs for duplicate detection
            const newActions = actions.filter(action => {
                return !this.processedActions.has(action.id);
            });
            
            console.log(`📊 ${newActions.length} new actions to process`);

            if (newActions.length === 0) {
                this.lastCheckTime = new Date();
                return;
            }

            const sortedActions = newActions.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            for (const action of sortedActions) {
                const success = await this.processAction(action);
                if (success) {
                    this.processedActions.add(action.id);
                }
                
                // Add delay between notifications
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Cleanup old data
            this.cleanupOldData();
            this.lastCheckTime = new Date();

        } catch (error) {
            this.handlePollingError(error);
        }
    }

    async processAction(action) {
        const cardId = action.data?.card?.id;
        if (!cardId) return false;

        const threadId = this.discordBot.findThreadByCardId(cardId);
        if (!threadId) {
            console.log(`No Discord thread found for Trello card: ${cardId}`);
            return false;
        }

        try {
            const thread = await this.discordBot.client.channels.fetch(threadId);
            if (!thread) return false;

            const embed = this.formatNotificationEmbed(action);
            if (!embed) return false;

            // Secondary check: Only check for content duplicates if we have existing notifications
            if (this.sentNotifications.has(cardId)) {
                const contentHash = this.createContentHash(embed);
                if (this.sentNotifications.get(cardId).has(contentHash)) {
                    console.log(`📢 Skipping content duplicate for action ${action.id} on card ${cardId}`);
                    return false;
                }
            }

            // Send notification
            await thread.send({ embeds: [embed] });
            
            // Cache this notification content
            if (!this.sentNotifications.has(cardId)) {
                this.sentNotifications.set(cardId, new Set());
            }
            
            const contentHash = this.createContentHash(embed);
            this.sentNotifications.get(cardId).add(contentHash);

            console.log(`📢 Sent notification for ${action.type} on card ${cardId} (Action ID: ${action.id})`);
            return true;

        } catch (error) {
            console.error(`Error processing action ${action.id}:`, error);
            return false;
        }
    }

    cleanupOldData() {
        // Clean up processed actions (keep last 2000)
        if (this.processedActions.size > 2000) {
            const actionArray = Array.from(this.processedActions);
            this.processedActions = new Set(actionArray.slice(-2000));
        }

        // Clean up sent notifications cache (keep last 100 cards)
        if (this.sentNotifications.size > 100) {
            const cardArray = Array.from(this.sentNotifications.keys());
            const cardsToKeep = cardArray.slice(-100);
            const newCache = new Map();
            
            cardsToKeep.forEach(cardId => {
                newCache.set(cardId, this.sentNotifications.get(cardId));
            });
            
            this.sentNotifications = newCache;
        }
    }

    handlePollingError(error) {
        this.consecutiveErrors++;
        
        if (error.code === 'ECONNRESET' || error.name === 'AbortError') {
            console.log(`⚠️ Connection issue during polling (attempt ${this.consecutiveErrors}/${this.maxConsecutiveErrors}): ${error.message}`);
        } else {
            console.error(`❌ Error checking for Trello updates (attempt ${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, error);
        }

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            console.log(`⚠️ Too many consecutive errors, temporarily increasing polling interval`);
            
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }
            
            const tempInterval = this.intervalSeconds * 2;
            console.log(`🔄 Restarting polling with ${tempInterval} second interval`);
            
            this.pollingInterval = setInterval(async () => {
                await this.checkForUpdates();
            }, tempInterval * 1000);
            
            this.consecutiveErrors = 0;
        }
    }

    formatNotificationEmbed(action) {
        const cardName = action.data?.card?.name || 'Unknown Card';
        const timestamp = new Date(action.date).toLocaleString();
        let title, description, color;

        switch (action.type) {
            case 'addLabelToCard':
                if (process.env.NOTIFY_LABEL_CHANGES !== 'true') return null;
                const labelName = action.data?.label?.name || action.data?.label?.color || 'Unknown Label';
                title = '🏷️ Label Added';
                description = `Label **${labelName}** was added to the card`;
                color = 0x61BD4F;
                break;

            case 'removeLabelFromCard':
                if (process.env.NOTIFY_LABEL_CHANGES !== 'true') return null;
                const removedLabel = action.data?.label?.name || action.data?.label?.color || 'Unknown Label';
                title = '🏷️ Label Removed';
                description = `Label **${removedLabel}** was removed from the card`;
                color = 0xEB5A46;
                break;

            case 'addChecklistToCard':
                if (process.env.NOTIFY_CHECKLIST_CHANGES !== 'true') return null;
                const checklistName = action.data?.checklist?.name || 'Unknown Checklist';
                title = '📋 Checklist Added';
                description = `Checklist **${checklistName}** was added to the card`;
                color = 0x0079BF;
                break;

            case 'updateCheckItemStateOnCard':
                if (process.env.NOTIFY_CHECKLIST_CHANGES !== 'true') return null;
                const checkItem = action.data?.checkItem?.name || 'Unknown Item';
                const state = action.data?.checkItem?.state === 'complete' ? 'completed' : 'marked incomplete';
                const stateEmoji = action.data?.checkItem?.state === 'complete' ? '✅' : '⬜';
                title = `${stateEmoji} Checklist Item ${state === 'completed' ? 'Completed' : 'Updated'}`;
                description = `Checklist item **${checkItem}** was ${state}`;
                color = action.data?.checkItem?.state === 'complete' ? 0x61BD4F : 0xF2D600;
                break;

            case 'addMemberToCard':
                if (process.env.NOTIFY_MEMBER_CHANGES !== 'true') return null;
                title = '👤 Member Assigned';
                description = 'A team member was assigned to this card';
                color = 0x9F19CC;
                break;

            case 'removeMemberFromCard':
                if (process.env.NOTIFY_MEMBER_CHANGES !== 'true') return null;
                title = '👤 Member Unassigned';
                description = 'A team member was unassigned from this card';
                color = 0xC377E0;
                break;

            case 'updateCard':
                // Handle due date changes
                if (action.data?.old?.due !== undefined || action.data?.card?.due !== undefined) {
                    if (process.env.NOTIFY_DUE_DATE_CHANGES !== 'true') return null;
                    const oldDue = action.data?.old?.due;
                    const newDue = action.data?.card?.due;

                    if (!oldDue && newDue) {
                        const dueDate = new Date(newDue).toLocaleDateString();
                        title = '📅 Due Date Set';
                        description = `Due date was set to **${dueDate}**`;
                        color = 0xF2D600;
                    } else if (oldDue && !newDue) {
                        title = '📅 Due Date Removed';
                        description = 'Due date was removed from the card';
                        color = 0xEB5A46;
                    } else if (oldDue && newDue && oldDue !== newDue) {
                        const dueDate = new Date(newDue).toLocaleDateString();
                        title = '📅 Due Date Changed';
                        description = `Due date was updated to **${dueDate}**`;
                        color = 0x0079BF;
                    }
                }

                // Handle name changes
                if (action.data?.old?.name !== undefined) {
                    const oldName = action.data?.old?.name;
                    title = '✏️ Card Renamed';
                    description = `Card was renamed from **${oldName}**`;
                    color = 0x0079BF;
                }

                // Handle list moves
                if (action.data?.listBefore && action.data?.listAfter) {
                    const fromList = action.data.listBefore.name;
                    const toList = action.data.listAfter.name;
                    title = '🔄 Card Moved';
                    description = `Card was moved from **${fromList}** to **${toList}**`;
                    color = 0x9F19CC;
                }
                break;

            case 'commentCard':
                if (process.env.NOTIFY_COMMENT_CHANGES !== 'true') return null;
                title = '💬 New Comment';
                description = 'A new comment was added to the card';
                color = 0x0079BF;
                break;

            case 'moveCardToBoard':
            case 'moveCardFromBoard':
                const listName = action.data?.list?.name || action.data?.listAfter?.name || 'Unknown List';
                title = '🔄 Card Moved';
                description = `Card was moved to **${listName}**`;
                color = 0x9F19CC;
                break;

            default:
                return null;
        }

        if (!title) return null;

        return {
            color: color,
            title: title,
            description: description,
            fields: [],
            footer: {
                text: 'Trello',
                icon_url: 'https://cdn.iconscout.com/icon/free/png-256/trello-226529.png'
            },
            timestamp: new Date(action.date).toISOString()
        };
    }
}

module.exports = TrelloPoller;
