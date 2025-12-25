/* =====================================================================
   SHIELD MANAGEMENT - Shield Divert System
   Handles shield power distribution and energy diversion
   ===================================================================== */

const ShieldManager = {
    // Shield configuration
    BASELINE: 150,              // Default shield strength per sector
    BOOST_MULTIPLIER: 1.5,      // 150% of baseline when boosted
    REDUCE_MULTIPLIER: 0.5,     // 50% of baseline when power diverted

    // Current state
    divertMode: null,           // null | 0 (FRONT) | 1 (RIGHT) | 2 (AFT) | 3 (LEFT)
    originalSpeed: 1.0,         // Store original speed multiplier
    speedReduction: 0.5,        // Speed reduced to 50% when diverting

    // Sector names for display/voice
    sectorNames: ['FRONT', 'STARBOARD', 'AFT', 'PORT'],

    // =====================================================================
    // SHIELD DIVERT FUNCTIONS
    // =====================================================================

    /**
     * Divert shield power to a specific sector
     * @param {number} sector - 0: Front, 1: Right/Starboard, 2: Aft, 3: Left/Port
     */
    divertToSector(sector) {
        if (typeof player === 'undefined' || !player) return false;

        // Validate sector
        if (sector < 0 || sector > 3) {
            console.warn('[ShieldManager] Invalid sector:', sector);
            return false;
        }

        this.divertMode = sector;

        // Calculate new shield values
        const boosted = Math.floor(this.BASELINE * this.BOOST_MULTIPLIER);  // 225
        const reduced = Math.floor(this.BASELINE * this.REDUCE_MULTIPLIER); // 75

        // Apply to player shields
        for (let i = 0; i < 4; i++) {
            if (i === sector) {
                // Don't exceed current max, but set to boosted level
                player.shield[i] = Math.min(player.shield[i] + (boosted - this.BASELINE), boosted);
            } else {
                // Reduce other sectors
                player.shield[i] = Math.min(player.shield[i], reduced);
            }
        }

        // Reduce engine speed
        if (!this._speedReduced) {
            this.originalSpeed = player.speedMultiplier || 1.0;
            player.speedMultiplier = this.originalSpeed * this.speedReduction;
            this._speedReduced = true;
        }

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            CrewVoice.announceShieldsDiverted(sector);
        }

        // Sync to multiplayer
        this._syncToNetwork();

        console.log(`[ShieldManager] Diverted power to ${this.sectorNames[sector]} shields`);
        return true;
    },

    /**
     * Restore default shield distribution
     */
    restoreDefaults() {
        if (typeof player === 'undefined' || !player) return false;

        this.divertMode = null;

        // Restore all shields to baseline (or less if damaged)
        for (let i = 0; i < 4; i++) {
            // Only restore up to baseline, don't heal beyond that
            if (player.shield[i] > 0) {
                player.shield[i] = Math.min(player.shield[i], this.BASELINE);
            }
            // If shield was at boosted level, bring it down
            // If shield was reduced, restore it
            // This creates a balanced restoration
        }

        // For a true restoration, set to baseline if shields aren't completely down
        for (let i = 0; i < 4; i++) {
            if (player.shield[i] > 0) {
                player.shield[i] = this.BASELINE;
            }
        }

        // Restore engine speed
        if (this._speedReduced) {
            player.speedMultiplier = this.originalSpeed;
            this._speedReduced = false;
        }

        // Crew announcement
        if (typeof CrewVoice !== 'undefined') {
            CrewVoice.announceShieldsRestored();
        }

        // Sync to multiplayer
        this._syncToNetwork();

        console.log('[ShieldManager] Shield distribution restored to default');
        return true;
    },

    /**
     * Get current divert status
     */
    getDivertStatus() {
        if (this.divertMode === null) {
            return { active: false, sector: null, sectorName: null };
        }
        return {
            active: true,
            sector: this.divertMode,
            sectorName: this.sectorNames[this.divertMode]
        };
    },

    /**
     * Check if a specific sector is boosted
     */
    isSectorBoosted(sector) {
        return this.divertMode === sector;
    },

    /**
     * Get effective shield max for a sector (for UI display)
     */
    getEffectiveMax(sector) {
        if (this.divertMode === null) {
            return this.BASELINE;
        }
        if (this.divertMode === sector) {
            return Math.floor(this.BASELINE * this.BOOST_MULTIPLIER);
        }
        return Math.floor(this.BASELINE * this.REDUCE_MULTIPLIER);
    },

    // =====================================================================
    // NETWORK SYNC
    // =====================================================================

    _syncToNetwork() {
        if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.connected) {
            Network.broadcastShieldState();
        }
    },

    // =====================================================================
    // SHIELD MONITORING (Call from game loop)
    // =====================================================================

    /**
     * Check shield status and trigger warnings
     * Call this from the game update loop
     */
    checkShieldStatus() {
        if (typeof player === 'undefined' || !player) return;

        const criticalThreshold = this.BASELINE * 0.2; // 20% is critical

        for (let i = 0; i < 4; i++) {
            const shield = player.shield[i];
            const wasDown = this._shieldWasDown?.[i] || false;
            const wasCritical = this._shieldWasCritical?.[i] || false;

            // Initialize tracking arrays
            if (!this._shieldWasDown) this._shieldWasDown = [false, false, false, false];
            if (!this._shieldWasCritical) this._shieldWasCritical = [false, false, false, false];

            // Shield went down
            if (shield <= 0 && !wasDown) {
                this._shieldWasDown[i] = true;
                if (typeof CrewVoice !== 'undefined') {
                    CrewVoice.announceShieldDown(i);
                }
            } else if (shield > 0 && wasDown) {
                // Shield came back up
                this._shieldWasDown[i] = false;
            }

            // Shield is critical (and not already down)
            if (shield > 0 && shield <= criticalThreshold && !wasCritical && !wasDown) {
                this._shieldWasCritical[i] = true;
                if (typeof CrewVoice !== 'undefined') {
                    CrewVoice.announceShieldCritical();
                }
            } else if (shield > criticalThreshold) {
                this._shieldWasCritical[i] = false;
            }
        }
    },

    /**
     * Reset shield tracking (call when game restarts)
     */
    reset() {
        this.divertMode = null;
        this._speedReduced = false;
        this._shieldWasDown = [false, false, false, false];
        this._shieldWasCritical = [false, false, false, false];
    }
};

// =====================================================================
// COMMAND FUNCTIONS (For Chatty AI integration)
// =====================================================================

function divertShieldsFront() {
    return ShieldManager.divertToSector(0);
}

function divertShieldsStarboard() {
    return ShieldManager.divertToSector(1);
}

function divertShieldsAft() {
    return ShieldManager.divertToSector(2);
}

function divertShieldsPort() {
    return ShieldManager.divertToSector(3);
}

function restoreDefaultShields() {
    return ShieldManager.restoreDefaults();
}

// Aliases for natural language
const divertShieldsRight = divertShieldsStarboard;
const divertShieldsLeft = divertShieldsPort;
const divertShieldsRear = divertShieldsAft;
const divertShieldsBack = divertShieldsAft;
const divertShieldsForward = divertShieldsFront;
