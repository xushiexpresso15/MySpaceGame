/* =====================================================================
   CHAT SYSTEM - Multiplayer Chat with Chatty AI
   Handles player communication and AI-powered ship control
   ===================================================================== */

const ChatSystem = {
    // State
    isOpen: true,
    messages: [],
    unreadCount: 0,

    // DOM Elements
    container: null,
    messagesArea: null,
    input: null,
    sendBtn: null,
    header: null,
    unreadBadge: null,
    settingsOverlay: null,

    // =====================================================================
    // INITIALIZATION
    // =====================================================================

    init() {
        this.createChatUI();
        this.bindEvents();
        this.loadApiKey();
        console.log('[ChatSystem] Initialized');
    },

    createChatUI() {
        // Create chat container
        this.container = document.createElement('div');
        this.container.className = 'md3-chat-container md3-hidden';
        this.container.innerHTML = `
            <!-- Chat Header -->
            <div class="md3-chat-header">
                <div class="md3-chat-title">
                    <span class="md3-chat-title-icon">💬</span>
                    <span>SQUADRON CHAT</span>
                    <span class="md3-chat-unread md3-hidden" id="chat-unread">0</span>
                </div>
                <div class="md3-chat-header-actions">
                    <button class="md3-chat-settings-btn" id="chat-settings-btn" title="Chatty Settings">⚙️</button>
                    <span class="md3-chat-toggle">▼</span>
                </div>
            </div>
            
            <!-- Messages Area -->
            <div class="md3-chat-messages" id="chat-messages">
                <div class="md3-chat-message system">
                    <div class="md3-chat-bubble">
                        Type "chatty [command]" to control your ship with AI
                    </div>
                </div>
            </div>
            
            <!-- Input Area -->
            <div class="md3-chat-input-area">
                <input type="text" class="md3-chat-input" id="chat-input" 
                       placeholder="Type a message..." maxlength="200" autocomplete="off">
                <button class="md3-chat-send-btn" id="chat-send-btn">➤</button>
            </div>
        `;

        document.body.appendChild(this.container);

        // Cache DOM references
        this.header = this.container.querySelector('.md3-chat-header');
        this.messagesArea = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');
        this.unreadBadge = document.getElementById('chat-unread');

        // Create settings overlay
        this.createSettingsDialog();
    },

    createSettingsDialog() {
        this.settingsOverlay = document.createElement('div');
        this.settingsOverlay.className = 'md3-chat-settings-overlay';
        this.settingsOverlay.innerHTML = `
            <div class="md3-chat-settings-dialog">
                <h2 class="md3-chat-settings-title">
                    <span>🤖</span> Chatty AI Settings
                </h2>
                <p class="md3-chat-settings-subtitle">
                    Configure Chatty, your AI co-pilot that can control your ship using natural language commands.
                </p>
                
                <div class="md3-chat-settings-field">
                    <label class="md3-chat-settings-label">Cohere API Key</label>
                    <input type="password" class="md3-chat-settings-input" id="chatty-api-key" 
                           placeholder="Enter your Cohere API key...">
                    <p class="md3-chat-settings-hint">
                        Get your API key from <a href="https://dashboard.cohere.com/api-keys" target="_blank">Cohere Dashboard</a>
                    </p>
                </div>
                
                <div class="md3-chat-settings-actions">
                    <button class="md3-chat-settings-btn-cancel" id="chatty-settings-cancel">Cancel</button>
                    <button class="md3-chat-settings-btn-save" id="chatty-settings-save">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.settingsOverlay);
    },

    bindEvents() {
        // Header click to toggle
        this.header.addEventListener('click', (e) => {
            // Don't toggle if clicking settings button
            if (e.target.closest('.md3-chat-settings-btn')) return;
            this.toggle();
        });

        // Send button
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Input enter key
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
            // Prevent game controls while typing
            e.stopPropagation();
        });

        // Prevent keyup from triggering game controls
        this.input.addEventListener('keyup', (e) => e.stopPropagation());

        // Settings button
        document.getElementById('chat-settings-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSettings();
        });

        // Settings dialog events
        document.getElementById('chatty-settings-cancel').addEventListener('click', () => {
            this.closeSettings();
        });

        document.getElementById('chatty-settings-save').addEventListener('click', () => {
            this.saveApiKey();
        });

        // Close settings on overlay click
        this.settingsOverlay.addEventListener('click', (e) => {
            if (e.target === this.settingsOverlay) {
                this.closeSettings();
            }
        });

        // Escape key to close settings
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.settingsOverlay.classList.contains('visible')) {
                this.closeSettings();
            }
        });
    },

    // =====================================================================
    // VISIBILITY CONTROL
    // =====================================================================

    show() {
        this.container.classList.remove('md3-hidden');
    },

    hide() {
        this.container.classList.add('md3-hidden');
    },

    toggle() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.container.classList.remove('collapsed');
            this.clearUnread();
            // Focus input after animation
            setTimeout(() => this.input.focus(), 300);
        } else {
            this.container.classList.add('collapsed');
        }
    },

    // =====================================================================
    // MESSAGING
    // =====================================================================

    sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // Clear input
        this.input.value = '';

        // Check if it's a Chatty command
        if (text.toLowerCase().startsWith('chatty ')) {
            const command = text.substring(7).trim();
            this.handleChattyCommand(command, text);
        } else {
            // Regular chat message
            this.addMessage({
                sender: myPlayerName || 'You',
                text: text,
                type: 'self',
                timestamp: Date.now()
            });

            // Broadcast to other players
            if (Network.isMultiplayer && Network.connected) {
                Network.broadcastChat(text);
            }
        }
    },

    receiveMessage(senderId, senderName, text) {
        this.addMessage({
            sender: senderName || 'Unknown',
            text: text,
            type: 'other',
            timestamp: Date.now()
        });

        // Update unread count if collapsed
        if (!this.isOpen || this.container.classList.contains('collapsed')) {
            this.incrementUnread();
        }
    },

    addMessage(msg) {
        this.messages.push(msg);

        // Keep only last 50 messages
        if (this.messages.length > 50) {
            this.messages.shift();
        }

        // Create message element
        const msgEl = document.createElement('div');
        msgEl.className = `md3-chat-message ${msg.type}`;

        if (msg.type !== 'system') {
            msgEl.innerHTML = `
                <span class="md3-chat-sender">${this.escapeHtml(msg.sender)}</span>
                <div class="md3-chat-bubble">${this.escapeHtml(msg.text)}</div>
            `;
        } else {
            msgEl.innerHTML = `<div class="md3-chat-bubble">${this.escapeHtml(msg.text)}</div>`;
        }

        this.messagesArea.appendChild(msgEl);

        // Auto-scroll to bottom
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    },

    addSystemMessage(text) {
        this.addMessage({
            sender: 'System',
            text: text,
            type: 'system',
            timestamp: Date.now()
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // =====================================================================
    // UNREAD COUNTER
    // =====================================================================

    incrementUnread() {
        this.unreadCount++;
        this.unreadBadge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        this.unreadBadge.classList.remove('md3-hidden');
    },

    clearUnread() {
        this.unreadCount = 0;
        this.unreadBadge.classList.add('md3-hidden');
    },

    // =====================================================================
    // CHATTY AI INTEGRATION
    // =====================================================================

    async handleChattyCommand(command, originalText) {
        // Show the command in chat
        this.addMessage({
            sender: myPlayerName || 'You',
            text: originalText,
            type: 'self',
            timestamp: Date.now()
        });

        // Check if API key is configured
        if (!Chatty.apiKey) {
            this.addMessage({
                sender: 'Chatty',
                text: '請先在設定中輸入 Cohere API Key 才能使用 Chatty 功能！',
                type: 'chatty',
                timestamp: Date.now()
            });
            this.openSettings();
            return;
        }

        // Show typing indicator
        this.showTypingIndicator();

        try {
            const response = await Chatty.processCommand(command);
            this.hideTypingIndicator();

            // Show Chatty's response
            this.addMessage({
                sender: 'Chatty',
                text: response.message,
                type: 'chatty',
                timestamp: Date.now()
            });

            // Execute actions if any
            if (response.actions && response.actions.length > 0) {
                Chatty.executeActions(response.actions);
            }
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessage({
                sender: 'Chatty',
                text: `抱歉，發生錯誤：${error.message}`,
                type: 'chatty',
                timestamp: Date.now()
            });
        }
    },

    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'md3-chat-typing';
        indicator.id = 'chatty-typing';
        indicator.innerHTML = `
            <span>Chatty is thinking</span>
            <div class="md3-chat-typing-dots">
                <span class="md3-chat-typing-dot"></span>
                <span class="md3-chat-typing-dot"></span>
                <span class="md3-chat-typing-dot"></span>
            </div>
        `;
        this.messagesArea.appendChild(indicator);
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    },

    hideTypingIndicator() {
        const indicator = document.getElementById('chatty-typing');
        if (indicator) indicator.remove();
    },

    // =====================================================================
    // SETTINGS
    // =====================================================================

    openSettings() {
        // Load current API key (masked)
        const input = document.getElementById('chatty-api-key');
        if (Chatty.apiKey) {
            input.value = Chatty.apiKey;
        }
        this.settingsOverlay.classList.add('visible');
    },

    closeSettings() {
        this.settingsOverlay.classList.remove('visible');
    },

    saveApiKey() {
        const input = document.getElementById('chatty-api-key');
        const apiKey = input.value.trim();

        if (apiKey) {
            Chatty.setApiKey(apiKey);
            this.addSystemMessage('Chatty API Key 已儲存！現在可以使用 "chatty [指令]" 控制飛船。');
        }

        this.closeSettings();
    },

    loadApiKey() {
        // Try to load from localStorage
        const savedKey = localStorage.getItem('chatty_api_key');
        if (savedKey) {
            Chatty.apiKey = savedKey;
            console.log('[ChatSystem] Loaded saved API key');
        }
    }
};

// =====================================================================
// CHATTY AI - Cohere API Integration
// =====================================================================

const Chatty = {
    apiKey: null,
    apiEndpoint: 'https://api.cohere.ai/v1/chat',

    // System prompt defining Chatty's role and available commands
    systemPrompt: `你是 Chatty，一個太空戰鬥遊戲的 AI 副駕駛。玩家可以透過自然語言指令控制飛船。

你可以執行以下動作（使用 JSON 格式回應）：
- FIRE_LASER: 發射雷射光束
- FIRE_TORPEDO_FWD: 發射前向魚雷
- FIRE_TORPEDO_AFT: 發射後向魚雷 (向後發射)
- RELOAD: 重新裝填彈藥
- MOVE_UP: 向上移動
- MOVE_DOWN: 向下移動
- MOVE_LEFT: 向左移動
- MOVE_RIGHT: 向右移動

回應格式範例：
{
  "message": "收到！正在發射雷射！",
  "actions": ["FIRE_LASER"]
}

如果玩家只是聊天而不是下達指令，就正常回應不需要 actions：
{
  "message": "你好！我是 Chatty，有什麼我可以幫忙的嗎？"
}

注意：
1. 回應要簡短有趣，符合太空戰鬥的氛圍
2. 如果不確定玩家的意圖，可以詢問
3. 一次可以執行多個動作，例如 ["FIRE_LASER", "FIRE_TORPEDO_FWD"]`,

    setApiKey(key) {
        this.apiKey = key;
        // Save to localStorage
        localStorage.setItem('chatty_api_key', key);
        console.log('[Chatty] API key saved');
    },

    async processCommand(userMessage) {
        if (!this.apiKey) {
            throw new Error('API Key 未設定');
        }

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'command-r-plus',
                    message: userMessage,
                    preamble: this.systemPrompt,
                    temperature: 0.7,
                    max_tokens: 200
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API 錯誤: ${response.status}`);
            }

            const data = await response.json();
            const aiText = data.text || '';

            // Try to parse as JSON
            try {
                // Look for JSON in the response
                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return {
                        message: parsed.message || aiText,
                        actions: parsed.actions || []
                    };
                }
            } catch (parseError) {
                // Not JSON, return as plain text
            }

            return {
                message: aiText,
                actions: []
            };

        } catch (error) {
            console.error('[Chatty] API Error:', error);
            throw error;
        }
    },

    executeActions(actions) {
        if (!Array.isArray(actions)) return;

        for (const action of actions) {
            console.log('[Chatty] Executing action:', action);

            switch (action) {
                case 'FIRE_LASER':
                    if (typeof gameFireLaser === 'function') {
                        gameFireLaser();
                    }
                    break;

                case 'FIRE_TORPEDO_FWD':
                    if (typeof gameFireTorpedoForward === 'function') {
                        gameFireTorpedoForward();
                    }
                    break;

                case 'FIRE_TORPEDO_AFT':
                    if (typeof gameFireTorpedoAft === 'function') {
                        gameFireTorpedoAft();
                    }
                    break;

                case 'RELOAD':
                    // Trigger reload if available
                    if (typeof canReload !== 'undefined' && canReload) {
                        torpFwd = 12;
                        torpAft = 5;
                        if (typeof torpFwdDisplay !== 'undefined') torpFwdDisplay.innerText = torpFwd;
                        if (typeof torpAftDisplay !== 'undefined') torpAftDisplay.innerText = torpAft;
                        canReload = false;
                        reloadTimer = 0;
                        console.log('[Chatty] Ammo reloaded');
                    }
                    break;

                case 'MOVE_UP':
                    this.movePlayer(0, -50);
                    break;

                case 'MOVE_DOWN':
                    this.movePlayer(0, 50);
                    break;

                case 'MOVE_LEFT':
                    this.movePlayer(-50, 0);
                    break;

                case 'MOVE_RIGHT':
                    this.movePlayer(50, 0);
                    break;

                default:
                    console.log('[Chatty] Unknown action:', action);
            }
        }
    },

    movePlayer(dx, dy) {
        if (typeof player === 'undefined' || !player || player.dead) return;

        // Apply movement with bounds checking
        player.x = Math.max(player.r, Math.min(gameWidth - player.r, player.x + dx));
        player.y = Math.max(player.r, Math.min(gameHeight - player.r, player.y + dy));

        // Sync position in multiplayer
        if (Network.isMultiplayer && Network.connected) {
            Network.sendClientShipMove();
        }
    }
};

