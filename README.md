# Discord-Trello Bot

A Discord bot that automatically syncs forum channel threads with Trello cards, providing seamless integration between Discord discussions and Trello project management.

## ✨ Features

- **🔄 Automatic Thread Sync** - Creates Trello cards for new Discord forum threads
- **⚡ Real-time Updates** - Updates Trello cards when thread messages are added or modified
- **📎 Attachment Support** - Syncs Discord attachments, embeds, and shared links to Trello cards
- **🛡️ Duplicate Prevention** - Intelligent handling to avoid duplicate cards and attachments
- **🎨 Rich Formatting** - Preserves Discord markdown formatting in Trello card descriptions
- **🗺️ Thread Mapping** - Maintains persistent mapping between Discord threads and Trello cards
- **🔔 Polling Support** - Real-time monitoring of Trello changes with Discord notifications

## 📋 Prerequisites

Before setting up the bot, ensure you have:

- **Node.js** (version 18 or higher) OR **Docker**
- A **Discord Application** and Bot Token
- A **Trello Account** with API access
- A **Discord Server** with a forum channel

---

## 🚀 Installation & Deployment

### 🐳 Option 1: Docker Deployment (Recommended)

**Step 1: Get the Project**

Clone or download the project files to your local machine.

**Step 2: Configure Environment Variables**

Copy `env.example` to `.env` and fill in your configuration:

> **Discord Configuration**
> - `DISCORD_TOKEN` - Your Discord bot token
> - `GUILD_ID` - Your Discord server ID
> - `FORUM_CHANNEL_ID` - Your forum channel ID
>
> **Trello Configuration**
> - `TRELLO_KEY` - Your Trello API key
> - `TRELLO_TOKEN` - Your Trello token
> - `TRELLO_BOARD_ID` - Your Trello board ID
> - `TRELLO_LIST_ID` - Your Trello list ID
>
> **Optional Polling Settings**
> - `ENABLE_TRELLO_POLLING=true`
> - `POLLING_INTERVAL_SECONDS=60`
> - `NOTIFY_LABEL_CHANGES=true`
> - `NOTIFY_CHECKLIST_CHANGES=true`
> - `NOTIFY_MEMBER_CHANGES=true`
> - `NOTIFY_DUE_DATE_CHANGES=true`
> - `NOTIFY_ATTACHMENT_CHANGES=true`
> - `NOTIFY_COMMENT_CHANGES=true`
> - `NOTIFICATION_EMOJI=🔔`
> - `MAX_LOOKBACK_HOURS=24`

**Step 3: Launch the Bot**

For production:
```bash
docker-compose up -d
```

For development (with hot reload):
```bash
docker-compose -f docker-compose.dev.yml up -d
```

**Step 4: Monitor & Manage**

View logs: `docker-compose logs -f discord-trello-bot`

Stop the bot: `docker-compose down`

---

### 💻 Option 2: Source Code Deployment

**Step 1: Get the Project**
Download or clone the project to your local machine.

**Step 2: Install Dependencies**
Run `npm install` to install all required packages including:
- discord.js (Discord API library)
- dotenv (Environment variable management)
- trello-node-api (Trello API integration)
- node-fetch (HTTP requests)
- form-data (Form data handling)

**Step 3: Configure Environment**
Copy `file.env.example` to `.env` and configure with the same values as the Docker method above.

**Step 4: Run the Bot**

**Simple Start:**
```bash
npm start
```

**Production with PM2:**
```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start index.js --name "discord-trello-bot"

# Save configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

**PM2 Management:**
- View logs: `pm2 logs discord-trello-bot`
- Restart: `pm2 restart discord-trello-bot`
- Stop: `pm2 stop discord-trello-bot`
- Remove: `pm2 delete discord-trello-bot`

---

## ⚙️ Configuration Guide

### 🤖 Discord Bot Setup

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to the **Bot** section
4. Create a bot and copy the **Bot Token**
5. Enable these **Privileged Gateway Intents**:
   - Message Content Intent
   - Server Members Intent (optional)

### 🏠 Discord Server Setup

1. Create or identify a **Forum Channel** in your Discord server
2. Note the **Guild ID** (Server ID) and **Forum Channel ID**
3. Invite the bot with these permissions:
   - Read Messages
   - Send Messages
   - Read Message History
   - Use Slash Commands
   - Manage Threads

### 📋 Trello Setup

1. Go to [Trello Developer API Keys](https://trello.com/app-key)
2. Copy your **API Key**
3. Generate a **Token** by clicking the Token link
4. Create or identify your Trello board and list
5. Get the **Board ID** and **List ID**

---

## 🔍 Getting Required IDs

### Discord IDs

**Enable Developer Mode:** User Settings → Advanced → Developer Mode

- **Guild ID:** Right-click your server → "Copy Server ID"
- **Forum Channel ID:** Right-click your forum channel → "Copy Channel ID"

### Trello IDs

**Board ID:** Found in your Trello board URL
`https://trello.com/b/BOARD_ID/board-name`

