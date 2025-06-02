const Trello = require('trello-node-api');
const fetch = require('node-fetch');

class TrelloHelper extends Trello {
    constructor(key, token) {
        super(key, token);
        // Store the key and token as instance properties
        this.apiKey = key;
        this.apiToken = token;
        console.log('DEBUG - Key being used:', key);
        console.log('DEBUG - Token being used:', token);
        console.log('DEBUG - Key length:', key ? key.length : 'undefined');
        console.log('DEBUG - Token length:', token ? token.length : 'undefined');
        this._overrideMethods();
    }

    _overrideMethods() {
        // Override card.create method to match your exact working curl command
        const originalCard = this.card;
        originalCard.create = async (cardData) => {
            try {
                console.log('Creating card with manual implementation...');
                // DEBUG: Log the exact values being sent
                console.log('DEBUG - Sending key:', this.apiKey);
                console.log('DEBUG - Sending token:', this.apiToken);

                // Use the exact same format as your working curl command
                const formData = new URLSearchParams();
                formData.append('key', this.apiKey);
                formData.append('token', this.apiToken);
                formData.append('idList', cardData.idList);
                formData.append('name', cardData.name);

                if (cardData.desc) {
                    formData.append('desc', cardData.desc);
                }

                if (cardData.pos) {
                    formData.append('pos', cardData.pos);
                }

                console.log('DEBUG - Form data:', formData.toString());

                const response = await fetch('https://api.trello.com/1/cards', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Trello API Error: ${response.status} - ${errorText}`);
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                const result = await response.json();
                console.log('Card created successfully:', result.id);
                return result;
            } catch (error) {
                console.error('Card creation failed:', error);
                throw error;
            }
        };

        // Override card.update method
        originalCard.update = async (cardId, updateData) => {
            try {
                const formData = new URLSearchParams();
                formData.append('key', this.apiKey);
                formData.append('token', this.apiToken);

                Object.keys(updateData).forEach(key => {
                    formData.append(key, updateData[key]);
                });

                const response = await fetch(`https://api.trello.com/1/cards/${cardId}`, {
                    method: 'PUT',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                console.error('Card update failed:', error);
                throw error;
            }
        };

        // Override board.searchCards method
        const originalBoard = this.board;
        originalBoard.searchCards = async (boardId) => {
            try {
                const url = `https://api.trello.com/1/boards/${boardId}/cards?key=${this.apiKey}&token=${this.apiToken}`;
                const response = await fetch(url, {
                    method: 'GET'
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                console.error('Board search failed:', error);
                return [];
            }
        };
    }

    async addAttachment(cardId, attachmentData) {
        try {
            const formData = new URLSearchParams();
            formData.append('key', this.apiKey);
            formData.append('token', this.apiToken);
            formData.append('url', attachmentData.url);
            formData.append('name', attachmentData.name);

            const response = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Trello API request failed:', error);
            throw error;
        }
    }

    async searchAttachments(cardId) {
        try {
            const response = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${this.apiKey}&token=${this.apiToken}`);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Trello API request failed:', error);
            return [];
        }
    }

    async addComment(cardId, text) {
        try {
            const formData = new URLSearchParams();
            formData.append('key', this.apiKey);
            formData.append('token', this.apiToken);
            formData.append('text', text);

            const response = await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Trello API request failed:', error);
            throw error;
        }
    }

    // Add polling methods for notifications
    async getBoardActions(boardId, since = null) {
        try {
            let url = `https://api.trello.com/1/boards/${boardId}/actions?key=${this.apiKey}&token=${this.apiToken}&limit=50`;
            if (since) {
                url += `&since=${since}`;
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to get board actions:', error);
            return [];
        }
    }

    async getCardActions(cardId, since = null) {
        try {
            let url = `https://api.trello.com/1/cards/${cardId}/actions?key=${this.apiKey}&token=${this.apiToken}&limit=50`;
            if (since) {
                url += `&since=${since}`;
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to get card actions:', error);
            return [];
        }
    }
}

module.exports = TrelloHelper;
