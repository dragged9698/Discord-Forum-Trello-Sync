const Trello = require('trello-node-api');
const fetch = require('node-fetch');

class TrelloHelper extends Trello {
    constructor(key, token) {
        super(key, token);
        this.apiKey = key;
        this.apiToken = token;
        console.log('DEBUG - Key being used:', key);
        console.log('DEBUG - Token being used:', token);
        console.log('DEBUG - Key length:', key ? key.length : 'undefined');
        console.log('DEBUG - Token length:', token ? token.length : 'undefined');
        this._overrideMethods();
    }

    _overrideMethods() {
        const originalCard = this.card;
        
        originalCard.create = async (cardData) => {
            return this._retryRequest(async () => {
                console.log('Creating card with manual implementation...');
                console.log('DEBUG - Sending key:', this.apiKey);
                console.log('DEBUG - Sending token:', this.apiToken);

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

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

                try {
                    const response = await fetch('https://api.trello.com/1/cards', {
                        method: 'POST',
                        body: formData,
                        signal: controller.signal,
                        headers: {
                            'Connection': 'keep-alive'
                        }
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`Trello API Error: ${response.status} - ${errorText}`);
                        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                    }

                    const result = await response.json();
                    console.log('Card created successfully:', result.id);
                    return result;
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            });
        };

        originalCard.update = async (cardId, updateData) => {
            return this._retryRequest(async () => {
                const formData = new URLSearchParams();
                formData.append('key', this.apiKey);
                formData.append('token', this.apiToken);
                
                Object.keys(updateData).forEach(key => {
                    formData.append(key, updateData[key]);
                });

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                try {
                    const response = await fetch(`https://api.trello.com/1/cards/${cardId}`, {
                        method: 'PUT',
                        body: formData,
                        signal: controller.signal,
                        headers: {
                            'Connection': 'keep-alive'
                        }
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                    }

                    return await response.json();
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            });
        };

        const originalBoard = this.board;
        originalBoard.searchCards = async (boardId) => {
            return this._retryRequest(async () => {
                const url = `https://api.trello.com/1/boards/${boardId}/cards?key=${this.apiKey}&token=${this.apiToken}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: {
                            'Connection': 'keep-alive'
                        }
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                    }

                    return await response.json();
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            }, []);
        };
    }

    async _retryRequest(requestFn, defaultReturn = null, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                const isRetriableError = error.code === 'ECONNRESET' || 
                                       error.code === 'ETIMEDOUT' || 
                                       error.name === 'AbortError' ||
                                       (error.message && error.message.includes('timeout'));

                if (isRetriableError && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`⚠️ Attempt ${attempt} failed with ${error.code || error.name}, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                console.error('Request failed after all retries:', error);
                if (defaultReturn !== null) {
                    return defaultReturn;
                }
                throw error;
            }
        }
    }

    async addAttachment(cardId, attachmentData) {
        return this._retryRequest(async () => {
            const formData = new URLSearchParams();
            formData.append('key', this.apiKey);
            formData.append('token', this.apiToken);
            formData.append('url', attachmentData.url);
            formData.append('name', attachmentData.name);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments`, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal,
                    headers: {
                        'Connection': 'keep-alive'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        });
    }

    async searchAttachments(cardId) {
        return this._retryRequest(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?key=${this.apiKey}&token=${this.apiToken}`, {
                    signal: controller.signal,
                    headers: {
                        'Connection': 'keep-alive'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        }, []);
    }

    async addComment(cardId, text) {
        return this._retryRequest(async () => {
            const formData = new URLSearchParams();
            formData.append('key', this.apiKey);
            formData.append('token', this.apiToken);
            formData.append('text', text);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments`, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal,
                    headers: {
                        'Connection': 'keep-alive'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        });
    }

    async getBoardActions(boardId, since = null) {
        return this._retryRequest(async () => {
            let url = `https://api.trello.com/1/boards/${boardId}/actions?key=${this.apiKey}&token=${this.apiToken}&limit=50`;
            if (since) {
                url += `&since=${since}`;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Connection': 'keep-alive'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        }, []);
    }

    async getCardActions(cardId, since = null) {
        return this._retryRequest(async () => {
            let url = `https://api.trello.com/1/cards/${cardId}/actions?key=${this.apiKey}&token=${this.apiToken}&limit=50`;
            if (since) {
                url += `&since=${since}`;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'Connection': 'keep-alive'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        }, []);
    }
}

module.exports = TrelloHelper;
