/* =====================================================================
   COMMUNICATION CHANNEL - Inter-ship Communication System
   Handles hailing, opening channels, and message exchange
   ===================================================================== */

const CommChannel = {
    // Channel state
    isOpen: false,
    targetType: null,       // 'ENEMY' | 'PLAYER'
    targetId: null,         // Player ID for multiplayer, null for enemy
    targetName: null,       // Display name

    // Hail state
    pendingHail: null,      // { type, fromId, fromName }
    hailTimeout: null,

    // Message history for current channel
    messages: [],

    // UI elements
    overlay: null,
    messagesArea: null,
    inputField: null,

    // Game state backup
    previousGameState: null,

    // =====================================================================
    // API FUNCTIONS (As specified in requirements)
    // =====================================================================

    /**
     * Hail the enemy ship (AI controlled)
     */
    HailEnemy() {
        if (this.isOpen) {
            console.log('[CommChannel] Channel already open');
            return false;
        }

        console.log('[CommChannel] Hailing enemy vessel...');

        // Play hail sound
        if (typeof AudioManager !== 'undefined') {
            AudioManager.play('hailIncoming');
        }

        // For single player, enemy always accepts after delay
        setTimeout(() => {
            this.targetType = 'ENEMY';
            this.targetId = null;
            this.targetName = 'Vorthari Commander';
            this.OpenChannel();

            // Enemy sends initial message
            setTimeout(() => {
                if (typeof EnemyAI !== 'undefined') {
                    EnemyAI.sendGreeting();
                }
            }, 500);
        }, 1500);

        return true;
    },

    /**
     * Hail another player (multiplayer only)
     * @param {string} playerId - Target player ID (optional, hails first found player)
     */
    HailPlayer(playerId = null) {
        if (this.isOpen) {
            console.log('[CommChannel] Channel already open');
            return false;
        }

        if (typeof Network === 'undefined' || !Network.isMultiplayer || !Network.connected) {
            console.log('[CommChannel] Not in multiplayer mode');
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.addSystemMessage('Cannot hail - not in multiplayer mode.');
            }
            return false;
        }

        // Find target player
        let targetId = playerId;
        let targetName = 'Unknown Player';

        if (!targetId && typeof remotePlayers !== 'undefined') {
            // Get first remote player
            const firstPlayer = remotePlayers.entries().next().value;
            if (firstPlayer) {
                targetId = firstPlayer[0];
                targetName = firstPlayer[1].name || 'Player';
            }
        } else if (targetId && typeof remotePlayers !== 'undefined') {
            const target = remotePlayers.get(targetId);
            if (target) {
                targetName = target.name || 'Player';
            }
        }

        if (!targetId) {
            console.log('[CommChannel] No players to hail');
            return false;
        }

        console.log('[CommChannel] Hailing player:', targetName);

        // Send hail request via network
        Network.send(Network.MSG.COMM_HAIL, {
            fromId: Network.peerId,
            fromName: myPlayerName,
            toId: targetId
        });

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            CrewVoice.speak(`Hailing ${targetName}.`);
        }

        // Store pending hail
        this.pendingHail = {
            type: 'PLAYER',
            toId: targetId,
            toName: targetName,
            awaiting: true
        };

        return true;
    },

    /**
     * Open communication channel (internal, called after hail accepted)
     */
    OpenChannel() {
        if (this.isOpen) return false;

        this.isOpen = true;
        this.messages = [];

        // Pause game
        this._pauseGame();

        // Show comm UI
        this._showCommUI();

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            CrewVoice.announceChannelOpen();
        }

        // Broadcast to multiplayer if player channel
        if (this.targetType === 'PLAYER' && typeof Network !== 'undefined' && Network.connected) {
            Network.send(Network.MSG.COMM_OPEN, {
                fromId: Network.peerId,
                toId: this.targetId
            });
        }

        console.log('[CommChannel] Channel opened with:', this.targetName);
        return true;
    },

    /**
     * Send a message through the channel
     * @param {string} textString - Message to send
     */
    Send(textString) {
        if (!this.isOpen || !textString) return false;

        const message = {
            from: myPlayerName || 'You',
            text: textString,
            timestamp: Date.now(),
            isSelf: true
        };

        this.messages.push(message);
        this._addMessageToUI(message);

        if (this.targetType === 'ENEMY') {
            // Send to enemy AI
            if (typeof EnemyAI !== 'undefined') {
                EnemyAI.respond(textString).then(response => {
                    this._receiveMessage(this.targetName, response);
                });
            }
        } else if (this.targetType === 'PLAYER') {
            // Send to player via network
            if (typeof Network !== 'undefined' && Network.connected) {
                Network.send(Network.MSG.COMM_MSG, {
                    fromId: Network.peerId,
                    fromName: myPlayerName,
                    toId: this.targetId,
                    text: textString
                });
            }
        }

        return true;
    },

    /**
     * Close the communication channel
     */
    CloseChannel() {
        if (!this.isOpen) return false;

        // Resume game
        this._resumeGame();

        // Hide comm UI
        this._hideCommUI();

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            CrewVoice.announceChannelClosed();
        }

        // Notify other party if player channel
        if (this.targetType === 'PLAYER' && typeof Network !== 'undefined' && Network.connected) {
            Network.send(Network.MSG.COMM_CLOSE, {
                fromId: Network.peerId,
                toId: this.targetId
            });
        }

        // Clear state
        this.isOpen = false;
        this.targetType = null;
        this.targetId = null;
        this.targetName = null;
        this.messages = [];

        console.log('[CommChannel] Channel closed');
        return true;
    },

    // =====================================================================
    // INCOMING COMMUNICATION HANDLERS
    // =====================================================================

    /**
     * Handle incoming hail request
     */
    onHailReceived(type, fromId, fromName) {
        this.pendingHail = { type, fromId, fromName };

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            if (type === 'ENEMY') {
                CrewVoice.announceEnemyHail();
            } else {
                CrewVoice.announcePlayerHail(fromName);
            }
        }

        // Show accept/reject dialog
        this._showHailDialog(fromName);

        // Auto-timeout after 30 seconds
        this.hailTimeout = setTimeout(() => {
            this._hideHailDialog();
            this.pendingHail = null;
        }, 30000);
    },

    /**
     * Accept pending hail
     */
    acceptHail() {
        if (!this.pendingHail) return;

        clearTimeout(this.hailTimeout);
        this._hideHailDialog();

        this.targetType = this.pendingHail.type;
        this.targetId = this.pendingHail.fromId;
        this.targetName = this.pendingHail.fromName;
        this.pendingHail = null;

        this.OpenChannel();
    },

    /**
     * Reject pending hail
     */
    rejectHail() {
        if (!this.pendingHail) return;

        clearTimeout(this.hailTimeout);
        this._hideHailDialog();

        // Notify sender
        if (this.pendingHail.type === 'PLAYER' && typeof Network !== 'undefined') {
            Network.send(Network.MSG.COMM_CLOSE, {
                fromId: Network.peerId,
                toId: this.pendingHail.fromId,
                rejected: true
            });
        }

        this.pendingHail = null;
    },

    /**
     * Receive a message from the other party
     */
    _receiveMessage(senderName, text) {
        const message = {
            from: senderName,
            text: text,
            timestamp: Date.now(),
            isSelf: false
        };

        this.messages.push(message);
        this._addMessageToUI(message);

        // Speak the message with appropriate voice
        if (this.targetType === 'ENEMY' && typeof EnemyAI !== 'undefined') {
            EnemyAI.speakMessage(text);
        }
    },

    // =====================================================================
    // GAME STATE CONTROL
    // =====================================================================

    _pauseGame() {
        if (typeof gameState !== 'undefined') {
            this.previousGameState = gameState;
            gameState = 'COMM_OPEN';
        }
    },

    _resumeGame() {
        if (typeof gameState !== 'undefined' && this.previousGameState) {
            gameState = this.previousGameState;
            this.previousGameState = null;
        }
    },

    // =====================================================================
    // UI FUNCTIONS
    // =====================================================================

    _createUI() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'commOverlay';
        this.overlay.className = 'comm-overlay';
        this.overlay.innerHTML = `
            <div class="comm-window">
                <div class="comm-header">
                    <span class="comm-title">📡 COMMUNICATION CHANNEL</span>
                    <span class="comm-target" id="commTarget"></span>
                </div>
                <div class="comm-messages" id="commMessages"></div>
                <div class="comm-input-area">
                    <input type="text" class="comm-input" id="commInput" 
                           placeholder="Type your message..." maxlength="200" autocomplete="off">
                    <button class="comm-send-btn" id="commSendBtn">SEND</button>
                    <button class="comm-close-btn" id="commCloseBtn">END TRANSMISSION</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        // Bind events
        this.messagesArea = document.getElementById('commMessages');
        this.inputField = document.getElementById('commInput');

        document.getElementById('commSendBtn').addEventListener('click', () => {
            const text = this.inputField.value.trim();
            if (text) {
                this.Send(text);
                this.inputField.value = '';
            }
        });

        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = this.inputField.value.trim();
                if (text) {
                    this.Send(text);
                    this.inputField.value = '';
                }
            }
            e.stopPropagation();
        });

        document.getElementById('commCloseBtn').addEventListener('click', () => {
            this.CloseChannel();
        });
    },

    _showCommUI() {
        if (!this.overlay) this._createUI();

        this.overlay.classList.add('visible');
        document.getElementById('commTarget').textContent = this.targetName || 'Unknown';
        this.messagesArea.innerHTML = '';

        setTimeout(() => this.inputField.focus(), 100);
    },

    _hideCommUI() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
    },

    _addMessageToUI(message) {
        if (!this.messagesArea) return;

        const msgEl = document.createElement('div');
        msgEl.className = `comm-message ${message.isSelf ? 'self' : 'other'}`;
        msgEl.innerHTML = `
            <span class="comm-sender">${this._escapeHtml(message.from)}</span>
            <span class="comm-text">${this._escapeHtml(message.text)}</span>
        `;
        this.messagesArea.appendChild(msgEl);
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    },

    _showHailDialog(fromName) {
        // Create simple hail notification
        let dialog = document.getElementById('hailDialog');
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'hailDialog';
            dialog.className = 'hail-dialog';
            dialog.innerHTML = `
                <div class="hail-content">
                    <div class="hail-title">📡 INCOMING HAIL</div>
                    <div class="hail-from" id="hailFrom"></div>
                    <div class="hail-buttons">
                        <button class="hail-accept" id="hailAccept">ACCEPT</button>
                        <button class="hail-reject" id="hailReject">REJECT</button>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);

            document.getElementById('hailAccept').addEventListener('click', () => this.acceptHail());
            document.getElementById('hailReject').addEventListener('click', () => this.rejectHail());
        }

        document.getElementById('hailFrom').textContent = fromName;
        dialog.classList.add('visible');
    },

    _hideHailDialog() {
        const dialog = document.getElementById('hailDialog');
        if (dialog) {
            dialog.classList.remove('visible');
        }
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// =====================================================================
// NETWORK MESSAGE HANDLERS (Add to Network.js)
// =====================================================================

// These handlers will be registered when Network initializes
const CommNetworkHandlers = {
    handleHail(data) {
        if (data.toId === Network.peerId) {
            CommChannel.onHailReceived('PLAYER', data.fromId, data.fromName);
        }
    },

    handleOpen(data) {
        if (data.toId === Network.peerId) {
            CommChannel.targetType = 'PLAYER';
            CommChannel.targetId = data.fromId;
            CommChannel.targetName = remotePlayers.get(data.fromId)?.name || 'Player';
            CommChannel.OpenChannel();
        }
    },

    handleMessage(data) {
        if (data.toId === Network.peerId && CommChannel.isOpen) {
            CommChannel._receiveMessage(data.fromName, data.text);
        }
    },

    handleClose(data) {
        if (data.toId === Network.peerId && CommChannel.isOpen) {
            CommChannel.CloseChannel();
        }
    }
};
