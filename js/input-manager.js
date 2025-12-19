/* =====================================================================
   INPUT MANAGER - Mouse-First Control System
   Replaces keyboard gameplay controls with on-screen FAB buttons
   ===================================================================== */

const InputManager = {
    // =====================================================================
    // STATE
    // =====================================================================
    isActive: false,

    // Button references
    btnLaser: null,
    btnTorpedoFwd: null,
    btnTorpedoAft: null,
    btnReload: null,

    // Cooldown tracking
    laserCooldownTimer: null,

    // =====================================================================
    // INITIALIZATION
    // =====================================================================

    init() {
        // Get button references
        this.btnLaser = document.getElementById('btn-laser');
        this.btnTorpedoFwd = document.getElementById('btn-torpedo-fwd');
        this.btnTorpedoAft = document.getElementById('btn-torpedo-aft');
        this.btnReload = document.getElementById('md3-btn-reload');

        // Bind events
        this.bindGameplayControls();

        console.log('[InputManager] Initialized - Mouse-first controls active');
    },

    // =====================================================================
    // CONTROL BINDING
    // =====================================================================

    bindGameplayControls() {
        // ----- LASER BUTTON -----
        if (this.btnLaser) {
            this.btnLaser.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.createRipple(e, this.btnLaser);
                this.fireLaser();
            });

            // Prevent context menu on long press (mobile)
            this.btnLaser.addEventListener('contextmenu', e => e.preventDefault());
        }

        // ----- TORPEDO FORWARD BUTTON -----
        if (this.btnTorpedoFwd) {
            this.btnTorpedoFwd.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.createRipple(e, this.btnTorpedoFwd);
                this.fireTorpedoForward();
            });

            this.btnTorpedoFwd.addEventListener('contextmenu', e => e.preventDefault());
        }

        // ----- TORPEDO AFT BUTTON -----
        if (this.btnTorpedoAft) {
            this.btnTorpedoAft.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.createRipple(e, this.btnTorpedoAft);
                this.fireTorpedoAft();
            });

            this.btnTorpedoAft.addEventListener('contextmenu', e => e.preventDefault());
        }

        // ----- RELOAD BUTTON -----
        if (this.btnReload) {
            this.btnReload.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.createRipple(e, this.btnReload);
                this.handleReload();
            });
        }
    },

    // =====================================================================
    // ACTION FUNCTIONS
    // =====================================================================

    /**
     * Fire laser weapon
     * Maps to existing game logic for Space key
     */
    fireLaser() {
        // Check game state and player alive
        if (typeof gameState === 'undefined' || gameState !== 'PLAYING') return;
        if (typeof player === 'undefined' || !player || player.dead) return;

        // Check cooldown conditions
        if (typeof laserReady !== 'undefined' && laserReady &&
            typeof laserBurst !== 'undefined' && laserBurst <= 0 &&
            typeof player.laserOffline !== 'undefined' && player.laserOffline <= 0) {

            // Trigger laser
            laserBurst = 0.5;
            laserReady = false;
            laserCooldown = 10;

            // Network sync
            if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.connected) {
                Network.fireWeapon('LASER', player.x, player.y, player.angle);
            }

            // Visual feedback
            this.triggerButtonCooldown(this.btnLaser, 10000); // 10 second cooldown
            this.triggerScreenFlash();

            console.log('[InputManager] Laser fired');
        }
    },

    /**
     * Fire torpedo forward
     * Maps to existing game logic for Shift key
     */
    fireTorpedoForward() {
        // Check game state and player alive
        if (typeof gameState === 'undefined' || gameState !== 'PLAYING') return;
        if (typeof player === 'undefined' || !player || player.dead) return;

        // Check ammo and offline status
        if (typeof torpFwd !== 'undefined' && torpFwd > 0 &&
            typeof player.torpFwdOffline !== 'undefined' && player.torpFwdOffline <= 0) {

            // Calculate angle (with accuracy penalty if system damaged)
            let angle = player.angle;
            if (typeof player.torpFwdTargetBad !== 'undefined' && player.torpFwdTargetBad > 0) {
                angle += (Math.random() * 40 - 20) * Math.PI / 180;
            }

            // Create torpedo
            if (typeof Torpedo !== 'undefined' && typeof torps !== 'undefined') {
                torps.push(new Torpedo(player.x, player.y, angle, true));
            }

            // Update ammo count
            torpFwd--;
            if (typeof torpFwdDisplay !== 'undefined') torpFwdDisplay.innerText = torpFwd;

            // Update MD3 HUD
            const md3TorpFwd = document.getElementById('md3-torpFwd');
            if (md3TorpFwd) md3TorpFwd.textContent = torpFwd;

            // Network sync
            if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.connected) {
                Network.fireWeapon('TORPEDO', player.x, player.y, angle);
            }

            // Visual feedback
            this.pulseButton(this.btnTorpedoFwd);

            console.log('[InputManager] Torpedo FWD fired, remaining:', torpFwd);
        }
    },

    /**
     * Fire torpedo aft (rear)
     * Maps to existing game logic for Ctrl key
     */
    fireTorpedoAft() {
        // Check game state and player alive
        if (typeof gameState === 'undefined' || gameState !== 'PLAYING') return;
        if (typeof player === 'undefined' || !player || player.dead) return;

        // Check ammo and offline status
        if (typeof torpAft !== 'undefined' && torpAft > 0 &&
            typeof player.torpAftOffline !== 'undefined' && player.torpAftOffline <= 0) {

            // Calculate angle (opposite direction + accuracy penalty)
            let angle = player.angle + Math.PI;
            if (typeof player.torpAftTargetBad !== 'undefined' && player.torpAftTargetBad > 0) {
                angle += (Math.random() * 40 - 20) * Math.PI / 180;
            }

            // Create torpedo
            if (typeof Torpedo !== 'undefined' && typeof torps !== 'undefined') {
                torps.push(new Torpedo(player.x, player.y, angle, false));
            }

            // Update ammo count
            torpAft--;
            if (typeof torpAftDisplay !== 'undefined') torpAftDisplay.innerText = torpAft;

            // Update MD3 HUD
            const md3TorpAft = document.getElementById('md3-torpAft');
            if (md3TorpAft) md3TorpAft.textContent = torpAft;

            // Network sync
            if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.connected) {
                Network.fireWeapon('TORPEDO', player.x, player.y, angle);
            }

            // Visual feedback
            this.pulseButton(this.btnTorpedoAft);

            console.log('[InputManager] Torpedo AFT fired, remaining:', torpAft);
        }
    },

    /**
     * Handle reload action
     */
    handleReload() {
        if (typeof canReload === 'undefined' || !canReload) return;

        // Reload ammo
        if (typeof torpFwd !== 'undefined') {
            torpFwd = 12;
            torpAft = 5;

            // Update legacy displays
            if (typeof torpFwdDisplay !== 'undefined') torpFwdDisplay.innerText = torpFwd;
            if (typeof torpAftDisplay !== 'undefined') torpAftDisplay.innerText = torpAft;

            // Update MD3 displays
            const md3TorpFwd = document.getElementById('md3-torpFwd');
            const md3TorpAft = document.getElementById('md3-torpAft');
            if (md3TorpFwd) md3TorpFwd.textContent = torpFwd;
            if (md3TorpAft) md3TorpAft.textContent = torpAft;

            canReload = false;
            reloadTimer = 0;
        }

        // Hide reload button
        if (this.btnReload) {
            this.btnReload.classList.add('md3-hidden');
        }

        console.log('[InputManager] Ammo reloaded');
    },

    // =====================================================================
    // VISUAL FEEDBACK
    // =====================================================================

    /**
     * Create ripple effect on button
     */
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
        const size = Math.max(rect.width, rect.height) * 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

        button.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 600);
    },

    /**
     * Show cooldown progress on button
     */
    triggerButtonCooldown(button, durationMs) {
        if (!button) return;

        // Add/get cooldown bar
        let cooldownBar = button.querySelector('.md3-fab-cooldown');
        if (!cooldownBar) {
            cooldownBar = document.createElement('div');
            cooldownBar.className = 'md3-fab-cooldown';
            cooldownBar.innerHTML = '<div class="md3-fab-cooldown-fill"></div>';
            button.appendChild(cooldownBar);
        }

        const fill = cooldownBar.querySelector('.md3-fab-cooldown-fill');
        if (!fill) return;

        // Disable button
        button.disabled = true;

        // Animate fill
        fill.style.width = '0%';

        const startTime = performance.now();
        const updateProgress = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min((elapsed / durationMs) * 100, 100);
            fill.style.width = `${progress}%`;

            if (progress < 100) {
                requestAnimationFrame(updateProgress);
            } else {
                button.disabled = false;
                fill.style.width = '0%';
            }
        };

        requestAnimationFrame(updateProgress);
    },

    /**
     * Pulse animation on button
     */
    pulseButton(button) {
        if (!button) return;

        button.style.transform = 'scale(1.15)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);
    },

    /**
     * Trigger screen flash effect
     */
    triggerScreenFlash() {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.classList.add('md3-screen-flash');
            setTimeout(() => {
                canvas.classList.remove('md3-screen-flash');
            }, 200);
        }
    },

    /**
     * Trigger screen shake effect (for damage)
     */
    triggerScreenShake() {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.classList.add('md3-screen-shake');
            setTimeout(() => {
                canvas.classList.remove('md3-screen-shake');
            }, 300);
        }
    },

    /**
     * Show damage vignette
     */
    showDamageVignette() {
        let vignette = document.getElementById('md3-damage-vignette');
        if (!vignette) {
            vignette = document.createElement('div');
            vignette.id = 'md3-damage-vignette';
            vignette.className = 'md3-damage-vignette';
            document.body.appendChild(vignette);
        }

        vignette.classList.add('active');
        setTimeout(() => {
            vignette.classList.remove('active');
        }, 300);
    },

    // =====================================================================
    // CONTROLS VISIBILITY
    // =====================================================================

    /**
     * Show gameplay controls
     */
    showControls() {
        const controls = document.getElementById('md3-controls');
        if (controls) {
            controls.classList.remove('md3-hidden');
        }
        this.isActive = true;
    },

    /**
     * Hide gameplay controls
     */
    hideControls() {
        const controls = document.getElementById('md3-controls');
        if (controls) {
            controls.classList.add('md3-hidden');
        }
        this.isActive = false;
    },

    // =====================================================================
    // HUD UPDATES
    // =====================================================================

    /**
     * Sync HUD display with game state
     */
    updateHUD() {
        // Update torpedo counts
        const md3TorpFwd = document.getElementById('md3-torpFwd');
        const md3TorpAft = document.getElementById('md3-torpAft');
        const md3Hull = document.getElementById('md3-hullDisplay');

        if (md3TorpFwd && typeof torpFwd !== 'undefined') {
            md3TorpFwd.textContent = torpFwd;
        }

        if (md3TorpAft && typeof torpAft !== 'undefined') {
            md3TorpAft.textContent = torpAft;
        }

        if (md3Hull && typeof player !== 'undefined' && player) {
            const percent = Math.round((player.hull / player.maxHull) * 100);
            md3Hull.textContent = percent + '%';
        }
    }
};

