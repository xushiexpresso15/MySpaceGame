/* =====================================================================
   CREW VOICE - Text-to-Speech Crew Announcements
   Uses Web Speech Synthesis API for crew status messages
   ===================================================================== */

const CrewVoice = {
    // Configuration
    enabled: true,
    volume: 1.0,
    rate: 1.1,
    pitch: 1.0,
    voice: null,

    // Message queue to prevent overlapping
    queue: [],
    isSpeaking: false,

    // Predefined crew messages
    messages: {
        // Shield warnings
        shieldsCritical: "Warning! Shields critical!",
        shieldDown: (sector) => `${sector} shields are down!`,
        shieldsRestored: "Shields restored to normal.",
        shieldsDiverted: (sector) => `Power diverted to ${sector} shields.`,

        // System status
        systemOffline: (system) => `${system} offline!`,
        systemOnline: (system) => `${system} back online.`,

        // Communication
        incomingHail: "Captain, we're being hailed.",
        enemyHail: "Enemy vessel attempting to establish contact.",
        playerHail: (name) => `${name} is hailing us, Captain.`,
        channelOpen: "Communication channel open.",
        channelClosed: "Channel closed.",

        // Combat
        enemyDestroyed: "Target destroyed!",
        torpedoesReloaded: "Torpedo bays reloaded.",
        hullCritical: "Hull integrity critical! We need to repair!",
        bossAppearing: "Massive energy signature detected. Brace for impact!",

        // Game events
        missionComplete: "Mission accomplished. Well done, Commander.",
        missionFailed: "All hands, abandon ship!"
    },

    // Initialize voice system
    init() {
        if (!('speechSynthesis' in window)) {
            console.warn('[CrewVoice] Speech synthesis not supported');
            this.enabled = false;
            return false;
        }

        // Wait for voices to load
        speechSynthesis.onvoiceschanged = () => {
            this._selectVoice();
        };

        // Try to select voice immediately (Chrome)
        this._selectVoice();

        console.log('[CrewVoice] Initialized');
        return true;
    },

    // Select a suitable voice
    _selectVoice() {
        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) return;

        // Prefer English voices with these names (sounds more "crew-like")
        const preferred = ['Google UK English Male', 'Microsoft David', 'Daniel', 'Alex'];

        for (const name of preferred) {
            const found = voices.find(v => v.name.includes(name));
            if (found) {
                this.voice = found;
                console.log('[CrewVoice] Selected voice:', found.name);
                return;
            }
        }

        // Fallback to first English voice
        const english = voices.find(v => v.lang.startsWith('en'));
        if (english) {
            this.voice = english;
            console.log('[CrewVoice] Selected fallback voice:', english.name);
        }
    },

    // Speak a message
    speak(message, priority = 'normal') {
        if (!this.enabled || !message) return;

        // High priority messages interrupt
        if (priority === 'high') {
            speechSynthesis.cancel();
            this.queue = [];
            this._speak(message);
        } else {
            // Add to queue
            this.queue.push(message);
            this._processQueue();
        }
    },

    // Process message queue
    _processQueue() {
        if (this.isSpeaking || this.queue.length === 0) return;

        const message = this.queue.shift();
        this._speak(message);
    },

    // Internal speak function
    _speak(message) {
        this.isSpeaking = true;

        const utterance = new SpeechSynthesisUtterance(message);
        utterance.volume = this.volume;
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;

        if (this.voice) {
            utterance.voice = this.voice;
        }

        utterance.onend = () => {
            this.isSpeaking = false;
            // Small delay before next message
            setTimeout(() => this._processQueue(), 300);
        };

        utterance.onerror = (e) => {
            console.warn('[CrewVoice] Speech error:', e);
            this.isSpeaking = false;
            this._processQueue();
        };

        speechSynthesis.speak(utterance);
    },

    // =====================================================================
    // CONVENIENCE METHODS - Call these from game code
    // =====================================================================

    // Shield announcements
    announceShieldCritical() {
        AudioManager.play('shieldCritical');
        this.speak(this.messages.shieldsCritical, 'high');
    },

    announceShieldDown(sector) {
        const sectorNames = ['Forward', 'Starboard', 'Aft', 'Port'];
        const name = sectorNames[sector] || 'Unknown';
        this.speak(this.messages.shieldDown(name));
    },

    announceShieldsRestored() {
        this.speak(this.messages.shieldsRestored);
    },

    announceShieldsDiverted(sector) {
        const sectorNames = ['forward', 'starboard', 'aft', 'port'];
        const name = sectorNames[sector] || 'unknown';
        this.speak(this.messages.shieldsDiverted(name));
    },

    // System announcements
    announceSystemOffline(system) {
        AudioManager.play('systemOffline');
        this.speak(this.messages.systemOffline(system));
    },

    announceSystemOnline(system) {
        AudioManager.play('systemOnline');
        this.speak(this.messages.systemOnline(system));
    },

    // Communication announcements
    announceIncomingHail() {
        AudioManager.play('hailIncoming');
        this.speak(this.messages.incomingHail);
    },

    announceEnemyHail() {
        AudioManager.play('hailIncoming');
        this.speak(this.messages.enemyHail);
    },

    announcePlayerHail(playerName) {
        AudioManager.play('hailIncoming');
        this.speak(this.messages.playerHail(playerName));
    },

    announceChannelOpen() {
        AudioManager.play('channelOpen');
        this.speak(this.messages.channelOpen);
    },

    announceChannelClosed() {
        AudioManager.play('channelClose');
        this.speak(this.messages.channelClosed);
    },

    // Combat announcements
    announceEnemyDestroyed() {
        this.speak(this.messages.enemyDestroyed);
    },

    announceTorpedoesReloaded() {
        this.speak(this.messages.torpedoesReloaded);
    },

    announceHullCritical() {
        this.speak(this.messages.hullCritical, 'high');
    },

    announceBossAppearing() {
        this.speak(this.messages.bossAppearing, 'high');
    },

    // Game event announcements
    announceMissionComplete() {
        this.speak(this.messages.missionComplete);
    },

    announceMissionFailed() {
        this.speak(this.messages.missionFailed, 'high');
    },

    // Toggle voice on/off
    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            speechSynthesis.cancel();
            this.queue = [];
        }
        console.log('[CrewVoice]', this.enabled ? 'Enabled' : 'Disabled');
        return this.enabled;
    },

    // Set volume (0-1)
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
};

// =====================================================================
// INITIALIZATION
// =====================================================================

// Initialize crew voice when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CrewVoice.init();
    });
} else {
    CrewVoice.init();
}
