class TrelloPoller {
    constructor(discordBot, trelloHelper, intervalSeconds = 30) {
        this.discordBot = discordBot;
        this.trelloHelper = trelloHelper;
        this.intervalSeconds = intervalSeconds;
        this.lastCheckTime = new Date();
        this.pollingInterval = null;
        this.isPolling = false;
        this.processedActions = new Set(); // Track processed action IDs
        this.maxLookbackHours = 24; // Look back up to 24 hours for missed notifications
        this.pendingNotifications = []; // Queue for chronologically ordered notifications
    }

    start() {
        if (this.isPolling) return;
        
        console.log(`🔄 Starting Trello polling every ${this.intervalSeconds} seconds`);
        this.isPolling = true;
        
        // On startup, check for missed notifications from the last 24 hours
        this.lastCheckTime = new Date(Date.now() - (this.maxLookbackHours * 60 * 60 * 1000));
        
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

    async checkForUpdates() {
        try {
            const since = this.lastCheckTime.toISOString();
            const actions = await this.trelloHelper.getBoardActions(process.env.TRELLO_BOARD_ID, since);
            
            console.log(`📊 Found ${actions.length} actions since ${since}`);
            
            // Filter out already processed actions
            const newActions = actions.filter(action => !this.processedActions.has(action.id));
            console.log(`📊 ${newActions.length} new actions to process`);
            
            if (newActions.length === 0) {
                this.lastCheckTime = new Date();
                return;
            }

            // Sort ALL actions by timestamp (oldest first) - this is the key fix
            const sortedActions = newActions.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Process each action and collect valid notifications
            const notifications = [];
            for (const action of sortedActions) {
                const notification = await this.prepareNotification(action);
                if (notification) {
                    notifications.push(notification);
                }
            }

            // Send notifications in chronological order
            for (const notification of notifications) {
                await this.sendNotification(notification);
                this.processedActions.add(notification.action.id);
                
                // Add a small delay between notifications to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Clean up old processed action IDs (keep only last 1000)
            if (this.processedActions.size > 1000) {
                const actionArray = Array.from(this.processedActions);
                this.processedActions = new Set(actionArray.slice(-1000));
            }
            
            this.lastCheckTime = new Date();
        } catch (error) {
            console.error('Error checking for Trello updates:', error);
        }
    }

    async prepareNotification(action) {
        const cardId = action.data?.card?.id;
        if (!cardId) return null;

        // Find the Discord thread associated with this Trello card
        const threadId = this.discordBot.findThreadByCardId(cardId);
        if (!threadId) {
            console.log(`No Discord thread found for Trello card: ${cardId}`);
            return null;
        }

        try {
            const thread = await this.discordBot.client.channels.fetch(threadId);
            if (!thread) return null;

            // Check if notification was already sent for this action
            const notificationExists = await this.checkIfNotificationExists(thread, action);
            if (notificationExists) {
                console.log(`📢 Notification already exists for action ${action.id}, skipping`);
                return null; // Don't create notification if it already exists
            }

            const embed = this.formatNotificationEmbed(action);
            if (embed) {
                return {
                    thread: thread,
                    embed: embed,
                    action: action,
                    timestamp: new Date(action.date)
                };
            }
        } catch (error) {
            console.error(`Error preparing notification for action ${action.id}:`, error);
        }

        return null;
    }

    async sendNotification(notification) {
        try {
            await notification.thread.send({ embeds: [notification.embed] });
            console.log(`📢 Sent notification for ${notification.action.type} on card ${notification.action.data?.card?.id} (Action ID: ${notification.action.id}) at ${notification.timestamp.toISOString()}`);
        } catch (error) {
            console.error(`Error sending notification for action ${notification.action.id}:`, error);
        }
    }

    async checkIfNotificationExists(thread, action) {
        try {
            // Get recent messages from the thread (last 50 messages should be enough)
            const messages = await thread.messages.fetch({ limit: 50 });
            
            // Look for bot messages with embeds that match this action
            const botMessages = messages.filter(msg => 
                msg.author.bot && 
                msg.embeds.length > 0 &&
                msg.embeds[0].footer?.text === 'Trello'
            );

            // Check if any bot message corresponds to this action
            for (const message of botMessages.values()) {
                const embed = message.embeds[0];
                const messageTimestamp = new Date(message.createdTimestamp);
                const actionTimestamp = new Date(action.date);
                
                // Check if the message was sent within 5 minutes of the action
                const timeDiff = Math.abs(messageTimestamp - actionTimestamp);
                const fiveMinutes = 5 * 60 * 1000;
                
                if (timeDiff <= fiveMinutes) {
                    // Check if the embed matches the action type and content
                    const expectedEmbed = this.formatNotificationEmbed(action);
                    if (expectedEmbed && 
                        embed.title === expectedEmbed.title && 
                        embed.description === expectedEmbed.description) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('Error checking for existing notifications:', error);
            return false; // If we can't check, assume notification doesn't exist
        }
    }

    formatNotificationEmbed(action) {
        const cardName = action.data?.card?.name || 'Unknown Card';
        const cardUrl = action.data?.card?.shortUrl || '#';
        const timestamp = new Date(action.date).toLocaleString();

        let title, description, color, emoji;

        switch (action.type) {
            case 'addLabelToCard':
                if (process.env.NOTIFY_LABEL_CHANGES !== 'true') return null;
                const labelName = action.data?.label?.name || action.data?.label?.color || 'Unknown Label';
                title = '🏷️ Label Added';
                description = `Label **${labelName}** was added to the card`;
                color = 0x61BD4F; // Green
                break;

            case 'removeLabelFromCard':
                if (process.env.NOTIFY_LABEL_CHANGES !== 'true') return null;
                const removedLabel = action.data?.label?.name || action.data?.label?.color || 'Unknown Label';
                title = '🏷️ Label Removed';
                description = `Label **${removedLabel}** was removed from the card`;
                color = 0xEB5A46; // Red
                break;

            case 'addChecklistToCard':
                if (process.env.NOTIFY_CHECKLIST_CHANGES !== 'true') return null;
                const checklistName = action.data?.checklist?.name || 'Unknown Checklist';
                title = '📋 Checklist Added';
                description = `Checklist **${checklistName}** was added to the card`;
                color = 0x0079BF; // Blue
                break;

            case 'updateCheckItemStateOnCard':
                if (process.env.NOTIFY_CHECKLIST_CHANGES !== 'true') return null;
                const checkItem = action.data?.checkItem?.name || 'Unknown Item';
                const state = action.data?.checkItem?.state === 'complete' ? 'completed' : 'marked incomplete';
                const stateEmoji = action.data?.checkItem?.state === 'complete' ? '✅' : '⬜';
                title = `${stateEmoji} Checklist Item ${state === 'completed' ? 'Completed' : 'Updated'}`;
                description = `Checklist item **${checkItem}** was ${state}`;
                color = action.data?.checkItem?.state === 'complete' ? 0x61BD4F : 0xF2D600; // Green or Yellow
                break;

            case 'addMemberToCard':
                if (process.env.NOTIFY_MEMBER_CHANGES !== 'true') return null;
                title = '👤 Member Assigned';
                description = 'A team member was assigned to this card';
                color = 0x9F19CC; // Purple
                break;

            case 'removeMemberFromCard':
                if (process.env.NOTIFY_MEMBER_CHANGES !== 'true') return null;
                title = '👤 Member Unassigned';
                description = 'A team member was unassigned from this card';
                color = 0xC377E0; // Light Purple
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
                        color = 0xF2D600; // Yellow
                    } else if (oldDue && !newDue) {
                        title = '📅 Due Date Removed';
                        description = 'Due date was removed from the card';
                        color = 0xEB5A46; // Red
                    } else if (oldDue && newDue && oldDue !== newDue) {
                        const dueDate = new Date(newDue).toLocaleDateString();
                        title = '📅 Due Date Changed';
                        description = `Due date was updated to **${dueDate}**`;
                        color = 0x0079BF; // Blue
                    }
                }


                // Handle name changes
                if (action.data?.old?.name !== undefined) {
                    const oldName = action.data?.old?.name;
                    title = '✏️ Card Renamed';
                    description = `Card was renamed from **${oldName}**`;
                    color = 0x0079BF; // Blue
                }
                break;

            case 'addAttachmentToCard':

                break;

            case 'deleteAttachmentFromCard':

                break;

            case 'commentCard':
                if (process.env.NOTIFY_COMMENT_CHANGES !== 'true') return null;
                title = '💬 New Comment';
                description = 'A new comment was added to the card';
                color = 0x0079BF; // Blue
                break;

            case 'moveCardToBoard':
            case 'moveCardFromBoard':
                const listName = action.data?.list?.name || action.data?.listAfter?.name || 'Unknown List';
                title = '🔄 Card Moved';
                description = `Card was moved to **${listName}**`;
                color = 0x9F19CC; // Purple
                break;

            default:
                return null;
        }

        if (!title) return null;

        return {
            color: color,
            title: title,
            description: description,
            fields: [
            ],
            footer: {
                text: 'Trello',
                icon_url: 'https://cdn.iconscout.com/icon/free/png-256/trello-226529.png'
            },
            timestamp: new Date(action.date).toISOString()
        };
    }
}

module.exports = TrelloPoller;
