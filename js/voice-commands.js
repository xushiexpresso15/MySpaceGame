/* =====================================================================
   VOICE COMMANDS - Speech Recognition System
   Uses Web Speech API for voice control of the ship
   ===================================================================== */

const VoiceCommands = {
    // State
    isListening: false,
    recognition: null,

    // UI elements
    voiceButton: null,
    voiceIndicator: null,

    // Configuration
    language: 'en-US',
    continuous: true,
    interimResults: false,

    // Extended system prompt for Cohere (includes new commands)
    extendedPrompt: `You are Chatty, an AI co-pilot for a space combat game.
Your goal is to help the player control their ship using natural language voice commands.

AVAILABLE COMMANDS:

WEAPONS:
- FIRE_LASER: Fire main laser
- FIRE_TORPEDO_FWD: Fire forward torpedo
- FIRE_TORPEDO_AFT: Fire aft (rear) torpedo
- RELOAD: Reload ammo

MOVEMENT:
- TURN_LEFT: Rotate ship left 90 degrees
- TURN_RIGHT: Rotate ship right 90 degrees
- MOVE_UP: Move ship up
- MOVE_DOWN: Move ship down
- MOVE_LEFT: Move ship left
- MOVE_RIGHT: Move ship right
- STOP: Stop movement

SHIELDS:
- DIVERT_SHIELDS_FRONT: Divert power to front shields (reduces others and speed by 50%)
- DIVERT_SHIELDS_AFT: Divert power to rear shields
- DIVERT_SHIELDS_LEFT: Divert power to port (left) shields
- DIVERT_SHIELDS_RIGHT: Divert power to starboard (right) shields
- RESTORE_SHIELDS: Restore default shield distribution

COMMUNICATION:
- HAIL_ENEMY: Attempt to contact enemy vessel
- HAIL_PLAYER: Hail another player (multiplayer only)
- CLOSE_CHANNEL: End current communication

RESPONSE FORMAT:
You must ALWAYS respond with valid JSON.
{
  "message": "Brief acknowledgment of the command",
  "actions": ["COMMAND_1", "COMMAND_2"]
}

IMPORTANT:
1. The "actions" array must strictly contain only the command strings listed above.
2. Be brief and professional - this is voice interaction, keep responses short.
3. For shield commands, explain the trade-off briefly.
4. For hailing, be dramatic and space-opera like.`,

    // =====================================================================
    // INITIALIZATION
    // =====================================================================

    init() {
        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('[VoiceCommands] Speech recognition not supported');
            return false;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = this.continuous;
        this.recognition.interimResults = this.interimResults;
        this.recognition.language = this.language;

        // Bind event handlers
        this.recognition.onresult = (event) => this._onResult(event);
        this.recognition.onerror = (event) => this._onError(event);
        this.recognition.onend = () => this._onEnd();
        this.recognition.onstart = () => this._onStart();

        // Create UI
        this._createVoiceButton();

        console.log('[VoiceCommands] Initialized');
        return true;
    },

    // =====================================================================
    // CONTROL FUNCTIONS
    // =====================================================================

    start() {
        if (!this.recognition) {
            console.warn('[VoiceCommands] Not initialized');
            return false;
        }

        if (this.isListening) return true;

        try {
            this.recognition.start();
            return true;
        } catch (e) {
            console.error('[VoiceCommands] Start error:', e);
            return false;
        }
    },

    stop() {
        if (!this.recognition || !this.isListening) return;

        this.recognition.stop();
        this.isListening = false;
        this._updateUI();
    },

    toggle() {
        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    },

    // =====================================================================
    // EVENT HANDLERS
    // =====================================================================

    _onStart() {
        this.isListening = true;
        this._updateUI();
        console.log('[VoiceCommands] Listening...');

        // Play feedback sound
        if (typeof AudioManager !== 'undefined') {
            AudioManager.play('channelOpen');
        }
    },

    _onEnd() {
        // Auto-restart if still supposed to be listening
        if (this.isListening && this.continuous) {
            setTimeout(() => {
                if (this.isListening) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.log('[VoiceCommands] Restart failed');
                    }
                }
            }, 100);
        }
    },

    _onError(event) {
        console.warn('[VoiceCommands] Error:', event.error);

        if (event.error === 'not-allowed') {
            this.isListening = false;
            this._updateUI();

            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.addSystemMessage('Microphone access denied. Please allow microphone permission.');
            }
        }
    },

    _onResult(event) {
        const result = event.results[event.results.length - 1];

        if (result.isFinal) {
            const transcript = result[0].transcript.trim();
            console.log('[VoiceCommands] Heard:', transcript);

            // Process the voice command
            this._processVoiceCommand(transcript);
        }
    },

    // =====================================================================
    // COMMAND PROCESSING
    // =====================================================================

    async _processVoiceCommand(transcript) {
        // Show what was heard in chat
        if (typeof ChatSystem !== 'undefined') {
            ChatSystem.addMessage({
                sender: myPlayerName || 'You',
                text: `🎤 "${transcript}"`,
                type: 'self',
                timestamp: Date.now()
            });
        }

        // Check if Cohere API is available
        const apiKey = (typeof Chatty !== 'undefined') ? Chatty.apiKey : null;

        if (apiKey) {
            // Use Cohere for natural language processing
            await this._processWithCohere(transcript, apiKey);
        } else {
            // Fallback to basic keyword matching
            this._processWithKeywords(transcript);
        }
    },

    async _processWithCohere(transcript, apiKey) {
        try {
            const response = await fetch('https://api.cohere.com/v1/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'command-r-plus-08-2024',
                    message: transcript,
                    preamble: this.extendedPrompt,
                    temperature: 0.3,
                    max_tokens: 200
                })
            });

            if (!response.ok) {
                console.warn('[VoiceCommands] API error, using fallback');
                this._processWithKeywords(transcript);
                return;
            }

            const data = await response.json();
            const aiText = data.text || '';

            // Parse JSON response
            let parsed;
            try {
                // Extract JSON from response
                const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.warn('[VoiceCommands] Parse error');
                this._processWithKeywords(transcript);
                return;
            }

            if (parsed) {
                // Show AI response
                if (typeof ChatSystem !== 'undefined' && parsed.message) {
                    ChatSystem.addMessage({
                        sender: 'Chatty',
                        text: parsed.message,
                        type: 'chatty',
                        timestamp: Date.now()
                    });

                    // Speak the response
                    if (typeof CrewVoice !== 'undefined') {
                        CrewVoice.speak(parsed.message);
                    }
                }

                // Execute actions
                if (parsed.actions && Array.isArray(parsed.actions)) {
                    this._executeActions(parsed.actions);
                }
            }

        } catch (error) {
            console.error('[VoiceCommands] Cohere error:', error);
            this._processWithKeywords(transcript);
        }
    },

    _processWithKeywords(transcript) {
        const msg = transcript.toLowerCase();
        const actions = [];

        // Weapons
        if (msg.includes('fire') && msg.includes('laser')) actions.push('FIRE_LASER');
        if (msg.includes('fire') && (msg.includes('torpedo') || msg.includes('photon'))) {
            if (msg.includes('aft') || msg.includes('rear') || msg.includes('back')) {
                actions.push('FIRE_TORPEDO_AFT');
            } else {
                actions.push('FIRE_TORPEDO_FWD');
            }
        }
        if (msg.includes('reload')) actions.push('RELOAD');

        // Movement
        if (msg.includes('turn') && msg.includes('left')) actions.push('TURN_LEFT');
        if (msg.includes('turn') && msg.includes('right')) actions.push('TURN_RIGHT');

        // Shields
        if (msg.includes('divert') || msg.includes('transfer') || msg.includes('power to')) {
            if (msg.includes('front') || msg.includes('forward')) actions.push('DIVERT_SHIELDS_FRONT');
            else if (msg.includes('aft') || msg.includes('rear') || msg.includes('back')) actions.push('DIVERT_SHIELDS_AFT');
            else if (msg.includes('left') || msg.includes('port')) actions.push('DIVERT_SHIELDS_LEFT');
            else if (msg.includes('right') || msg.includes('starboard')) actions.push('DIVERT_SHIELDS_RIGHT');
        }
        if (msg.includes('restore') && msg.includes('shield')) actions.push('RESTORE_SHIELDS');

        // Communication
        if (msg.includes('hail')) {
            if (msg.includes('enemy')) actions.push('HAIL_ENEMY');
            else if (msg.includes('player')) actions.push('HAIL_PLAYER');
        }
        if ((msg.includes('close') || msg.includes('end')) && msg.includes('channel')) {
            actions.push('CLOSE_CHANNEL');
        }

        if (actions.length > 0) {
            this._executeActions(actions);

            // Feedback
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.addSystemMessage(`Executing: ${actions.join(', ')}`);
            }
        } else {
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.addSystemMessage('Command not recognized. Try: "fire laser", "divert shields to front", "hail enemy"');
            }
        }
    },

    _executeActions(actions) {
        for (const action of actions) {
            console.log('[VoiceCommands] Executing:', action);

            switch (action) {
                // Weapons (reuse Chatty's functions if available)
                case 'FIRE_LASER':
                    if (typeof gameFireLaser === 'function') gameFireLaser();
                    break;
                case 'FIRE_TORPEDO_FWD':
                    if (typeof gameFireTorpedoForward === 'function') gameFireTorpedoForward();
                    break;
                case 'FIRE_TORPEDO_AFT':
                    if (typeof gameFireTorpedoAft === 'function') gameFireTorpedoAft();
                    break;
                case 'RELOAD':
                    if (typeof Chatty !== 'undefined') {
                        Chatty.executeActions(['RELOAD']);
                    }
                    break;

                // Movement
                case 'TURN_LEFT':
                case 'TURN_RIGHT':
                case 'MOVE_UP':
                case 'MOVE_DOWN':
                case 'MOVE_LEFT':
                case 'MOVE_RIGHT':
                case 'STOP':
                    if (typeof Chatty !== 'undefined') {
                        Chatty.executeActions([action]);
                    }
                    break;

                // Shields
                case 'DIVERT_SHIELDS_FRONT':
                    if (typeof divertShieldsFront === 'function') divertShieldsFront();
                    break;
                case 'DIVERT_SHIELDS_AFT':
                    if (typeof divertShieldsAft === 'function') divertShieldsAft();
                    break;
                case 'DIVERT_SHIELDS_LEFT':
                    if (typeof divertShieldsPort === 'function') divertShieldsPort();
                    break;
                case 'DIVERT_SHIELDS_RIGHT':
                    if (typeof divertShieldsStarboard === 'function') divertShieldsStarboard();
                    break;
                case 'RESTORE_SHIELDS':
                    if (typeof restoreDefaultShields === 'function') restoreDefaultShields();
                    break;

                // Communication
                case 'HAIL_ENEMY':
                    if (typeof CommChannel !== 'undefined') CommChannel.HailEnemy();
                    break;
                case 'HAIL_PLAYER':
                    if (typeof CommChannel !== 'undefined') CommChannel.HailPlayer();
                    break;
                case 'CLOSE_CHANNEL':
                    if (typeof CommChannel !== 'undefined') CommChannel.CloseChannel();
                    break;

                default:
                    console.log('[VoiceCommands] Unknown action:', action);
            }
        }
    },

    // =====================================================================
    // UI
    // =====================================================================

    _createVoiceButton() {
        // Create floating voice button
        this.voiceButton = document.createElement('button');
        this.voiceButton.id = 'voiceCommandBtn';
        this.voiceButton.className = 'voice-command-btn';
        this.voiceButton.innerHTML = '🎤';
        this.voiceButton.title = 'Voice Commands (Hold to speak)';

        this.voiceButton.addEventListener('click', () => this.toggle());

        document.body.appendChild(this.voiceButton);

        // Create listening indicator
        this.voiceIndicator = document.createElement('div');
        this.voiceIndicator.id = 'voiceIndicator';
        this.voiceIndicator.className = 'voice-indicator';
        this.voiceIndicator.innerHTML = '<span class="voice-pulse"></span> Listening...';
        document.body.appendChild(this.voiceIndicator);
    },

    _updateUI() {
        if (this.voiceButton) {
            this.voiceButton.classList.toggle('active', this.isListening);
        }
        if (this.voiceIndicator) {
            this.voiceIndicator.classList.toggle('visible', this.isListening);
        }
    }
};

// =====================================================================
// INITIALIZATION
// =====================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => VoiceCommands.init(), 1000);
    });
} else {
    setTimeout(() => VoiceCommands.init(), 1000);
}