**List ID:** Use this API endpoint:
`https://api.trello.com/1/boards/YOUR_BOARD_ID/lists?key=YOUR_KEY&token=YOUR_TOKEN`

---

## 🔄 How It Works

The bot creates a seamless bridge between Discord and Trello:

1. **Thread Creation** → Automatically creates corresponding Trello card
2. **Message Sync** → Formats and adds all thread messages to card description
3. **Attachment Handling** → Syncs Discord attachments, embeds, and links to Trello
4. **Real-time Updates** → Updates cards when messages are posted or edited
5. **Trello Polling** → Monitors Trello changes and sends Discord notifications
6. **Duplicate Prevention** → Maintains mapping to avoid duplicates

### 📝 Trello Card Format

Each card includes:
- **Title:** `[Discord] Thread Name - by Username`
- **Description:** Formatted thread content with participant info
- **Attachments:** All Discord attachments, images, and shared links
- **Position:** New cards added to top of specified list

---

## 🐳 Docker Management

### Useful Commands

**Container Management:**
- View running containers: `docker ps`
- View all containers: `docker ps -a`
- View logs: `docker logs discord-trello-bot`
- Access container shell: `docker exec -it discord-trello-bot /bin/sh`

**Cleanup:**
- Remove container: `docker rm discord-trello-bot`
- Remove image: `docker rmi discord-trello-bot`
- Rebuild and restart: `docker-compose up -d --build`

### Volume Configuration

The Docker setup includes persistent log storage:
- `./logs:/app/logs` - Application logs stored on host system

---

## 🔧 Troubleshooting

### Common Issues

**🚫 Bot Not Responding**
- Verify all environment variables are set correctly
- Check bot permissions in Discord server
- Ensure forum channel ID is correct

**📋 Trello Cards Not Creating**
- Verify Trello API credentials
- Check Board ID and List ID accuracy
- Ensure Trello token has write permissions

**🐳 Docker Issues**
- Confirm Docker is running
- Verify `.env` file exists with correct values
- Check container logs: `docker-compose logs -f`

**📎 Missing Attachments**
- Verify Discord attachment URLs are accessible
- Check Trello API rate limits

### Debug Information

**Docker Deployments:**
```bash
docker-compose logs -f discord-trello-bot
```

**Source Deployments:**
```bash
npm start
# or
pm2 logs discord-trello-bot
```

---

## 📊 Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|:--------:|
| `DISCORD_TOKEN` | Discord bot token | - | ✅ |
| `GUILD_ID` | Discord server ID | - | ✅ |
| `FORUM_CHANNEL_ID` | Discord forum channel ID | - | ✅ |
| `TRELLO_KEY` | Trello API key | - | ✅ |
| `TRELLO_TOKEN` | Trello API token | - | ✅ |
| `TRELLO_BOARD_ID` | Trello board ID | - | ✅ |
| `TRELLO_LIST_ID` | Trello list ID | - | ✅ |
| `ENABLE_TRELLO_POLLING` | Enable Trello change monitoring | `true` | ❌ |
| `POLLING_INTERVAL_SECONDS` | Polling frequency in seconds | `60` | ❌ |
| `NOTIFY_LABEL_CHANGES` | Notify on label changes | `true` | ❌ |
| `NOTIFY_CHECKLIST_CHANGES` | Notify on checklist changes | `true` | ❌ |
| `NOTIFY_MEMBER_CHANGES` | Notify on member changes | `true` | ❌ |
| `NOTIFY_DUE_DATE_CHANGES` | Notify on due date changes | `true` | ❌ |
| `NOTIFY_ATTACHMENT_CHANGES` | Notify on attachment changes | `true` | ❌ |
| `NOTIFY_COMMENT_CHANGES` | Notify on comment changes | `true` | ❌ |
| `NOTIFICATION_EMOJI` | Emoji for notifications | `🔔` | ❌ |
| `MAX_LOOKBACK_HOURS` | Hours to look back for missed notifications | `24` | ❌ |

---

## 🆘 Support

If you encounter issues:

1. **Check logs** for detailed error messages
2. **Verify configuration** values are correct
3. **Ensure permissions** are properly granted
4. **Monitor API limits** for Discord and Trello

---

## 📄 License

This project is licensed under the ISC License.

---
Answer from Perplexity: pplx.ai/share