// =====================================================================
// MENU MANAGER - DOM-Based Menu System
// =====================================================================

const MenuManager = {
    // Current state
    currentMenu: null,

    // Menu elements
    nameInputOverlay: null,
    mainMenuOverlay: null,
    bossSelectOverlay: null,
    mpMenuOverlay: null,
    hostLobbyOverlay: null,
    joinLobbyOverlay: null,

    /**
     * Initialize menu system
     */
    init() {
        this.createMenuElements();
        this.bindMenuEvents();
        console.log('[MenuManager] Initialized - DOM-based menus active');
    },

    /**
     * Create all menu DOM elements
     */
    createMenuElements() {
        // ----- NAME INPUT OVERLAY -----
        this.nameInputOverlay = document.createElement('div');
        this.nameInputOverlay.id = 'md3-name-input';
        this.nameInputOverlay.className = 'md3-name-input-overlay md3-hidden';
        this.nameInputOverlay.innerHTML = `
            <div class="md3-name-card">
                <h1 class="md3-name-title">IDENTIFICATION</h1>
                <p class="md3-name-subtitle">Enter your callsign</p>
                <input type="text" 
                       id="md3-callsign-input" 
                       class="md3-name-input" 
                       placeholder="Commander"
                       maxlength="12"
                       autocomplete="off"
                       spellcheck="false">
                <button id="md3-name-confirm" class="md3-name-confirm-btn">CONFIRM</button>
            </div>
        `;
        document.body.appendChild(this.nameInputOverlay);

        // ----- MAIN MENU OVERLAY -----
        this.mainMenuOverlay = document.createElement('div');
        this.mainMenuOverlay.id = 'md3-main-menu';
        this.mainMenuOverlay.className = 'md3-menu-overlay md3-hidden';
        this.mainMenuOverlay.innerHTML = `
            <h1 class="md3-menu-title">SPACE SHOOTER</h1>
            <p class="md3-menu-subtitle">Select Game Mode</p>
            <div class="md3-menu-options">
                <button class="md3-menu-btn" data-mode="normal">
                    🎮 NORMAL MODE
                </button>
                <button class="md3-menu-btn" data-mode="boss">
                    👾 BOSS BATTLE
                </button>
                <button class="md3-menu-btn" data-mode="mp">
                    🌐 MULTIPLAYER
                </button>
            </div>
            <p class="md3-menu-hint">Click to select</p>
        `;
        document.body.appendChild(this.mainMenuOverlay);

        // ----- BOSS SELECT OVERLAY -----
        this.bossSelectOverlay = document.createElement('div');
        this.bossSelectOverlay.id = 'md3-boss-select';
        this.bossSelectOverlay.className = 'md3-menu-overlay md3-hidden';
        this.bossSelectOverlay.innerHTML = `
            <h1 class="md3-menu-title" style="color: #ff8800; text-shadow: 0 0 40px rgba(255,136,0,0.7);">SELECT BOSS</h1>
            <div class="md3-menu-options">
                <button class="md3-menu-btn" data-boss="GALAXY">
                    🔥 GALAXY DESTROYER
                    <small style="display:block; font-size:12px; opacity:0.6; margin-top:4px;">Aggressive attacker with lasers and bombs</small>
                </button>
                <button class="md3-menu-btn" data-boss="CRYSTAL">
                    💎 LIQUID CRYSTAL
                    <small style="display:block; font-size:12px; opacity:0.6; margin-top:4px;">Crystal boss with shields and dash attacks</small>
                </button>
                <button class="md3-menu-btn" data-boss="VOID">
                    💀 VOID REAPER
                    <small style="display:block; font-size:12px; opacity:0.6; margin-top:4px;">[HARD] 4-phase boss with gravity pull</small>
                </button>
            </div>
            <button class="md3-menu-btn" id="md3-boss-back" style="margin-top:24px; width:auto; padding:12px 32px; background: rgba(255,255,255,0.05);">
                ← Back to Menu
            </button>
        `;
        document.body.appendChild(this.bossSelectOverlay);

        // ----- MULTIPLAYER MENU OVERLAY -----
        this.mpMenuOverlay = document.createElement('div');
        this.mpMenuOverlay.id = 'md3-mp-menu';
        this.mpMenuOverlay.className = 'md3-menu-overlay md3-hidden';
        this.mpMenuOverlay.innerHTML = `
            <h1 class="md3-menu-title" style="color: #00bfff; text-shadow: 0 0 40px rgba(0,191,255,0.7);">MULTIPLAYER</h1>
            <div class="md3-menu-options">
                <button class="md3-menu-btn" data-mp="host">
                    🏠 HOST GAME
                    <small style="display:block; font-size:12px; opacity:0.6; margin-top:4px;">Create a party and invite others</small>
                </button>
                <button class="md3-menu-btn" data-mp="join">
                    🚀 JOIN GAME
                    <small style="display:block; font-size:12px; opacity:0.6; margin-top:4px;">Join an existing party via code</small>
                </button>
            </div>
            <button class="md3-menu-btn" id="md3-mp-back" style="margin-top:24px; width:auto; padding:12px 32px; background: rgba(255,255,255,0.05);">
                ← Back to Menu
            </button>
        `;
        document.body.appendChild(this.mpMenuOverlay);

        // ----- HOST LOBBY OVERLAY -----
        this.hostLobbyOverlay = document.createElement('div');
        this.hostLobbyOverlay.id = 'md3-host-lobby';
        this.hostLobbyOverlay.className = 'md3-menu-overlay md3-hidden';
        this.hostLobbyOverlay.innerHTML = `
            <h1 class="md3-menu-title" style="color: #00ff88; text-shadow: 0 0 40px rgba(0,255,136,0.7); font-size: clamp(28px, 5vw, 48px);">PARTY LOBBY</h1>
            
            <div style="display: flex; gap: 24px; max-width: 900px; width: 90%; flex-wrap: wrap; justify-content: center;">
                
                <!-- LEFT PANEL: Players -->
                <div class="md3-card" style="flex: 1; min-width: 280px; max-width: 400px; padding: 24px;">
                    <h3 style="color: #00ff88; margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;">
                        👥 Squadron Members
                    </h3>
                    <div id="md3-party-list" style="min-height: 120px; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px;">
                        <!-- Populated dynamically -->
                    </div>
                    <div style="margin-top: 16px; text-align: center; color: rgba(255,255,255,0.5); font-size: 13px;">
                        <span id="md3-player-count">1</span> / 4 Players
                    </div>
                </div>
                
                <!-- RIGHT PANEL: Invite & Settings -->
                <div class="md3-card" style="flex: 1; min-width: 280px; max-width: 400px; padding: 24px;">
                    <h3 style="color: #00bfff; margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;">
                        🔗 Invite Link
                    </h3>
                    
                    <!-- Room ID -->
                    <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
                        <div style="color: rgba(255,255,255,0.6); font-size: 11px; margin-bottom: 4px;">ROOM ID</div>
                        <code id="md3-room-id" style="color: #ffcc00; font-size: 24px; font-weight: bold; letter-spacing: 4px;">------</code>
                    </div>
                    
                    <!-- Join URL -->
                    <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,191,255,0.3);">
                        <div style="color: rgba(255,255,255,0.6); font-size: 11px; margin-bottom: 4px;">SHARE THIS URL</div>
                        <code id="md3-room-url" style="color: #00bfff; font-size: 12px; word-break: break-all;">Generating...</code>
                    </div>
                    <p id="md3-ip-hint" style="color: rgba(100,255,150,0.8); font-size: 11px; margin: 8px 0 0 0;">✅ IP auto-detected, ready to share</p>
                    
                    <button id="md3-copy-url" class="md3-filled-button" style="width: 100%; margin-top: 12px; height: 40px; font-size: 13px;">
                        📋 Copy Invite Link
                    </button>
                    
                    <button id="md3-settings-btn" class="md3-filled-button" style="width: 100%; margin-top: 12px; background: linear-gradient(135deg, #607d8b 0%, #455a64 100%); height: 40px; font-size: 13px;">
                        ⚙️ Game Settings
                    </button>
                </div>
            </div>
            
            <!-- Bottom Buttons -->
            <div style="margin-top: 24px; display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
                <button id="md3-start-game" class="md3-filled-button" style="min-width: 200px; height: 56px; font-size: 18px; background: linear-gradient(135deg, #00e676 0%, #00c853 100%);">
                    🚀 LAUNCH MISSION
                </button>
                <button id="md3-host-back" class="md3-menu-btn" style="min-width: 120px; background: rgba(255,255,255,0.05); padding: 16px 24px;">
                    ← Cancel
                </button>
            </div>
        `;
        document.body.appendChild(this.hostLobbyOverlay);

        // ----- SETTINGS MODAL -----
        this.settingsModal = document.createElement('div');
        this.settingsModal.id = 'md3-settings-modal';
        this.settingsModal.className = 'md3-modal-overlay md3-hidden';
        this.settingsModal.innerHTML = `
            <div class="md3-modal-content" style="max-width: 400px; padding: 24px;">
                <h2 style="color: white; margin: 0 0 20px 0; text-align: center;">⚙️ Game Settings</h2>
                
                <!-- PVP Toggle -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: rgba(255,100,100,0.1); border-radius: 10px; border: 1px solid rgba(255,100,100,0.3); margin-bottom: 12px;">
                    <div>
                        <span style="color: #ff6b6b; font-size: 14px; font-weight: 600;">⚔️ PVP Mode</span>
                        <p style="color: rgba(255,255,255,0.5); font-size: 11px; margin: 2px 0 0 0;">Players can damage each other</p>
                    </div>
                    <label class="md3-switch">
                        <input type="checkbox" id="md3-pvp-toggle">
                        <span class="md3-switch-slider"></span>
                    </label>
                </div>
                
                <!-- Enemy Spawn Toggle -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px; background: rgba(100,200,255,0.1); border-radius: 10px; border: 1px solid rgba(100,200,255,0.3); margin-bottom: 20px;">
                    <div>
                        <span style="color: #64c8ff; font-size: 14px; font-weight: 600;">👾 Enemy Spawn</span>
                        <p style="color: rgba(255,255,255,0.5); font-size: 11px; margin: 2px 0 0 0;">OFF = peaceful mode (no enemies/boss)</p>
                    </div>
                    <label class="md3-switch">
                        <input type="checkbox" id="md3-enemy-spawn-toggle" checked>
                        <span class="md3-switch-slider" style="--switch-on-color: #64c8ff;"></span>
                    </label>
                </div>
                
                <button id="md3-settings-close" class="md3-filled-button" style="width: 100%;">✓ Done</button>
            </div>
        `;
        document.body.appendChild(this.settingsModal);

        // ----- JOIN LOBBY OVERLAY -----
        this.joinLobbyOverlay = document.createElement('div');
        this.joinLobbyOverlay.id = 'md3-join-lobby';
        this.joinLobbyOverlay.className = 'md3-menu-overlay md3-hidden';
        this.joinLobbyOverlay.innerHTML = `
            <h1 class="md3-menu-title" style="color: #00bfff; text-shadow: 0 0 40px rgba(0,191,255,0.7); font-size: clamp(28px, 5vw, 48px);">JOIN SQUADRON</h1>
            <div class="md3-card" style="max-width: 500px; padding: 32px;">
                <div id="md3-join-connecting" style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px; animation: md3-pulse 1.5s ease-in-out infinite;">🔗</div>
                    <p style="color: #00bfff; font-size: 20px; margin: 0 0 8px 0;">Connecting to Host...</p>
                    <p style="color: rgba(255,255,255,0.5); font-size: 14px;" id="md3-join-room-id">Room: ---</p>
                </div>
                
                <div id="md3-join-connected" class="md3-hidden" style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                    <p style="color: #00ff88; font-size: 24px; margin: 0 0 12px 0;">CONNECTED!</p>
                    <p style="color: rgba(255,255,255,0.6); font-size: 16px;">Waiting for host to start mission...</p>
                </div>
                
                <div id="md3-join-error" class="md3-hidden" style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                    <p style="color: #ff6b6b; font-size: 20px; margin: 0 0 12px 0;">Connection Failed</p>
                    <p style="color: rgba(255,255,255,0.6); font-size: 14px;" id="md3-join-error-msg">Room not found or host offline</p>
                </div>
                
                <button id="md3-join-back" class="md3-menu-btn" style="margin-top: 24px; background: rgba(255,255,255,0.05); padding: 12px;">
                    ← Back to Menu
                </button>
            </div>
        `;
        document.body.appendChild(this.joinLobbyOverlay);
    },

    /**
     * Bind all menu button events
     */
    bindMenuEvents() {
        // ----- NAME INPUT -----
        const confirmNameBtn = document.getElementById('md3-name-confirm');
        const nameInput = document.getElementById('md3-callsign-input');

        if (confirmNameBtn && nameInput) {
            confirmNameBtn.addEventListener('click', () => {
                const name = nameInput.value.trim();
                if (name.length > 0) {
                    if (typeof myPlayerName !== 'undefined') {
                        myPlayerName = name;
                    }
                    // Check if URL has room parameter - if so, auto-join instead of going to menu
                    if (!this.checkAndJoinFromURL()) {
                        this.transitionTo('MENU');
                    }
                }
            });

            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    confirmNameBtn.click();
                }
            });
        }

        // ----- MAIN MENU -----
        this.mainMenuOverlay.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode === 'normal') {
                    this.hideAll();
                    if (typeof startNormalMode === 'function') startNormalMode();
                    InputManager.showControls();
                } else if (mode === 'boss') {
                    this.transitionTo('BOSS_SELECT');
                } else if (mode === 'mp') {
                    this.transitionTo('MP_MENU');
                }
            });
        });

        // ----- BOSS SELECT -----
        this.bossSelectOverlay.querySelectorAll('[data-boss]').forEach(btn => {
            btn.addEventListener('click', () => {
                const bossType = btn.dataset.boss;
                this.hideAll();
                if (typeof startBossBattle === 'function') startBossBattle(bossType);
                InputManager.showControls();
            });
        });

        document.getElementById('md3-boss-back')?.addEventListener('click', () => {
            this.transitionTo('MENU');
        });

        // ----- MULTIPLAYER MENU -----
        this.mpMenuOverlay.querySelectorAll('[data-mp]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.mp;
                if (action === 'host') {
                    this.transitionTo('HOST_LOBBY');
                    // Start hosting with PeerJS
                    if (typeof Network !== 'undefined') {
                        (async () => {
                            try {
                                // Detect local IP first (tries /ip endpoint, then WebRTC)
                                await Network.detectLocalIP();
                                console.log('[MenuManager] IP detection result:', Network.detectedIP || 'FAILED');

                                // If still no IP, try one more time
                                if (!Network.detectedIP) {
                                    console.log('[MenuManager] Retrying IP detection...');
                                    await Network.detectLocalIP();
                                }

                                // Start host
                                await Network.startHost();

                                // Show room ID (large, prominent)
                                const roomIdEl = document.getElementById('md3-room-id');
                                if (roomIdEl) roomIdEl.textContent = Network.getRoomId();

                                // Show room URL with detected IP
                                const roomUrl = Network.getRoomURL();
                                document.getElementById('md3-room-url').textContent = roomUrl;

                                // Update hint based on whether IP was detected
                                const hintEl = document.getElementById('md3-ip-hint');
                                if (hintEl) {
                                    if (Network.detectedIP) {
                                        hintEl.textContent = '✅ IP auto-detected, ready to share';
                                        hintEl.style.color = 'rgba(100,255,150,0.8)';
                                    } else {
                                        hintEl.textContent = '💡 Replace [Detecting...] with your IP (run ipconfig)';
                                        hintEl.style.color = 'rgba(255,180,100,0.8)';
                                    }
                                }

                                console.log('[MenuManager] Room URL:', roomUrl, 'IP:', Network.detectedIP || 'not detected');
                            } catch (err) {
                                console.error('[MenuManager] Error:', err);
                                this.showToast('Failed to create room: ' + err.message);
                            }
                        })();
                    }
                } else if (action === 'join') {
                    // Only go to manual join if not from URL
                    this.showToast('Use a room link from the host to join');
                    this.transitionTo('MENU');
                }
            });
        });

        document.getElementById('md3-mp-back')?.addEventListener('click', () => {
            this.transitionTo('MENU');
        });

        // ----- HOST LOBBY -----
        document.getElementById('md3-copy-url')?.addEventListener('click', () => {
            if (typeof Network !== 'undefined' && Network.roomId) {
                const url = Network.getRoomURL();
                navigator.clipboard.writeText(url).then(() => {
                    this.showToast('Room link copied!');
                });
            }
        });

        // ----- SETTINGS MODAL -----
        document.getElementById('md3-settings-btn')?.addEventListener('click', () => {
            const modal = document.getElementById('md3-settings-modal');
            if (modal) modal.classList.remove('md3-hidden');
        });

        document.getElementById('md3-settings-close')?.addEventListener('click', () => {
            const modal = document.getElementById('md3-settings-modal');
            if (modal) modal.classList.add('md3-hidden');
        });

        // ----- PVP TOGGLE -----
        document.getElementById('md3-pvp-toggle')?.addEventListener('change', (e) => {
            if (typeof pvpEnabled !== 'undefined') {
                pvpEnabled = e.target.checked;
            }
        });

        // ----- ENEMY SPAWN TOGGLE -----
        document.getElementById('md3-enemy-spawn-toggle')?.addEventListener('change', (e) => {
            if (typeof enemySpawnEnabled !== 'undefined') {
                enemySpawnEnabled = e.target.checked;
            }
        });

        document.getElementById('md3-start-game')?.addEventListener('click', () => {
            // Allow starting even without connections for testing, but require at least host is ready
            if (typeof Network !== 'undefined' && Network.isHost) {
                this.hideAll();

                // Reset game state for fresh start
                if (typeof gameOver !== 'undefined') gameOver = false;
                if (typeof player !== 'undefined' && player) {
                    player.dead = false;
                    player.hull = player.maxHull || 100;
                }

                // Reset ALL remote players to alive state
                for (let [id, rp] of remotePlayers) {
                    rp.dead = false;
                    rp.hull = rp.maxHull || 100;
                }

                // Send settings with game start
                Network.send(Network.MSG.GAME_START, {
                    pvpEnabled: pvpEnabled || false,
                    enemySpawnEnabled: enemySpawnEnabled !== false
                });
                if (typeof startMultiplayerGame === 'function') startMultiplayerGame();
                InputManager.showControls();
            } else {
                this.showToast('Waiting for players to connect...');
            }
        });

        document.getElementById('md3-host-back')?.addEventListener('click', () => {
            if (typeof Network !== 'undefined') Network.disconnect();
            this.transitionTo('MP_MENU');
        });

        // ----- JOIN LOBBY -----
        document.getElementById('md3-join-back')?.addEventListener('click', () => {
            if (typeof Network !== 'undefined') Network.disconnect();
            // Clear URL params when going back
            window.history.replaceState({}, document.title, location.pathname);
            this.transitionTo('MENU');
        });
    },

    /**
     * Auto-join room from URL parameter
     * Call this after name input is confirmed
     */
    checkAndJoinFromURL() {
        if (typeof Network === 'undefined') return false;

        const { hasRoom, roomId } = Network.checkURLForRoom();
        if (!hasRoom || !roomId) return false;

        console.log('[MenuManager] Found room in URL:', roomId);

        // Transition to join lobby
        this.transitionTo('JOIN_LOBBY');

        // Show room ID
        const roomIdEl = document.getElementById('md3-join-room-id');
        if (roomIdEl) roomIdEl.textContent = `Room: ${roomId}`;

        // Attempt to join
        Network.joinRoom(roomId).then(() => {
            console.log('[MenuManager] Successfully joined room');
            // Show connected state
            document.getElementById('md3-join-connecting')?.classList.add('md3-hidden');
            document.getElementById('md3-join-connected')?.classList.remove('md3-hidden');
            document.getElementById('md3-join-error')?.classList.add('md3-hidden');
        }).catch(err => {
            console.error('[MenuManager] Failed to join room:', err);
            // Show error state
            document.getElementById('md3-join-connecting')?.classList.add('md3-hidden');
            document.getElementById('md3-join-connected')?.classList.add('md3-hidden');
            document.getElementById('md3-join-error')?.classList.remove('md3-hidden');
            const errMsg = document.getElementById('md3-join-error-msg');
            if (errMsg) errMsg.textContent = err.message || 'Room not found or host offline';
        });

        return true;
    },

    /**
     * Transition between menu states with animation
     */
    transitionTo(state) {
        // Hide current with exit animation
        if (this.currentMenu) {
            this.currentMenu.classList.add('md3-page-exit');
            const oldMenu = this.currentMenu;
            setTimeout(() => {
                oldMenu.classList.add('md3-hidden');
                oldMenu.classList.remove('md3-page-exit');
            }, 500);
        }

        // Update game state
        if (typeof gameState !== 'undefined') {
            gameState = state;
        }

        // Show new menu with enter animation
        setTimeout(() => {
            let newMenu = null;

            switch (state) {
                case 'NAME_INPUT':
                    newMenu = this.nameInputOverlay;
                    setTimeout(() => {
                        document.getElementById('md3-callsign-input')?.focus();
                    }, 100);
                    break;
                case 'MENU':
                    newMenu = this.mainMenuOverlay;
                    break;
                case 'BOSS_SELECT':
                    newMenu = this.bossSelectOverlay;
                    break;
                case 'MP_MENU':
                    newMenu = this.mpMenuOverlay;
                    break;
                case 'HOST_LOBBY':
                    newMenu = this.hostLobbyOverlay;
                    this.updatePartyList();
                    break;
                case 'JOIN_LOBBY':
                    newMenu = this.joinLobbyOverlay;
                    // Reset state
                    document.getElementById('md3-join-waiting')?.classList.remove('md3-hidden');
                    document.getElementById('md3-join-answer')?.classList.add('md3-hidden');
                    document.getElementById('md3-join-connected')?.classList.add('md3-hidden');
                    break;
            }

            if (newMenu) {
                newMenu.classList.remove('md3-hidden');
                newMenu.classList.add('md3-page-enter');
                this.currentMenu = newMenu;

                setTimeout(() => {
                    newMenu.classList.remove('md3-page-enter');
                }, 600);
            }
        }, 300);
    },

    /**
     * Hide all menu overlays with exit animation (for game start transition)
     */
    hideAll() {
        const overlays = [
            this.nameInputOverlay,
            this.mainMenuOverlay,
            this.bossSelectOverlay,
            this.mpMenuOverlay,
            this.hostLobbyOverlay,
            this.joinLobbyOverlay
        ];

        // Immediately hide all overlays (no animation delay for game start)
        overlays.forEach(overlay => {
            if (overlay) {
                overlay.classList.add('md3-hidden');
                overlay.classList.remove('md3-page-enter', 'md3-page-exit');
            }
        });

        // Also force-hide by ID as fallback (in case references are stale)
        ['md3-name-input', 'md3-main-menu', 'md3-boss-select', 'md3-mp-menu', 'md3-host-lobby', 'md3-join-lobby'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('md3-hidden');
                el.classList.remove('md3-page-enter', 'md3-page-exit');
            }
        });

        this.currentMenu = null;

        // Trigger a brief screen flash effect for game start
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.classList.add('md3-game-start-flash');
            setTimeout(() => {
                canvas.classList.remove('md3-game-start-flash');
            }, 600);
        }

        console.log('[MenuManager] All menus hidden');
    },

    /**
     * Update party list in host lobby
     */
    updatePartyList() {
        const listEl = document.getElementById('md3-party-list');
        if (!listEl) return;

        let html = `<div style="color: #00ff88; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            1. ${typeof myPlayerName !== 'undefined' ? myPlayerName : 'Host'} (Host)
        </div>`;

        if (typeof Network !== 'undefined' && Network.connections) {
            let idx = 2;
            for (let [id, slot] of Network.connections) {
                const status = slot.active ? '🟢 CONNECTED' : '🟡 PENDING...';
                const name = slot.name || 'Unknown';
                html += `<div style="color: ${slot.active ? '#00ff88' : '#ffeb3b'}; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    ${idx}. ${name} [${status}]
                </div>`;
                idx++;
            }
        }

        listEl.innerHTML = html;
    },

    /**
     * Show connection status update
     */
    showConnected() {
        document.getElementById('md3-join-waiting')?.classList.add('md3-hidden');
        document.getElementById('md3-join-answer')?.classList.add('md3-hidden');
        document.getElementById('md3-join-connected')?.classList.remove('md3-hidden');
    },

    /**
     * Show toast notification (MD3 styled)
     */
    showToast(message) {
        // Create a proper MD3 toast that overlays everything
        let toast = document.getElementById('md3-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'md3-toast';
            toast.className = 'md3-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.display = 'block';
        toast.style.animation = 'none';
        toast.offsetHeight; // Trigger reflow
        toast.style.animation = 'md3-toast-in 300ms ease forwards';

        // Remove after 1.5 seconds
        setTimeout(() => {
            toast.style.display = 'none';
        }, 1500);
    }
};

