# Discord-Trello Bot

A Discord bot that automatically syncs forum channel threads with Trello cards, providing seamless integration between Discord discussions and Trello project management.

## Features

- **Automatic Thread Sync**: Creates Trello cards for new Discord forum threads
- **Real-time Updates**: Updates Trello cards when thread messages are added or modified
- **Attachment Support**: Syncs Discord attachments, embeds, and shared links to Trello cards
- **Duplicate Prevention**: Intelligent handling to avoid duplicate cards and attachments
- **Rich Formatting**: Preserves Discord markdown formatting in Trello card descriptions
- **Thread Mapping**: Maintains persistent mapping between Discord threads and Trello cards


## Prerequisites

Before setting up the bot, ensure you have:

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- A **Discord Application** and Bot Token
- A **Trello Account** with API access
- A **Discord Server** with a forum channel


## Installation

### 1. Clone or Download the Project

Download all the project files to your local machine:

- `index.js`
- `trello-helper.js`
- `package.json`
- `package-lock.json`


### 2. Install Dependencies

Navigate to the project directory and install the required packages:

```bash
npm install
```

This will install:

- `discord.js` - Discord API library
- `dotenv` - Environment variable management
- `trello-node-api` - Trello API integration
- `node-fetch` - HTTP requests
- `form-data` - Form data handling


## Configuration

### 1. Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to the "Bot" section
4. Create a bot and copy the **Bot Token**
5. Under "Privileged Gateway Intents", enable:
    - Message Content Intent
    - Server Members Intent (optional)

### 2. Discord Server Setup

1. Create or identify a **Forum Channel** in your Discord server
2. Note the **Guild ID** (Server ID) and **Forum Channel ID**
3. Invite the bot to your server with the following permissions:
    - Read Messages
    - Send Messages
    - Read Message History
    - Use Slash Commands
    - Manage Threads

### 3. Trello Setup

1. Go to [Trello Developer API Keys](https://trello.com/app-key)
2. Copy your **API Key**
3. Generate a **Token** by clicking the Token link
4. Create or identify the Trello board and list where cards will be created
5. Get the **Board ID** and **List ID**:
    - Board ID: Found in the URL when viewing your board
    - List ID: Use Trello API or browser developer tools to find the list ID

### 4. Environment Variables

Create a `.env` file in the project root directory with the following variables:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
GUILD_ID=your_discord_server_id_here
FORUM_CHANNEL_ID=your_forum_channel_id_here

# Trello Configuration
TRELLO_KEY=your_trello_api_key_here
TRELLO_TOKEN=your_trello_token_here
TRELLO_BOARD_ID=your_trello_board_id_here
TRELLO_LIST_ID=your_trello_list_id_here
```

**Important**: Never commit your `.env` file to version control. Add it to your `.gitignore` file.

## Getting IDs

### Discord IDs

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on your server → "Copy Server ID" (Guild ID)
3. Right-click on your forum channel → "Copy Channel ID" (Forum Channel ID)

### Trello IDs

**Board ID**:

- Open your Trello board in a browser
- The Board ID is in the URL: `https://trello.com/b/BOARD_ID/board-name`

**List ID**:

- Open browser developer tools (F12)
- Go to Network tab
- Refresh the Trello board page
- Look for API calls to find the list ID, or use this API endpoint:

```
https://api.trello.com/1/boards/YOUR_BOARD_ID/lists?key=YOUR_KEY&token=YOUR_TOKEN
```


## Running the Bot

### Development Mode

```bash
npm start
```


### Production Mode

For production deployment, consider using a process manager like PM2:

```bash
npm install -g pm2
pm2 start index.js --name "discord-trello-bot"
pm2 save
pm2 startup
```


## How It Works

1. **Thread Creation**: When a new thread is created in the specified forum channel, the bot automatically creates a corresponding Trello card
2. **Message Sync**: All messages in the thread are formatted and added to the Trello card description
3. **Attachment Handling**: Discord attachments, embeds, and shared links are added as Trello card attachments
4. **Real-time Updates**: When new messages are posted or existing messages are edited, the Trello card is updated accordingly
5. **Duplicate Prevention**: The bot maintains a mapping to prevent duplicate cards and attachments

## Trello Card Format

Each Trello card includes:

- **Title**: `[Discord] Thread Name - by Username`
- **Description**: Formatted thread content with participant information
- **Attachments**: All Discord attachments, images, and shared links
- **Position**: New cards are added to the top of the specified list


## Troubleshooting

### Common Issues

**Bot not responding**:

- Verify all environment variables are correctly set
- Check that the bot has proper permissions in the Discord server
- Ensure the forum channel ID is correct

**Trello cards not creating**:

- Verify Trello API credentials
- Check that the Board ID and List ID are correct
- Ensure the Trello token has write permissions

**Missing attachments**:

- Check Discord attachment URLs are accessible
- Verify Trello API limits haven't been exceeded


### Debug Mode

The bot includes extensive logging. Check the console output for detailed information about:

- Bot initialization
- Thread processing
- Trello API calls
- Error messages


## Support

If you encounter issues:

1. Check the console logs for error messages
2. Verify all configuration values are correct
3. Ensure all required permissions are granted
4. Check API rate limits for both Discord and Trello

## License

This project is licensed under the ISC License.

<div style="text-align: center">⁂</div>

[^1]: file.env

[^2]: index.js

[^3]: package.json

[^4]: package-lock.json

[^5]: trello-helper.js

