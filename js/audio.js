/* =====================================================================
   AUDIO MANAGER - Sound Effects System
   Handles all game audio including weapon sounds, impacts, and alerts
   ===================================================================== */

const AudioManager = {
    // Audio context for Web Audio API
    context: null,
    masterVolume: 0.7,
    enabled: true,

    // Sound buffers cache
    sounds: {},

    // Sound definitions with fallback oscillator settings
    soundDefs: {
        laserFire: { freq: 880, type: 'sawtooth', duration: 0.15, decay: 0.1 },
        torpedoFire: { freq: 150, type: 'sine', duration: 0.4, decay: 0.3 },
        shieldHitLaser: { freq: 440, type: 'triangle', duration: 0.2, decay: 0.15 },
        shieldHitTorpedo: { freq: 220, type: 'square', duration: 0.5, decay: 0.4 },
        hullHit: { freq: 110, type: 'sawtooth', duration: 0.3, decay: 0.25, noise: true },
        explosion: { freq: 80, type: 'sawtooth', duration: 0.8, decay: 0.7, noise: true },
        hailIncoming: { freq: 660, type: 'sine', duration: 0.3, decay: 0.1, repeat: 3, gap: 0.15 },
        channelOpen: { freq: 523, type: 'sine', duration: 0.2, decay: 0.1, slide: 784 },
        channelClose: { freq: 784, type: 'sine', duration: 0.2, decay: 0.1, slide: 523 },
        shieldCritical: { freq: 440, type: 'square', duration: 0.2, decay: 0.1, repeat: 2, gap: 0.1 },
        systemOffline: { freq: 200, type: 'sawtooth', duration: 0.5, decay: 0.4, slide: 100 },
        systemOnline: { freq: 300, type: 'sine', duration: 0.3, decay: 0.2, slide: 600 }
    },

    // Initialize audio system
    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[AudioManager] Initialized with Web Audio API');

            // Resume context on user interaction (required by browsers)
            document.addEventListener('click', () => this.resumeContext(), { once: true });
            document.addEventListener('keydown', () => this.resumeContext(), { once: true });

            return true;
        } catch (e) {
            console.warn('[AudioManager] Web Audio API not supported:', e);
            this.enabled = false;
            return false;
        }
    },

    // Resume audio context (required after user gesture)
    resumeContext() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume().then(() => {
                console.log('[AudioManager] Audio context resumed');
            });
        }
    },

    // Play a sound effect
    play(soundName, volume = 1.0) {
        if (!this.enabled || !this.context) return;

        const def = this.soundDefs[soundName];
        if (!def) {
            console.warn('[AudioManager] Unknown sound:', soundName);
            return;
        }

        // Resume context if suspended
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const finalVolume = volume * this.masterVolume;

        if (def.repeat) {
            // Repeating sound (like alerts)
            for (let i = 0; i < def.repeat; i++) {
                setTimeout(() => {
                    this._playTone(def, finalVolume);
                }, i * (def.duration + def.gap) * 1000);
            }
        } else {
            this._playTone(def, finalVolume);
        }
    },

    // Internal: Play a single tone
    _playTone(def, volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Create oscillator
        const osc = ctx.createOscillator();
        osc.type = def.type;
        osc.frequency.setValueAtTime(def.freq, now);

        // Frequency slide if defined
        if (def.slide) {
            osc.frequency.linearRampToValueAtTime(def.slide, now + def.duration);
        }

        // Create gain node for volume envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + def.duration);

        // Connect nodes
        osc.connect(gain);

        // Add noise component for explosions/impacts
        if (def.noise) {
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(volume * 0.3, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + def.duration);

            // Create noise buffer
            const bufferSize = ctx.sampleRate * def.duration;
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            noise.start(now);
            noise.stop(now + def.duration);
        }

        gain.connect(ctx.destination);

        // Start and stop
        osc.start(now);
        osc.stop(now + def.duration);
    },

    // Set master volume (0-1)
    setMasterVolume(vol) {
        this.masterVolume = Math.max(0, Math.min(1, vol));
        console.log('[AudioManager] Master volume:', this.masterVolume);
    },

    // Toggle audio on/off
    toggle() {
        this.enabled = !this.enabled;
        console.log('[AudioManager] Audio', this.enabled ? 'enabled' : 'disabled');
        return this.enabled;
    },

    // Mute/unmute
    mute() {
        this.enabled = false;
    },

    unmute() {
        this.enabled = true;
    }
};

// =====================================================================
// INTEGRATION HELPERS - Call these from game code
// =====================================================================

// Weapon sounds
function playLaserSound() {
    AudioManager.play('laserFire');
}

function playTorpedoSound() {
    AudioManager.play('torpedoFire');
}

// Impact sounds
function playShieldHitLaser() {
    AudioManager.play('shieldHitLaser');
}

function playShieldHitTorpedo() {
    AudioManager.play('shieldHitTorpedo');
}

function playHullHit() {
    AudioManager.play('hullHit');
}

function playExplosion() {
    AudioManager.play('explosion');
}

// Alert sounds
function playHailSound() {
    AudioManager.play('hailIncoming');
}

function playChannelOpen() {
    AudioManager.play('channelOpen');
}

function playChannelClose() {
    AudioManager.play('channelClose');
}

function playShieldCritical() {
    AudioManager.play('shieldCritical');
}

function playSystemOffline() {
    AudioManager.play('systemOffline');
}

function playSystemOnline() {
    AudioManager.play('systemOnline');
}

// =====================================================================
// INITIALIZATION
// =====================================================================

// Initialize audio system when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AudioManager.init();
    });
} else {
    AudioManager.init();
}