// =====================================================================
// NETWORK INTEGRATION
// =====================================================================

// Add chat broadcast method to Network
if (typeof Network !== 'undefined') {
    Network.MSG.CHAT_MESSAGE = 'CTM';

    Network.broadcastChat = function (text) {
        const data = {
            sender: myPlayerName || 'Unknown',
            text: text,
            timestamp: Date.now()
        };

        if (this.isHost) {
            // Host broadcasts to all clients
            this.broadcast(this.MSG.CHAT_MESSAGE, data);
        } else {
            // Client sends to host
            this.sendTo('host', this.MSG.CHAT_MESSAGE, data);
        }
    };

    // Extend handleMessage to process chat messages
    const originalHandleMessage = Network.handleMessage.bind(Network);
    Network.handleMessage = function (senderId, msg) {
        if (msg.msg === this.MSG.CHAT_MESSAGE) {
            const data = msg.data;

            // If host, relay to other clients
            if (this.isHost) {
                this.broadcast(this.MSG.CHAT_MESSAGE, data, senderId);
            }

            // Display the message
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.receiveMessage(senderId, data.sender, data.text);
            }
            return;
        }

        // Call original handler for other messages
        originalHandleMessage(senderId, msg);
    };
}

// =====================================================================
// INITIALIZATION
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize after a short delay to ensure other systems are ready
    setTimeout(() => {
        ChatSystem.init();
    }, 500);
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    setTimeout(() => {
        if (!ChatSystem.container) {
            ChatSystem.init();
        }
    }, 500);
}

// =====================================================================
// GAME STATE HOOKS
// =====================================================================

// Show chat when multiplayer game starts
function showChatForMultiplayer() {
    if (typeof ChatSystem !== 'undefined' && Network.isMultiplayer) {
        ChatSystem.show();
    }
}

// Hide chat when leaving multiplayer
function hideChatForSinglePlayer() {
    if (typeof ChatSystem !== 'undefined' && !Network.isMultiplayer) {
        ChatSystem.hide();
    }
}