// =====================================================================
// INITIALIZATION
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    InputManager.init();
    MenuManager.init();

    // Show name input on start
    MenuManager.transitionTo('NAME_INPUT');
});

// Also try immediate init if DOM ready
if (document.readyState !== 'loading') {
    setTimeout(() => {
        InputManager.init();
        MenuManager.init();
        MenuManager.transitionTo('NAME_INPUT');
    }, 100);
}

// =====================================================================
// GLOBAL LOBBY UI UPDATE (Called by Network)
// =====================================================================

function updateLobbyUI() {
    // Update party list for host
    if (typeof MenuManager !== 'undefined') {
        MenuManager.updatePartyList();

        // Update connection status for joining players
        if (typeof Network !== 'undefined' && Network.connected && !Network.isHost) {
            MenuManager.showConnected();
        }
    }
}

// =====================================================================
// GLOBAL PARTY HUD UPDATE (Called during gameplay)
// =====================================================================

function updatePartyHUD() {
    const partyHud = document.getElementById('md3-party-hud');
    const partyMembers = document.getElementById('md3-party-members');

    if (!partyHud || !partyMembers) return;

    // Only show in multiplayer
    if (typeof Network === 'undefined' || !Network.isMultiplayer) {
        partyHud.classList.add('md3-hidden');
        return;
    }

    partyHud.classList.remove('md3-hidden');

    let html = '';

    // Add local player
    const myName = typeof myPlayerName !== 'undefined' ? myPlayerName : 'You';
    const myKills = typeof MD3 !== 'undefined' ? MD3.getKills() : 0;
    const myDead = typeof player !== 'undefined' && player && player.dead;
    const myHullPercent = typeof player !== 'undefined' && player ?
        Math.max(0, Math.round((player.hull / player.maxHull) * 100)) : 100;

    const myDeadTag = myDead ? '<span class="dead-tag">[DEAD]</span>' : '';
    const myHullColor = myHullPercent > 60 ? '#00ff88' : myHullPercent > 30 ? '#ffeb3b' : '#ff6b6b';

    html += `<div class="md3-party-member self ${myDead ? 'dead' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="md3-party-name">${myName} ${myDeadTag}</span>
            <span class="md3-party-kills">💀 ${myKills}</span>
        </div>
        <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 4px;">
            <div style="height: 100%; width: ${myHullPercent}%; background: ${myHullColor}; border-radius: 2px; transition: width 0.3s;"></div>
        </div>
    </div>`;

    // Add remote players
    if (typeof remotePlayers !== 'undefined') {
        for (let [id, rp] of remotePlayers) {
            const kills = rp.kills || 0;
            const rpDead = rp.dead;
            const rpHullPercent = rp.hull !== undefined && rp.maxHull ?
                Math.max(0, Math.round((rp.hull / rp.maxHull) * 100)) : 100;
            const rpDeadTag = rpDead ? '<span class="dead-tag">[DEAD]</span>' : '';
            const rpHullColor = rpHullPercent > 60 ? '#00ff88' : rpHullPercent > 30 ? '#ffeb3b' : '#ff6b6b';

            html += `<div class="md3-party-member ${rpDead ? 'dead' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="md3-party-name">${rp.name || 'Player'} ${rpDeadTag}</span>
                    <span class="md3-party-kills">💀 ${kills}</span>
                </div>
                <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 4px;">
                    <div style="height: 100%; width: ${rpHullPercent}%; background: ${rpHullColor}; border-radius: 2px; transition: width 0.3s;"></div>
                </div>
            </div>`;
        }
    }

    partyMembers.innerHTML = html;
}

// Call updatePartyHUD periodically during gameplay
setInterval(() => {
    if (typeof gameState !== 'undefined' && gameState === 'PLAYING') {
        updatePartyHUD();
    }
}, 1000);
