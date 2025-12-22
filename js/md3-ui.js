/* =====================================================================
   MD3 UI - Game Overlay Controller
   Handles spectator mode, game over, and HUD updates
   ===================================================================== */

// =====================================================================
// MD3 CONTROLLER OBJECT
// =====================================================================

const MD3 = {
    // Overlays
    spectatorOverlay: null,
    gameOverOverlay: null,

    // Buttons
    btnRestart: null,
    btnReload: null,

    // HUD Elements
    hud: null,
    hudTorpFwd: null,
    hudTorpAft: null,
    hudHull: null,

    // Game Over Elements
    waitMsg: null,
    scoreEnemies: null,
    scoreTime: null,

    // State
    enemiesDestroyed: 0,
    gameStartTime: 0,

    // =====================================================================
    // INITIALIZATION
    // =====================================================================

    init() {
        this.deathBanner = document.getElementById('md3-death-banner');
        this.deathStatus = document.getElementById('md3-death-status');
        this.gameOverOverlay = document.getElementById('md3-gameover');
        this.btnRestart = document.getElementById('md3-btn-restart');
        this.btnReload = document.getElementById('md3-btn-reload');
        this.btnLeave = document.getElementById('md3-btn-leave');
        this.hud = document.getElementById('md3-hud');
        this.hudTorpFwd = document.getElementById('md3-torpFwd');
        this.hudTorpAft = document.getElementById('md3-torpAft');
        this.hudHull = document.getElementById('md3-hullDisplay');
        this.waitMsg = document.getElementById('md3-wait-msg');
        this.scoreEnemies = document.getElementById('md3-score-enemies');
        this.scoreTime = document.getElementById('md3-score-time');

        // Timer
        this.timer = document.getElementById('md3-timer');
        this.timerValue = document.getElementById('md3-timer-value');

        this.setupEventListeners();
        this.gameStartTime = Date.now();

        console.log('[MD3-UI] Initialized');
    },

    // =====================================================================
    // EVENT LISTENERS
    // =====================================================================

    setupEventListeners() {
        // Restart Button
        if (this.btnRestart) {
            this.btnRestart.addEventListener('click', (e) => {
                this.createRipple(e, this.btnRestart);
                setTimeout(() => {
                    this.handleRestart();
                }, 300);
            });
        }

        // Reload Button
        if (this.btnReload) {
            this.btnReload.addEventListener('click', (e) => {
                this.createRipple(e, this.btnReload);
                setTimeout(() => {
                    this.handleReload();
                }, 150);
            });
        }

        // Leave Room Button
        if (this.btnLeave) {
            this.btnLeave.addEventListener('click', (e) => {
                this.handleLeaveRoom();
            });
        }
    },

    // =====================================================================
    // UI STATE FUNCTIONS
    // =====================================================================

    /**
     * Show Death Banner (bottom of screen)
     * Called when player dies but others are alive - non-blocking for spectating
     */
    showDeathBanner() {
        // Show death banner
        if (this.deathBanner) {
            this.deathBanner.classList.remove('md3-hidden');
        }

        // Update status text
        if (this.deathStatus) {
            this.deathStatus.textContent = 'Waiting for revival... (Defeat a boss to revive)';
        }

        // Fade HUD slightly but keep visible for spectating
        if (this.hud) {
            this.hud.style.opacity = '0.5';
        }
    },

    /**
     * Hide Death Banner (on revival or game end)
     */
    hideDeathBanner() {
        if (this.deathBanner) {
            this.deathBanner.classList.add('md3-hidden');
        }

        // Restore HUD opacity
        if (this.hud) {
            this.hud.style.opacity = '1';
        }
    },

    /**
     * Show Spectator Mode (legacy - redirects to showDeathBanner)
     */
    showSpectator() {
        this.showDeathBanner();

        // Hide controls
        const controls = document.getElementById('md3-controls');
        if (controls) controls.classList.add('md3-hidden');
    },

    /**
     * Show Game Over Screen
     * Called when all players are dead
     */
    showGameOver(isHost, score) {
        // Hide HUD
        if (this.hud) this.hud.classList.add('md3-hidden');

        // Hide spectator
        if (this.spectatorOverlay) this.spectatorOverlay.classList.add('md3-hidden');

        // Hide controls
        const controls = document.getElementById('md3-controls');
        if (controls) controls.classList.add('md3-hidden');

        // Hide PVP winner (in case it was shown)
        const pvpWinner = document.getElementById('md3-pvp-winner');
        if (pvpWinner) pvpWinner.classList.add('md3-hidden');

        // Update stats
        if (this.scoreEnemies) {
            this.scoreEnemies.textContent = score || this.enemiesDestroyed;
        }
        if (this.scoreTime) {
            const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            this.scoreTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Show/hide restart button based on host status
        if (isHost) {
            if (this.btnRestart) this.btnRestart.classList.remove('md3-hidden');
            if (this.waitMsg) this.waitMsg.classList.add('md3-hidden');
        } else {
            if (this.btnRestart) this.btnRestart.classList.add('md3-hidden');
            if (this.waitMsg) this.waitMsg.classList.remove('md3-hidden');
        }

        // Show game over overlay
        if (this.gameOverOverlay) this.gameOverOverlay.classList.remove('md3-hidden');
    },

    /**
     * Show PVP Victory Screen
     * Called when one player wins in PVP + No Enemy Spawn mode
     */
    showPVPVictory(winnerName, isHost) {
        console.log('[MD3] showPVPVictory called:', winnerName, 'isHost:', isHost);

        // Hide HUD
        if (this.hud) this.hud.classList.add('md3-hidden');

        // Hide death banner
        if (this.deathBanner) this.deathBanner.classList.add('md3-hidden');

        // Hide spectator overlay (important for losers who are spectating)
        if (this.spectatorOverlay) this.spectatorOverlay.classList.add('md3-hidden');

        // Hide timer
        if (this.timer) this.timer.classList.add('md3-hidden');

        // Hide controls
        const controls = document.getElementById('md3-controls');
        if (controls) controls.classList.add('md3-hidden');

        // Show winner announcement
        const pvpWinner = document.getElementById('md3-pvp-winner');
        const winnerNameEl = document.getElementById('md3-winner-name');
        if (pvpWinner && winnerNameEl) {
            winnerNameEl.textContent = winnerName;
            pvpWinner.classList.remove('md3-hidden');
        }

        // Update stats
        if (this.scoreTime) {
            const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            this.scoreTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Hide enemies counter in PVP (not relevant)
        const enemiesRow = document.getElementById('md3-enemies-row');
        if (enemiesRow) enemiesRow.classList.add('md3-hidden');

        // Show/hide restart button
        if (isHost) {
            if (this.btnRestart) this.btnRestart.classList.remove('md3-hidden');
            if (this.waitMsg) this.waitMsg.classList.add('md3-hidden');
        } else {
            if (this.btnRestart) this.btnRestart.classList.add('md3-hidden');
            if (this.waitMsg) this.waitMsg.classList.remove('md3-hidden');
        }

        // Show game over overlay
        if (this.gameOverOverlay) this.gameOverOverlay.classList.remove('md3-hidden');
    },

    /**
     * Update Timer Display
     */
    updateTimer(seconds) {
        if (!this.timerValue) return;
        // Format time as MM:SS
        let m = Math.floor(seconds / 60).toString().padStart(2, '0');
        let s = Math.floor(seconds % 60).toString().padStart(2, '0');
        this.timerValue.textContent = `${m}:${s}`;
    },

    /**
     * Reset UI to playing state
     */
    resetUI() {
        // Hide overlays
        if (this.deathBanner) this.deathBanner.classList.add('md3-hidden');
        if (this.gameOverOverlay) this.gameOverOverlay.classList.add('md3-hidden');

        // Hide PVP winner and show enemies row (reset from PVP mode)
        const pvpWinner = document.getElementById('md3-pvp-winner');
        if (pvpWinner) pvpWinner.classList.add('md3-hidden');
        const enemiesRow = document.getElementById('md3-enemies-row');
        if (enemiesRow) enemiesRow.classList.remove('md3-hidden');

        // Show HUD and reset opacity
        if (this.hud) {
            this.hud.classList.remove('md3-hidden');
            this.hud.classList.remove('fading');
            this.hud.style.opacity = '1';
        }

        // Show Timer
        if (this.timer) {
            this.timer.classList.remove('md3-hidden');
        }

        // Show controls
        const controls = document.getElementById('md3-controls');
        if (controls) controls.classList.remove('md3-hidden');

        // Hide reload button
        if (this.btnReload) this.btnReload.classList.add('md3-hidden');

        // Reset state
        this.enemiesDestroyed = 0;
        this.gameStartTime = Date.now();
    },

    // =====================================================================
    // ACTION HANDLERS
    // =====================================================================

    handleRestart() {
        // In multiplayer: return everyone to lobby
        // In single player: go back to menu

        if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.isHost) {
            // Multiplayer: Host broadcasts return to lobby
            Network.broadcastReturnToLobby();
            return; // handleReturnToLobby handles the rest
        }

        // Single player: Go back to menu
        this.resetUI();

        // Reset game state
        if (typeof gameOver !== 'undefined') {
            gameOver = false;
        }
        if (typeof player !== 'undefined' && player) {
            player.dead = false;
        }

        // Transition to menu
        if (typeof MenuManager !== 'undefined') {
            MenuManager.transitionTo('MENU');
        }

        // Set game state to menu
        if (typeof gameState !== 'undefined') {
            gameState = 'MENU';
        }
    },

    /**
     * Leave the multiplayer room and return to main menu
     */
    handleLeaveRoom() {
        // Disconnect from network
        if (typeof Network !== 'undefined' && Network.isMultiplayer) {
            Network.connections.forEach((slot, id) => {
                if (slot.dc) slot.dc.close();
                if (slot.pc) slot.pc.close();
            });
            Network.connections.clear();
            Network.connected = false;
            Network.isMultiplayer = false;
            Network.isHost = false;
        }

        // Reset UI
        this.resetUI();

        // Reset game state
        if (typeof gameOver !== 'undefined') gameOver = false;
        if (typeof player !== 'undefined' && player) player.dead = false;

        // Hide party HUD
        const partyHud = document.getElementById('md3-party-hud');
        if (partyHud) partyHud.classList.add('md3-hidden');

        // Hide chat
        if (typeof ChatSystem !== 'undefined') {
            ChatSystem.hide();
        }

        // Transition to main menu
        if (typeof MenuManager !== 'undefined') {
            MenuManager.transitionTo('MENU');
        }
        if (typeof gameState !== 'undefined') {
            gameState = 'MENU';
        }
    },

    handleReload() {
        // Reload torpedoes
        if (typeof torpFwd !== 'undefined') {
            torpFwd = 12;
            torpAft = 5;

            // Update legacy displays
            if (typeof torpFwdDisplay !== 'undefined') torpFwdDisplay.innerText = torpFwd;
            if (typeof torpAftDisplay !== 'undefined') torpAftDisplay.innerText = torpAft;

            // Update MD3 displays
            if (this.hudTorpFwd) this.hudTorpFwd.textContent = torpFwd;
            if (this.hudTorpAft) this.hudTorpAft.textContent = torpAft;

            canReload = false;
            reloadTimer = 0;
        }

        // Hide reload button
        if (this.btnReload) this.btnReload.classList.add('md3-hidden');
    },

    // =====================================================================
    // RIPPLE EFFECT
    // =====================================================================

    createRipple(event, button) {
        if (!button) return;

        // Remove existing ripples
        const existing = button.querySelector('.md3-ripple');
        if (existing) existing.remove();

        // Create ripple element
        const ripple = document.createElement('span');
        ripple.classList.add('md3-ripple');

        // Calculate size and position
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

        button.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 600);
    },

    // =====================================================================
    // HUD UPDATE FUNCTIONS
    // =====================================================================

    updateHUD(torpFwdVal, torpAftVal, hullPercent) {
        if (this.hudTorpFwd) this.hudTorpFwd.textContent = torpFwdVal;
        if (this.hudTorpAft) this.hudTorpAft.textContent = torpAftVal;
        if (this.hudHull) this.hudHull.textContent = hullPercent + '%';
    },

    showReloadButton() {
        if (this.btnReload) this.btnReload.classList.remove('md3-hidden');
    },

    /**
     * Increment enemy kill counter and update HUD
     */
    incrementScore() {
        this.enemiesDestroyed++;

        // Update HUD kill counter if it exists
        const killsDisplay = document.getElementById('md3-kills');
        if (killsDisplay) {
            killsDisplay.textContent = this.enemiesDestroyed;
        }
    },

    /**
     * Get current kill count
     */
    getKills() {
        return this.enemiesDestroyed;
    }
};

// =====================================================================
// GLOBAL ALIASES FOR COMPATIBILITY
// =====================================================================

function checkGameOver(isHost = true, score = 0) {
    MD3.showGameOver(isHost, score);
}

function showSpectatorMode() {
    MD3.showSpectator();
}

function showGameOverScreen(isHost, score) {
    MD3.showGameOver(isHost, score);
}

function resetGameUI() {
    MD3.resetUI();
}

function showReloadButton() {
    MD3.showReloadButton();
}

// =====================================================================
// INITIALIZATION
// =====================================================================

// Use a cleaner initialization pattern to avoid double-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MD3.init());
} else {
    // DOM already loaded
    MD3.init();
}
