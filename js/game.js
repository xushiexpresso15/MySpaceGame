let last = 0;
let shift = false;

// Initialize Stars
if (typeof Star !== 'undefined') {
    stars = new Star();
}

// =====================================================================
// EXPOSED ACTION FUNCTIONS (Called by InputManager for mouse controls)
// =====================================================================

/**
 * Fire laser weapon - exposed for mouse controls
 */
function gameFireLaser() {
    if (gameState !== 'PLAYING') return;
    if (!player || player.dead) return;

    if (laserReady && laserBurst <= 0 && player.laserOffline <= 0) {
        laserBurst = 0.5;
        laserReady = false;
        laserCooldown = 10;

        // Network sync
        if (Network.isMultiplayer && Network.connected) {
            Network.fireWeapon('LASER', player.x, player.y, player.angle);
        }
        return true;
    }
    return false;
}

/**
 * Fire forward torpedo - exposed for mouse controls
 */
function gameFireTorpedoForward() {
    if (gameState !== 'PLAYING') return;
    if (!player || player.dead) return;

    if (torpFwd > 0 && player.torpFwdOffline <= 0) {
        let angle = player.angle;
        if (player.torpFwdTargetBad > 0) {
            angle += (Math.random() * 40 - 20) * Math.PI / 180;
        }
        torps.push(new Torpedo(player.x, player.y, angle, true));
        torpFwd--;
        torpFwdDisplay.innerText = torpFwd;

        // Network sync
        if (Network.isMultiplayer && Network.connected) {
            Network.fireWeapon('TORPEDO', player.x, player.y, angle);
        }
        return true;
    }
    return false;
}

/**
 * Fire aft torpedo - exposed for mouse controls
 */
function gameFireTorpedoAft() {
    if (gameState !== 'PLAYING') return;
    if (!player || player.dead) return;

    if (torpAft > 0 && player.torpAftOffline <= 0) {
        let angle = player.angle + Math.PI;
        if (player.torpAftTargetBad > 0) {
            angle += (Math.random() * 40 - 20) * Math.PI / 180;
        }
        torps.push(new Torpedo(player.x, player.y, angle, false));
        torpAft--;
        torpAftDisplay.innerText = torpAft;

        // Network sync
        if (Network.isMultiplayer && Network.connected) {
            Network.fireWeapon('TORPEDO', player.x, player.y, angle);
        }
        return true;
    }
    return false;
}

// =====================================================================
// INPUT HANDLING
// Keyboard is now SECONDARY - primary control is mouse via InputManager
// Menu states are handled by DOM-based MenuManager (input-manager.js)
// =====================================================================

onkeydown = e => {
    // NOTE: Menu navigation is now handled by DOM MenuManager
    // Keyboard here is kept only as FALLBACK for accessibility

    // Skip if DOM menu is handling input
    if (typeof MenuManager !== 'undefined' && MenuManager.currentMenu) {
        // Only allow Escape to work as fallback
        if (e.code !== 'Escape') return;
    }

    // Menu Navigation (Keyboard Fallback)
    if (gameState === 'NAME_INPUT') {
        // Text input handled by DOM input field in MenuManager
        // This is fallback for canvas-based input
        if (e.code === 'Enter') {
            if (myPlayerName.trim().length > 0) {
                gameState = 'MENU';
                if (typeof MenuManager !== 'undefined') MenuManager.transitionTo('MENU');
            }
        } else if (e.code === 'Backspace') {
            myPlayerName = myPlayerName.substring(0, myPlayerName.length - 1);
        } else if (e.key.length === 1) {
            if (myPlayerName.length < 12) myPlayerName += e.key;
        }
    } else if (gameState === 'MENU') {
        if (e.code === 'ArrowUp') menuSelection = (menuSelection - 1 + 3) % 3;
        if (e.code === 'ArrowDown') menuSelection = (menuSelection + 1) % 3;
        if (e.code === 'Enter') {
            if (menuSelection === 0) startNormalMode();
            else if (menuSelection === 1) gameState = 'BOSS_SELECT';
            else if (menuSelection === 2) gameState = 'MP_MENU';
        }
    } else if (gameState === 'BOSS_SELECT') {
        if (e.code === 'ArrowUp') bossSelection = (bossSelection - 1 + 3) % 3;
        if (e.code === 'ArrowDown') bossSelection = (bossSelection + 1) % 3;
        if (e.code === 'Enter') {
            let type = bossSelection === 0 ? 'GALAXY' : bossSelection === 1 ? 'CRYSTAL' : 'VOID';
            startBossBattle(type);
        }
        if (e.code === 'Escape') gameState = 'MENU';
    } else if (gameState === 'MP_MENU') {
        if (e.code === 'ArrowUp') mpSelection = (mpSelection - 1 + 2) % 2;
        if (e.code === 'ArrowDown') mpSelection = (mpSelection + 1) % 2;
        if (e.code === 'Enter') {
            if (mpSelection === 0) {
                gameState = 'HOST_LOBBY';
                connectionCode = '';
                Network.startHost().then(offer => {
                    Network.createConnectionSlot().then(code => {
                        connectionCode = code;
                    });
                });
            } else {
                gameState = 'JOIN_LOBBY';
                connectionCode = '';
                navigator.clipboard.readText().then(text => {
                    if (text && text.length > 20) connectionCode = text;
                }).catch(err => console.log('Clipboard read failed', err));
            }
        }
        if (e.code === 'Escape') gameState = 'MENU';
    } else if (gameState === 'HOST_LOBBY') {
        if (e.code === 'KeyN') {
            Network.createConnectionSlot().then(code => {
                connectionCode = code;
                showClipboardFeedback('New Slot Created');
            });
        }
        if (e.code === 'KeyC') {
            copyToClipboard(connectionCode).then(() => {
                showClipboardFeedback('Copied!');
            });
        }
        if (e.code === 'KeyV') {
            navigator.clipboard.readText().then(text => {
                if (text) {
                    try {
                        Network.acceptAnswer(text).then(success => {
                            if (success) {
                                showClipboardFeedback('Player Joined!');
                                connectionCode = '';
                            } else {
                                alert('Invalid Answer Code');
                            }
                        });
                    } catch (e) {
                        alert('Invalid answer code!');
                    }
                }
            });
        }
        if (e.code === 'Enter' && Network.connected) {
            startMultiplayerGame();
            Network.send(Network.MSG.GAME_START, {});
        }
        if (e.code === 'Escape') {
            Network.disconnect();
            gameState = 'MP_MENU';
        }
    } else if (gameState === 'JOIN_LOBBY') {
        if (e.code === 'KeyV' && !Network.connected) {
            navigator.clipboard.readText().then(text => {
                if (text) {
                    try {
                        Network.joinGame(text).then(answer => {
                            connectionCode = answer;
                        });
                    } catch (e) {
                        alert('Invalid host code!');
                    }
                }
            });
        }
        if (e.code === 'KeyC' && connectionCode && !Network.connected) {
            copyToClipboard(connectionCode).then(() => {
                showClipboardFeedback('Copied!');
            });
        }
        if (e.code === 'Escape') {
            Network.disconnect();
            gameState = 'MP_MENU';
        }
    } else if (gameState === 'PLAYING') {
        // Game Inputs
        if (!player.dead) {
            keys[e.code] = true;

            // R key: Reload torpedoes
            if (e.code === 'KeyR' && canReload) {
                torpFwd = 12;
                torpAft = 5;
                torpFwdDisplay.innerText = torpFwd;
                torpAftDisplay.innerText = torpAft;

                // Update MD3 HUD
                const md3TorpFwd = document.getElementById('md3-torpFwd');
                const md3TorpAft = document.getElementById('md3-torpAft');
                if (md3TorpFwd) md3TorpFwd.textContent = torpFwd;
                if (md3TorpAft) md3TorpAft.textContent = torpAft;

                // Hide reload hint
                const reloadHint = document.getElementById('md3-reload-hint');
                if (reloadHint) reloadHint.classList.add('md3-hidden');

                canReload = false;
                reloadTimer = 0;

                console.log('[Game] Ammo reloaded');
            }
        }
    }
};
onkeyup = e => keys[e.code] = false;


// NOTE: Main loop function is defined later in the file with DOM menu integration

window.addEventListener('resize', resizeGame);

function resizeGame() {
    if (Network.isMultiplayer) {
        // In MP, force internal resolution to match negotiated game size
        canvas.width = gameWidth;
        canvas.height = gameHeight;

        let scaleX = window.innerWidth / gameWidth;
        let scaleY = window.innerHeight / gameHeight;
        let scale = Math.min(scaleX, scaleY);
        canvas.style.width = (gameWidth * scale) + "px";
        canvas.style.height = (gameHeight * scale) + "px";
        canvas.style.position = "absolute";
        canvas.style.left = ((window.innerWidth - (gameWidth * scale)) / 2) + "px";
        canvas.style.top = ((window.innerHeight - (gameHeight * scale)) / 2) + "px";
    } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gameWidth = canvas.width;
        gameHeight = canvas.height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.position = "static";
        if (typeof player !== 'undefined' && player) clampPlayerToBounds();
    }
}

function startNormalMode() {
    gameState = 'PLAYING';
    selectedBossType = null;
    menuControls.style.display = 'none';
    // gameUI.style.display = 'block';
    // timerDisplay.style.display = 'block';
    restartGame();
}

function startBossBattle(bossType) {
    gameState = 'PLAYING';
    selectedBossType = bossType;
    menuControls.style.display = 'none';
    // gameUI.style.display = 'block';
    // timerDisplay.style.display = 'block';
    restartGame();
    // Clear enemies and spawn boss immediately
    enemies = [];
    bossTimer = 0;
    if (bossType === 'GALAXY') {
        boss = new Boss(0);
    } else if (bossType === 'CRYSTAL') {
        boss = new LiquidCrystal();
    } else if (bossType === 'VOID') {
        boss = new VoidReaper();
    }
    if (boss) boss.entityId = 'boss';
    bossActive = true;
    explosions.push(new Explosion(boss.x, boss.y));
}

function startMultiplayerGame() {
    Network.isMultiplayer = true;
    gameState = 'PLAYING';
    selectedBossType = null;
    menuControls.style.display = 'none';
    // gameUI.style.display = 'block';
    // timerDisplay.style.display = 'block';

    // HIDE MenuManager overlays (for joining players)
    if (typeof MenuManager !== 'undefined') {
        MenuManager.hideAll();
    }

    // Show HUD and party HUD
    const hud = document.getElementById('md3-hud');
    if (hud) hud.classList.remove('md3-hidden');

    const partyHud = document.getElementById('md3-party-hud');
    if (partyHud) partyHud.classList.remove('md3-hidden');

    // Show multiplayer UI (legacy)
    const p2UI = document.getElementById('player2UI');
    const connStatus = document.getElementById('connectionStatus');
    if (p2UI) p2UI.style.display = 'block';
    if (connStatus) connStatus.style.display = 'block';

    console.log('startMultiplayerGame called, isHost:', Network.isHost);

    // Initialize game state
    restartGame();

    // Host broadcasts initial enemies to client after a short delay
    // to ensure client is ready
    if (Network.isHost) {
        setTimeout(() => {
            console.log('Host broadcasting initial enemies:', enemies.length);
            for (const e of enemies) {
                Network.createEntity(
                    'enemy_' + e.netId,
                    'ENEMY_SHIP',
                    e.x, e.y,
                    e.angle * 180 / Math.PI,
                    e.enemyType === 'red' ? 'enemyRed' : 'enemyBlue'
                );
                Network.entities.set('enemy_' + e.netId, e);
            }
        }, 500);
    }
}

function restartGame() {
    resizeGame();
    player = new Ship(gameWidth / 2, gameHeight / 2, true);
    enemies = [];

    // Only host spawns the initial enemy
    if (!Network.isMultiplayer || Network.isHost) {
        // Reset enemy ID counter
        nextNetEnemyId = 1;
        nextHealthPackId = 1;

        let enemyType = Math.random() < 0.5 ? 'red' : 'blue';
        let spawnX = Math.random() * gameWidth;
        let spawnY = Math.random() * gameHeight;
        let newEnemy = new Ship(spawnX, spawnY, false, enemyType);
        newEnemy.netId = nextNetEnemyId++;
        newEnemy.entityId = 'enemy_' + newEnemy.netId;
        enemies.push(newEnemy);

        // Store in entities map (broadcast happens in startMultiplayerGame after delay)
        if (Network.isMultiplayer && Network.connected) {
            Network.entities.set('enemy_' + newEnemy.netId, newEnemy);
        }
    }

    torps = []; lasers = []; explosions = []; bullets = []; enemyLasers = [];
    healthPacks = [];
    healthPackTimer = Math.random() * 5 + 10;
    bombs = [];
    stunEffect = null;
    lightningParticles = [];
    torpFwd = 12; torpAft = 5;
    torpFwdDisplay.innerText = torpFwd;
    torpAftDisplay.innerText = torpAft;
    hullDisplay.innerText = '100%';
    laserReady = true; laserCooldown = 0; laserBurst = 0;
    canReload = false; reloadTimer = 0; reloadMsg.style.display = 'none';
    enemySpawnTimer = Math.random() * 5 + 5;
    bossTimer = 60; bossActive = false; boss = null;
    absorbEffect = null;
    gameOver = false;
    // ensure UI overlay is reset (important for clients restarting from network signal)
    resetGameUI();
}

function spawnBoss() {
    // Skip if enemy spawn is disabled (peaceful mode)
    if (!enemySpawnEnabled) return;

    // Only host spawns boss in multiplayer
    if (Network.isMultiplayer && !Network.isHost) return;

    let enemyCount = enemies.length;
    let bossX = canvas.width / 2;
    let bossY = 100;

    // Randomly choose boss type (50% each)
    let bossType = Math.random() < 0.5 ? 'GALAXY' : 'CRYSTAL';

    if (enemies.length > 0) {
        absorbEffect = new AbsorbEffect([...enemies], bossX, bossY);
        if (bossType === 'GALAXY') {
            boss = new Boss(enemyCount);
        } else {
            boss = new LiquidCrystal();
        }
    } else {
        if (bossType === 'GALAXY') {
            boss = new Boss(enemyCount);
        } else {
            boss = new LiquidCrystal();
        }
        bossActive = true;
        explosions.push(new Explosion(boss.x, boss.y));
    }

    // Broadcast boss spawn to client
    if (Network.isMultiplayer && Network.connected) {
        Network.sendBossSpawn(bossType, boss.x, boss.y);
    }
}

function updateTimer(dt) {
    // Only host manages the boss timer in multiplayer
    if (!bossActive && !gameOver && (!Network.isMultiplayer || Network.isHost)) {
        bossTimer -= dt;
        if (bossTimer <= 0) {
            spawnBoss();
            bossTimer = 60;
        }
    }
    let mins = Math.floor(bossTimer / 60);
    let secs = Math.floor(bossTimer % 60);
    // timerDisplay.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Update MD3 Timer
    if (typeof MD3 !== 'undefined') {
        // Hide timer in peaceful mode (no enemies/boss)
        if (!enemySpawnEnabled && MD3.timer) {
            MD3.timer.style.display = 'none';
        } else if (MD3.timer) {
            MD3.timer.style.display = '';
            MD3.updateTimer(Math.max(0, bossTimer));

            // Optional: Add visual flair for boss
            if (bossActive) {
                MD3.timer.style.borderColor = '#ff4d4d'; // Red
                MD3.timer.style.boxShadow = '0 0 15px rgba(255, 77, 77, 0.4)';
            } else {
                MD3.timer.style.borderColor = ''; // Reset
                MD3.timer.style.boxShadow = '';
            }
        }
    }

    if (bossActive) {
        // Legacy fallback (hidden anyway)
        timerDisplay.style.borderColor = '#f00';
        timerDisplay.style.color = '#f00';
        timerDisplay.style.boxShadow = '0 0 20px rgba(255,0,0,.8)';
    } else {
        timerDisplay.style.borderColor = '#f80';
        timerDisplay.style.color = '#f80';
        timerDisplay.style.boxShadow = '0 0 20px rgba(255,136,0,.5)';
    }
}

function applyDamageToPlayer(amount, sector) {
    // Don't apply damage if already dead
    if (player.dead) return;

    if (player.shield[sector] > 0) {
        let overflow = Math.max(0, amount - player.shield[sector]);
        player.shield[sector] = Math.max(0, player.shield[sector] - amount);
        if (overflow > 0) {
            player.hull = Math.max(0, player.hull - overflow);
        }
    } else {
        player.hull = Math.max(0, player.hull - amount);
    }
    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';

    // Check for death - let the main loop handle it for proper sync
    // (the main loop checks player.hull <= 0 && !player.dead)
}

function loop(t) {
    let dt = (t - last) / 1000;
    last = t;
    if (dt > 0.1) dt = 0.1;

    try {

        // =====================================================================
        // MENU STATES
        // When DOM MenuManager is active, only draw starfield background
        // Otherwise fall back to legacy canvas menus
        // =====================================================================

        const hasDOMMenu = typeof MenuManager !== 'undefined' && MenuManager.currentMenu;

        if (gameState === 'NAME_INPUT') {
            // Draw starfield background (visible through transparent DOM menu)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawNameInput(); // Legacy fallback
            requestAnimationFrame(loop);
            return;
        }
        if (gameState === 'MENU') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawMenu();
            requestAnimationFrame(loop);
            return;
        }
        if (gameState === 'BOSS_SELECT') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawBossSelect();
            requestAnimationFrame(loop);
            return;
        }
        // Multiplayer menu states
        if (gameState === 'MP_MENU') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawMPMenu();
            requestAnimationFrame(loop);
            return;
        }
        if (gameState === 'HOST_LOBBY') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawHostLobby();
            requestAnimationFrame(loop);
            return;
        }
        if (gameState === 'JOIN_LOBBY') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            if (!hasDOMMenu) drawJoinLobby();
            requestAnimationFrame(loop);
            return;
        }

        if (player.hull <= 0 && !player.dead) {
            player.dead = true;
            // Only trigger Game Over immediately in Single Player
            if (!Network.isMultiplayer) {
                gameOver = true;
            } else {
                // Broadcast death to all other players
                // Use myId for clients, 'host' for host player
                const playerId = Network.isHost ? 'host' : Network.myId;
                Network.broadcastPlayerDeath(playerId, player.x, player.y);

                // Create local explosion
                explosions.push(new Explosion(player.x, player.y));

                showSpectatorMode();
            }
        }

        if (Network.isMultiplayer && Network.connected) {
            // In MP, Game Over only if ALL players are dead
            let allDead = player.dead;
            if (allDead) {
                for (let rp of remotePlayers.values()) {
                    if (!rp.dead) {
                        allDead = false;
                        break;
                    }
                }
            }
            if (allDead && !gameOver) {
                gameOver = true;
                console.log('[Game] All players dead - triggering game over');

                const totalKills = typeof MD3 !== 'undefined' ? MD3.getKills() : 0;

                // Host broadcasts Game Over to all clients
                if (Network.isHost) {
                    Network.broadcastGameOver(totalKills);
                }

                // Show game over UI locally (both host and client)
                if (typeof MD3 !== 'undefined') {
                    MD3.showGameOver(Network.isHost, totalKills);
                }
            }
        }

        if (gameOver) {
            // Render frozen state
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.draw();
            for (let t of torps) t.draw();
            for (let e of enemies) e.draw();
            if (boss) boss.draw();
            for (let b of bullets) b.draw();
            for (let el of enemyLasers) el.draw();
            for (let l of lasers) {
                ctx.save();
                ctx.shadowBlur = 10;
                ctx.shadowColor = l.c;
                ctx.beginPath();
                ctx.moveTo(l.x1, l.y1);
                ctx.lineTo(l.x2, l.y2);
                ctx.strokeStyle = l.c;
                ctx.lineWidth = l.w;
                ctx.stroke();
                ctx.restore();
            }
            if (Network.isMultiplayer) Network.drawRemotePlayers();
            for (let e of explosions) e.draw();
            // Draw new visual effects
            for (let g of shieldImpactGlows) g.draw();
            for (let s of sparklerEffects) s.draw();

            // MD3 Overlay Logic
            let isHost = !Network.isMultiplayer || Network.isHost;
            const gameOverEl = document.getElementById('md3-gameover');
            if (gameOverEl && gameOverEl.classList.contains('md3-hidden')) {
                checkGameOver(isHost, 0);
            }

            requestAnimationFrame(loop);
            return;
        }
        if (absorbEffect) {
            absorbEffect.update(dt);
            if (absorbEffect.done) {
                enemies = [];
                bossActive = true;
                explosions.push(new Explosion(boss.x, boss.y));
                absorbEffect = null;
            }
        }

        updateTimer(dt);

        // === LASER COOLDOWN UPDATE ===
        if (!laserReady) {
            laserCooldown -= dt;
            if (laserCooldown <= 0) laserReady = true;
        }

        // Update laser HUD indicator
        const laserIndicator = document.getElementById('md3-laser-indicator');
        const laserFill = document.getElementById('md3-laser-fill');
        const laserStatus = document.getElementById('md3-laser-status');
        if (laserFill && laserStatus && laserIndicator) {
            if (laserReady && laserBurst <= 0) {
                laserFill.style.width = '100%';
                laserStatus.textContent = 'READY';
                laserIndicator.classList.add('ready');
            } else if (laserBurst > 0) {
                // Currently firing
                laserFill.style.width = `${(laserBurst / 0.5) * 100}%`;
                laserStatus.textContent = 'FIRING';
                laserIndicator.classList.remove('ready');
            } else {
                // Cooling down
                const progress = Math.max(0, (10 - laserCooldown) / 10 * 100);
                laserFill.style.width = `${progress}%`;
                laserStatus.textContent = `${Math.ceil(laserCooldown)}s`;
                laserIndicator.classList.remove('ready');
            }
        }

        if (laserBurst > 0) laserBurst -= dt;

        // === RELOAD TIMER UPDATE ===
        if (torpFwd === 0 && !canReload) {
            reloadTimer += dt;
            if (reloadTimer >= 5) {
                canReload = true;
                // Show reload hint
                const reloadHint = document.getElementById('md3-reload-hint');
                if (reloadHint) reloadHint.classList.remove('md3-hidden');
            }
        }

        // Also update MD3 HUD torpedo counts
        const md3TorpFwd = document.getElementById('md3-torpFwd');
        const md3TorpAft = document.getElementById('md3-torpAft');
        const md3Hull = document.getElementById('md3-hullDisplay');
        if (md3TorpFwd) md3TorpFwd.textContent = torpFwd;
        if (md3TorpAft) md3TorpAft.textContent = torpAft;
        if (md3Hull && player) md3Hull.textContent = Math.round(player.hull / player.maxHull * 100) + '%';
        const A = getAngle();
        if (A.angle !== null) {
            player.target = A.angle;
        }

        // Only process input and movement if alive
        if (!player.dead) {
            let shiftPressed = keys["ShiftLeft"] || keys["ShiftRight"];
            let controlPressed = keys["ControlLeft"] || keys["ControlRight"];

            if (shiftPressed && !shift) {
                if (torpFwd > 0 && player.torpFwdOffline <= 0) {
                    let angle = player.angle;
                    if (player.torpFwdTargetBad > 0) {
                        angle += (Math.random() * 40 - 20) * Math.PI / 180;
                    }
                    torps.push(new Torpedo(player.x, player.y, angle, true));
                    torpFwd--;
                    torpFwdDisplay.innerText = torpFwd;
                    shift = true;

                    // Broadcast torpedo fire using formal API
                    if (Network.isMultiplayer && Network.connected) {
                        Network.fireWeapon('TORPEDO', player.x, player.y, angle);
                    }
                }
            } else if (controlPressed && !shift) {
                if (torpAft > 0 && player.torpAftOffline <= 0) {
                    let angle = player.angle + Math.PI;
                    if (player.torpAftTargetBad > 0) {
                        angle += (Math.random() * 40 - 20) * Math.PI / 180;
                    }
                    torps.push(new Torpedo(player.x, player.y, angle, false));
                    torpAft--;
                    torpAftDisplay.innerText = torpAft;
                    shift = true;

                    // Broadcast torpedo fire using formal API
                    if (Network.isMultiplayer && Network.connected) {
                        Network.fireWeapon('TORPEDO', player.x, player.y, angle);
                    }
                }
            }
            if (!shiftPressed && !controlPressed) shift = false;
            if (keys["Space"] && laserReady && laserBurst <= 0 && player.laserOffline <= 0) {
                laserBurst = 0.5;
                laserReady = false;
                laserCooldown = 10;

                // Broadcast laser fire using formal API
                if (Network.isMultiplayer && Network.connected) {
                    Network.fireWeapon('LASER', player.x, player.y, player.angle);
                }
            }
        } // End alive check
        if (laserBurst > 0) {
            let hit = null, dist = 1200;
            if (boss && !boss.dead && !boss.invulnerable) {
                let ex = boss.x - player.x, ey = boss.y - player.y;
                let rx = ex * Math.cos(-player.angle) - ey * Math.sin(-player.angle);
                let ry = ex * Math.sin(-player.angle) + ey * Math.cos(-player.angle);
                if (rx > 0 && Math.abs(ry) < boss.r && rx < dist) {
                    dist = rx;
                    hit = boss;
                }
            }
            for (let e of enemies) {
                if (e.dead) continue;
                let ex = e.x - player.x, ey = e.y - player.y;
                let rx = ex * Math.cos(-player.angle) - ey * Math.sin(-player.angle);
                let ry = ex * Math.sin(-player.angle) + ey * Math.cos(-player.angle);
                if (rx > 0 && Math.abs(ry) < e.r && rx < dist) {
                    dist = rx;
                    hit = e;
                }
            }
            // Check shields (LiquidCrystal)
            if (boss && boss instanceof LiquidCrystal && boss.shields) {
                for (let s of boss.shields) {
                    if (s.dead) continue;
                    let ex = s.x - player.x, ey = s.y - player.y;
                    let rx = ex * Math.cos(-player.angle) - ey * Math.sin(-player.angle);
                    let ry = ex * Math.sin(-player.angle) + ey * Math.cos(-player.angle);
                    if (rx > 0 && Math.abs(ry) < s.r && rx < dist) {
                        dist = rx;
                        s.dead = true;
                        explosions.push(new Explosion(s.x, s.y));
                    }
                }
            }
            // Check turrets (LiquidCrystal)
            if (boss && boss instanceof LiquidCrystal && boss.turrets) {
                for (let turret of boss.turrets) {
                    if (turret.dead) continue;
                    let ex = turret.x - player.x, ey = turret.y - player.y;
                    let rx = ex * Math.cos(-player.angle) - ey * Math.sin(-player.angle);
                    let ry = ex * Math.sin(-player.angle) + ey * Math.cos(-player.angle);
                    if (rx > 0 && Math.abs(ry) < turret.r && rx < dist) {
                        dist = rx;
                        turret.hp -= 40 * dt;
                        if (turret.hp <= 0) {
                            turret.dead = true;
                            explosions.push(new Explosion(turret.x, turret.y));
                        }
                    }
                }
            }
            let lx = player.x + Math.cos(player.angle) * dist;
            let ly = player.y + Math.sin(player.angle) * dist;
            if (hit) {
                hit.hp -= 40 * dt;
                // Trigger hurt flash
                if (hit.hurtTimer !== undefined) hit.hurtTimer = 0.15;
                // Sparkler effect for laser on enemy hull (throttled to avoid spam)
                if (!hit.lastSparkler || Date.now() - hit.lastSparkler > 100) {
                    sparklerEffects.push(new SparklerEffect(lx, ly, player.angle));
                    hit.lastSparkler = Date.now();
                }
                if (hit.hp <= 0) {
                    hit.dead = true;
                    explosions.push(new Explosion(hit.x, hit.y));
                    if (hit === boss) {
                        bossActive = false;
                        boss = null;
                        bossTimer = 60;
                    } else {
                        // Enemy killed - increment score
                        if (typeof MD3 !== 'undefined') MD3.incrementScore();
                    }
                }
            }
            lasers.push({ x1: player.x, y1: player.y, x2: lx, y2: ly, w: 4, c: "#0fbb", life: 1 });
            lasers.push({ x1: player.x, y1: player.y, x2: lx, y2: ly, w: 1.5, c: "#fff", life: 1 });
        }
        if (!player.dead) player.update(dt);

        // Update bombs
        for (let b of bombs) b.update(dt);
        bombs = bombs.filter(b => !b.dead);

        // Update lightning particles
        for (let lp of lightningParticles) lp.update(dt);
        lightningParticles = lightningParticles.filter(lp => lp.life > 0);

        // Update stun effect
        if (stunEffect) {
            stunEffect.update(dt);
            if (stunEffect.done) stunEffect = null;
        }

        if (boss) {
            boss.update(dt);
        }
        for (let e of enemies) {
            if (e.dead) continue;

            // Choose target - randomly select from ALL living players
            let target = player;
            if (Network.isMultiplayer && !Network.isHost) {
                // Client just follows host's sync, minimal local logic
            } else if (Network.isMultiplayer && Network.isHost) {
                // Host picks random target from all living players
                const livingPlayers = [];

                // Add local player if alive
                if (player && !player.dead) {
                    livingPlayers.push(player);
                }

                // Add all living remote players
                for (const [id, rp] of remotePlayers) {
                    if (rp && !rp.dead) {
                        livingPlayers.push(rp);
                    }
                }

                // Random selection with periodic re-targeting
                if (livingPlayers.length > 0) {
                    // Re-target every few seconds or if no target
                    if (!e.currentTarget || e.targetTimer <= 0 || e.currentTarget.dead) {
                        e.currentTarget = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
                        e.targetTimer = 3 + Math.random() * 5; // Re-target every 3-8 seconds
                    }
                    e.targetTimer -= 0.016; // ~60fps dt approximation
                    target = e.currentTarget;
                }
            }

            // AI Logic - only run on host or single player
            let ang = 0;
            if (!Network.isMultiplayer || Network.isHost) {
                ang = Math.atan2(target.y - e.y, target.x - e.x);
                let dist = Math.hypot(target.x - e.x, target.y - e.y);
                let targetAngle = ang;
                if (dist < 200) {
                    targetAngle = ang + Math.PI;
                } else if (dist > 400) {
                    targetAngle = ang;
                } else {
                    if (e.aiState === 'chase') {
                        targetAngle = ang;
                    } else if (e.aiState === 'evade') {
                        targetAngle = ang + Math.PI;
                    } else if (e.aiState === 'orbit') {
                        targetAngle = ang + Math.PI / 2;
                    }
                }
                e.target = targetAngle + (Math.random() - .5) * 0.4;
            }

            e.update(dt);

            // Enemy firing - host-authoritative in multiplayer
            if (Math.random() < 0.008) {
                if (!Network.isMultiplayer || Network.isHost) {
                    if (e.enemyType === 'red') {
                        bullets.push(new Bullet(e.x, e.y, ang));
                        // Broadcast to client
                        if (Network.isMultiplayer && Network.connected) {
                            Network.sendEnemyBullet(e.x, e.y, ang);
                        }
                    } else {
                        if (!e.laserCharging) {
                            e.laserCharging = true;
                            e.chargeTime = 1.0;
                            e.chargeAngle = ang;
                            setTimeout(() => {
                                if (e && !e.dead) {
                                    enemyLasers.push(new EnemyLaser(e.x, e.y, e.chargeAngle));
                                    if (Network.isMultiplayer && Network.connected) {
                                        Network.sendEnemyLaser(e.x, e.y, e.chargeAngle);
                                    }
                                }
                            }, 1000);
                        }
                    }
                }
            }
        }

        // Sync enemy positions to clients (Host only)
        if (Network.isMultiplayer && Network.isHost && Network.connected) {
            Network.syncEnemies();
            Network.syncPlayerState(); // Sync host player state (HP, shields, kills)
        }

        // PVP: Player-to-player collision damage
        if (Network.isMultiplayer && pvpEnabled && !player.dead) {
            for (const [id, rp] of remotePlayers) {
                if (rp && !rp.dead) {
                    const dist = Math.hypot(player.x - rp.x, player.y - rp.y);
                    const collisionDist = (player.r || 25) + (rp.r || 25);

                    if (dist < collisionDist) {
                        // Collision! Apply damage to both players
                        const contactDamage = 15;
                        const hitAngle = Math.atan2(rp.y - player.y, rp.x - player.x);
                        const sector = Math.floor(((hitAngle - player.angle + Math.PI * 2.5) % (Math.PI * 2)) / (Math.PI / 2)) % 4;

                        // Apply damage to local player
                        if (player.shield[sector] > 0) {
                            player.shield[sector] -= contactDamage;
                            player.hits.push({ angle: hitAngle, sector: sector, life: 0.5 });
                        } else {
                            player.hull -= contactDamage;
                        }

                        // Send damage to remote player
                        Network.sendPvpDamage(id, contactDamage, player.x, player.y, hitAngle + Math.PI);

                        // Push players apart
                        const pushForce = 50;
                        const pushAngle = Math.atan2(player.y - rp.y, player.x - rp.x);
                        player.x += Math.cos(pushAngle) * pushForce * dt;
                        player.y += Math.sin(pushAngle) * pushForce * dt;

                        explosions.push(new Explosion((player.x + rp.x) / 2, (player.y + rp.y) / 2));
                    }
                }
            }
        }

        for (let b of bullets) {
            if (b.dead) continue;
            let ang = Math.atan2(b.y - player.y, b.x - player.x);
            let sector = getSector(player.angle, ang);
            if (player.shield[sector] > 0 && Math.hypot(b.x - player.x, b.y - player.y) < player.shR) {
                let dmg = player.maxShield * (0.125 + Math.random() * 0.125);
                let overflow = Math.max(0, dmg - player.shield[sector]);
                player.shield[sector] = Math.max(0, player.shield[sector] - dmg);
                player.hits.push(new ShieldHit(ang, sector));
                // Add small impact glow at hit point
                let hitX = player.x + Math.cos(ang) * player.shR;
                let hitY = player.y + Math.sin(ang) * player.shR;
                shieldImpactGlows.push(new ShieldImpactGlow(hitX, hitY));
                if (overflow > 0) {
                    player.hull = Math.max(0, player.hull - overflow);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                }
                let totShield = player.shield.reduce((a, b) => a + b, 0);
                if (totShield <= 0) explosions.push(new Explosion(player.x, player.y));
                b.dead = true;
            } else if (player.shield[sector] <= 0 && Math.hypot(b.x - player.x, b.y - player.y) < player.r) {
                // Direct hull hit (no shield protection) - sparkler effect
                sparklerEffects.push(new SparklerEffect(b.x, b.y, ang));
                let hullDmg = player.maxHull * (0.125 + Math.random() * 0.125);
                hullDmg *= 2;
                player.speed = player.baseSpeed * 0.7;
                // Restore speed after 2s if not stunned
                setTimeout(() => {
                    if (player && !player.dead && (!stunEffect || stunEffect.done)) {
                        player.speed = player.baseSpeed;
                    }
                }, 2000);

                // Apply hull damage
                player.hull = Math.max(0, player.hull - hullDmg);
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';

                // System damage based on impact location
                let hullPercent = player.hull / player.maxHull;
                let offlineDuration = 5 + (1 - hullPercent) * 25;
                if (sector === 0) {
                    if (Math.random() < 0.3) {
                        if (Math.random() < 0.5) {
                            player.laserOffline = Math.max(player.laserOffline, offlineDuration);
                        } else {
                            player.torpFwdOffline = Math.max(player.torpFwdOffline, offlineDuration);
                        }
                    }
                    if (Math.random() < 0.4) {
                        player.torpFwdTargetBad = Math.max(player.torpFwdTargetBad, offlineDuration);
                    }
                } else if (sector === 2) {
                    if (Math.random() < 0.3) {
                        player.torpAftOffline = Math.max(player.torpAftOffline, offlineDuration);
                    }
                    if (Math.random() < 0.4) {
                        player.torpAftTargetBad = Math.max(player.torpAftTargetBad, offlineDuration);
                    }
                }
                b.dead = true;
            }
        }
        for (let el of enemyLasers) {
            if (el.dead) continue;
            let ldx = el.x2 - el.x1;
            let ldy = el.y2 - el.y1;
            let fx = el.x1 - player.x;
            let fy = el.y1 - player.y;
            let a = ldx * ldx + ldy * ldy;
            let b = 2 * (fx * ldx + fy * ldy);
            let c = fx * fx + fy * fy - player.shR * player.shR;
            let discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
                let t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
                let t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
                let hitT = null;
                if (t1 >= 0 && t1 <= 1) hitT = t1;
                else if (t2 >= 0 && t2 <= 1) hitT = t2;
                if (hitT !== null) {
                    let hitX = el.x1 + hitT * ldx;
                    let hitY = el.y1 + hitT * ldy;
                    let ang = Math.atan2(hitY - player.y, hitX - player.x);
                    let sector = getSector(player.angle, ang);
                    if (player.shield[sector] > 0 && !el.damaged) {
                        let dmg = player.maxShield * (0.125 + Math.random() * 0.125);
                        let overflow = Math.max(0, dmg - player.shield[sector]);
                        player.shield[sector] = Math.max(0, player.shield[sector] - dmg);
                        player.hits.push(new ShieldHit(ang, sector));
                        // Add shield impact glow at laser-shield hit point
                        shieldImpactGlows.push(new ShieldImpactGlow(hitX, hitY));
                        if (overflow > 0) {
                            player.hull = Math.max(0, player.hull - overflow);
                            hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                        }
                        let totShield = player.shield.reduce((a, b) => a + b, 0);
                        if (totShield <= 0) explosions.push(new Explosion(player.x, player.y));
                        el.damaged = true;
                    } else if (player.shield[sector] <= 0 && !el.damaged) {
                        let coreA = ldx * ldx + ldy * ldy;
                        let coreB = 2 * (fx * ldx + fy * ldy);
                        let coreC = fx * fx + fy * fy - player.r * player.r;
                        let coreDisc = coreB * coreB - 4 * coreA * coreC;
                        if (coreDisc >= 0) {
                            let coreT1 = (-coreB - Math.sqrt(coreDisc)) / (2 * coreA);
                            let coreT2 = (-coreB + Math.sqrt(coreDisc)) / (2 * coreA);
                            let coreTgood = null;
                            if (coreT1 >= 0 && coreT1 <= 1) coreTgood = coreT1;
                            else if (coreT2 >= 0 && coreT2 <= 1) coreTgood = coreT2;
                            if (coreTgood !== null) {
                                // Sparkler effect for laser hitting hull
                                let sparkX = el.x1 + coreTgood * ldx;
                                let sparkY = el.y1 + coreTgood * ldy;
                                sparklerEffects.push(new SparklerEffect(sparkX, sparkY, ang));
                                let hullDmg = player.maxHull * (0.125 + Math.random() * 0.125);
                                if (sector === 1 || sector === 3) {
                                    hullDmg *= 2;
                                    player.speed = player.baseSpeed * 0.7;
                                    // Restore speed after 2s if not stunned
                                    setTimeout(() => {
                                        if (player && !player.dead && (!stunEffect || stunEffect.done)) {
                                            player.speed = player.baseSpeed;
                                        }
                                    }, 2000);
                                }
                                player.hull = Math.max(0, player.hull - hullDmg);
                                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                                let hullPercent = player.hull / player.maxHull;
                                let offlineDuration = 5 + (1 - hullPercent) * 25;
                                if (sector === 0) {
                                    if (Math.random() < 0.3) {
                                        if (Math.random() < 0.5) {
                                            player.laserOffline = Math.max(player.laserOffline, offlineDuration);
                                        } else {
                                            player.torpFwdOffline = Math.max(player.torpFwdOffline, offlineDuration);
                                        }
                                    }
                                    if (Math.random() < 0.4) {
                                        player.torpFwdTargetBad = Math.max(player.torpFwdTargetBad, offlineDuration);
                                    }
                                } else if (sector === 2) {
                                    if (Math.random() < 0.3) {
                                        player.torpAftOffline = Math.max(player.torpAftOffline, offlineDuration);
                                    }
                                    if (Math.random() < 0.4) {
                                        player.torpAftTargetBad = Math.max(player.torpAftTargetBad, offlineDuration);
                                    }
                                }
                                el.damaged = true;
                            }
                        }
                    }
                }
            }
        }
        for (let b of bullets) b.update(dt);
        bullets = bullets.filter(b => !b.dead);
        for (let el of enemyLasers) el.update(dt);
        enemyLasers = enemyLasers.filter(el => !el.dead);
        for (let t of torps) t.update(dt);
        for (let t of torps) {
            if (t.dead) continue;
            if (boss && !boss.dead && !boss.invulnerable && Math.hypot(t.x - boss.x, t.y - boss.y) < boss.r) {
                boss.hp -= 60;
                boss.hurtTimer = 0.2; // Trigger hurt flash
                t.dead = true;
                explosions.push(new LargeExplosion(t.x, t.y)); // Large explosion for torpedo-boss hull hit
                if (boss.hp <= 0) {
                    boss.dead = true;
                    explosions.push(new Explosion(boss.x, boss.y));
                    bossActive = false;
                    boss = null;
                    bossTimer = 60;

                    // REVIVAL LOGIC: Revive ALL dead players when boss is defeated
                    // This triggers for whoever kills the boss (host or client)

                    // Revive local player if dead
                    if (player && player.dead) {
                        player.dead = false;
                        player.hull = player.maxHull;
                        player.shield = [player.maxShield, player.maxShield, player.maxShield, player.maxShield];
                        if (typeof MD3 !== 'undefined') MD3.hideDeathBanner();
                        if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                            MenuManager.showToast('🎉 Boss Defeated! You have been revived!');
                        }
                    } else {
                        // Show toast even if not dead
                        if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                            MenuManager.showToast('🎉 Boss Defeated!');
                        }
                    }

                    // In multiplayer, broadcast revival to all (host broadcasts, clients also need to send to host)
                    if (Network.isMultiplayer && Network.connected) {
                        if (Network.isHost) {
                            // Host broadcasts revival to all clients
                            Network.broadcast(Network.MSG.PLAYER_STATE, {
                                playerId: 'REVIVE_ALL',
                                revive: true
                            });
                        } else {
                            // Client notifies host that boss was killed (host will broadcast)
                            Network.sendTo('host', Network.MSG.PLAYER_STATE, {
                                playerId: 'BOSS_KILLED',
                                killedBy: Network.myId
                            });
                        }
                    }
                }
            }
            for (let e of enemies) {
                if (!e.dead && Math.hypot(t.x - e.x, t.y - e.y) < e.r) {
                    e.hp -= 60;
                    t.dead = true;
                    if (e.hp <= 0) {
                        e.dead = true;
                        explosions.push(new LargeExplosion(e.x, e.y)); // Large explosion for torpedo-hull hit

                        // Increment kill counter
                        if (typeof MD3 !== 'undefined') MD3.incrementScore();

                        // Broadcast destruction event
                        if (Network.isMultiplayer && Network.connected) {
                            Network.deleteEntity('enemy_' + e.netId, e.x, e.y);
                        }
                    }
                }
            }
            // Torpedo hit LiquidCrystal shields
            if (boss && boss instanceof LiquidCrystal && boss.shields) {
                for (let s of boss.shields) {
                    if (!s.dead && Math.hypot(t.x - s.x, t.y - s.y) < s.r + 5) {
                        s.dead = true;
                        t.dead = true;
                        explosions.push(new SmallExplosion(s.x, s.y)); // Small explosion for torpedo-shield hit
                    }
                }
            }
            // Torpedo hit LiquidCrystal turrets
            if (boss && boss instanceof LiquidCrystal && boss.turrets) {
                for (let turret of boss.turrets) {
                    if (!turret.dead && Math.hypot(t.x - turret.x, t.y - turret.y) < turret.r) {
                        turret.hp -= 60;
                        t.dead = true;
                        if (turret.hp <= 0) {
                            turret.dead = true;
                            explosions.push(new Explosion(turret.x, turret.y));
                        }
                    }
                }
            }

            // PvP: Check if torpedo hits other players (only if PVP enabled)
            if (Network.isMultiplayer && pvpEnabled && !t.isRemote) {
                for (const [id, rp] of remotePlayers) {
                    if (rp && !rp.dead && Math.hypot(t.x - rp.x, t.y - rp.y) < (rp.r || 30)) {
                        // Send PVP damage to target
                        const hitAngle = Math.atan2(t.y - rp.y, t.x - rp.x);
                        Network.sendPvpDamage(id, 60, t.x, t.y, hitAngle);
                        t.dead = true;
                        explosions.push(new Explosion(t.x, t.y));
                        break;
                    }
                }
            }
        }
        torps = torps.filter(t => !t.dead);
        lasers = lasers.filter(l => l.life-- > 0);
        enemies = enemies.filter(e => !e.dead);

        // Only spawn enemies if enabled (not in peaceful mode)
        if (!bossActive && enemySpawnEnabled) {
            if (enemies.length === 0) {
                if (!Network.isMultiplayer || Network.isHost) {
                    let enemyType = Math.random() < 0.5 ? 'red' : 'blue';
                    let spawnX = Math.random() * gameWidth;
                    let spawnY = Math.random() * gameHeight;
                    let newEnemy = new Ship(spawnX, spawnY, false, enemyType);
                    newEnemy.netId = nextNetEnemyId++;
                    newEnemy.entityId = 'enemy_' + newEnemy.netId;
                    enemies.push(newEnemy);
                    enemySpawnTimer = Math.random() * 5 + 5;

                    // Broadcast entity creation to client
                    if (Network.isMultiplayer && Network.connected) {
                        Network.createEntity(
                            newEnemy.entityId,
                            'ENEMY_SHIP',
                            spawnX, spawnY,
                            newEnemy.angle,
                            enemyType === 'red' ? 'enemyRed' : 'enemyBlue'
                        );
                        Network.entities.set(newEnemy.entityId, newEnemy);
                    }
                }
            } else if (enemies.length < 5) {
                enemySpawnTimer -= dt;
                if (enemySpawnTimer <= 0) {
                    // Only host spawns enemies in multiplayer
                    if (!Network.isMultiplayer || Network.isHost) {
                        let enemyType = Math.random() < 0.5 ? 'red' : 'blue';
                        let spawnX = Math.random() * gameWidth;
                        let spawnY = Math.random() * gameHeight;
                        let newEnemy = new Ship(spawnX, spawnY, false, enemyType);
                        newEnemy.netId = nextNetEnemyId++;
                        newEnemy.entityId = 'enemy_' + newEnemy.netId;
                        enemies.push(newEnemy);
                        enemySpawnTimer = Math.random() * 5 + 5;

                        // Broadcast entity creation to client
                        if (Network.isMultiplayer && Network.connected) {
                            Network.createEntity(
                                newEnemy.entityId,
                                'ENEMY_SHIP',
                                spawnX, spawnY,
                                newEnemy.angle,
                                enemyType === 'red' ? 'enemyRed' : 'enemyBlue'
                            );
                            Network.entities.set(newEnemy.entityId, newEnemy);
                        }
                    }
                }
            }
        }
        for (let ex of explosions) ex.update(dt);
        explosions = explosions.filter(e => e.p.length > 0);

        // Update new visual effects
        for (let g of shieldImpactGlows) g.update(dt);
        shieldImpactGlows = shieldImpactGlows.filter(g => g.life > 0);
        for (let s of sparklerEffects) s.update(dt);
        sparklerEffects = sparklerEffects.filter(s => s.sparks.length > 0);

        healthPackTimer -= dt;
        if (healthPackTimer <= 0 && !gameOver) {
            // Only host spawns health packs in multiplayer
            if (!Network.isMultiplayer || Network.isHost) {
                let margin = 100;
                let x = Math.random() * (gameWidth - margin * 2) + margin;
                let y = Math.random() * (gameHeight - margin * 2) + margin;
                const hp = new HealthPack(x, y);
                hp.netId = nextHealthPackId++;
                healthPacks.push(hp);
                healthPackTimer = Math.random() * 5 + 10;

                // Broadcast to client
                if (Network.isMultiplayer && Network.connected) {
                    Network.sendHealthPackSpawn(x, y, hp.netId);
                }
            }
        }

        // Check Collision: Player vs Enemies (Bounce)
        if (!player.dead) {
            for (let e of enemies) {
                if (e.dead) continue;
                let dist = Math.hypot(e.x - player.x, e.y - player.y);
                if (dist < player.r + e.r) {
                    // Collision!
                    // Apply High Laser Damage (60) to player - always local
                    player.takeDamage(60);

                    // Enemy damage: Host-authoritative in multiplayer
                    if (Network.isMultiplayer && !Network.isHost) {
                        // Client: Report collision to host, don't modify enemy locally
                        // Use entityId if available, fallback to constructing from netId
                        const eid = e.entityId || ('enemy_' + e.netId);
                        Network.sendCollisionEvent(eid, 60, player.x, player.y);
                    } else {
                        // Host or single-player: Process enemy damage normally
                        e.hp -= 60;
                        if (e.hp <= 0 && !e.dead) {
                            e.dead = true;
                            explosions.push(new Explosion(e.x, e.y));
                            if (Network.isHost) Network.deleteEntity(e.entityId);
                        }

                        // Enemy Bounce - only host/single-player calculates
                        let collisionAngle = Math.atan2(e.y - player.y, e.x - player.x);
                        let step = Math.PI / 8;
                        let enemyBounceAngle = Math.round(collisionAngle / step) * step;
                        e.bounceTimer = 7;
                        e.bounceVelX = Math.cos(enemyBounceAngle) * 5;
                        e.bounceVelY = Math.sin(enemyBounceAngle) * 5;
                    }

                    // Player Bounce - always local
                    let collisionAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    let playerBounceAngle = collisionAngle + Math.PI;
                    let step = Math.PI / 8; // 22.5 deg
                    playerBounceAngle = Math.round(playerBounceAngle / step) * step;

                    player.bounceTimer = 7;
                    player.bounceVelX = Math.cos(playerBounceAngle) * 5; // 5px per tick
                    player.bounceVelY = Math.sin(playerBounceAngle) * 5;
                }
            }
        }

        // Host ONLY: Check Remote Players vs Enemies (to bounce enemies)
        if (Network.isHost) {
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) continue;
                for (let e of enemies) {
                    if (e.dead) continue;
                    let dist = Math.hypot(e.x - rp.x, e.y - rp.y);
                    if (dist < 46) { // Approx radius sum
                        // Remote Player logic handles its own damage/bounce.
                        // Host just handles Enemy bounce/damage.
                        e.hp -= 60;
                        if (e.hp <= 0 && !e.dead) {
                            e.dead = true;
                            explosions.push(new Explosion(e.x, e.y));
                            Network.deleteEntity(e.entityId);
                        }

                        let collisionAngle = Math.atan2(e.y - rp.y, e.x - rp.x);
                        let step = Math.PI / 8;
                        let enemyBounceAngle = collisionAngle;
                        enemyBounceAngle = Math.round(enemyBounceAngle / step) * step;

                        e.bounceTimer = 7;
                        e.bounceVelX = Math.cos(enemyBounceAngle) * 5;
                        e.bounceVelY = Math.sin(enemyBounceAngle) * 5;
                    }
                }
            }
        }

        for (let hp of healthPacks) {
            hp.update(dt);

            // Local player pickup
            if (Math.hypot(hp.x - player.x, hp.y - player.y) < hp.r + player.r) {
                let healAmount = player.maxHull * 0.5;
                player.hull = Math.min(player.maxHull, player.hull + healAmount);
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                hp.dead = true;

                for (let i = 0; i < 20; i++) {
                    explosions.push(new Explosion(hp.x, hp.y));
                    explosions[explosions.length - 1].p.forEach(p => {
                        p.color = `hsl(${120 + Math.random() * 60}, 100%, 60%)`;
                        p.dx *= 0.3;
                        p.dy *= 0.3;
                    });
                }

                // Notify network of pickup
                if (Network.isMultiplayer && Network.connected) {
                    Network.sendHealthPackPickup(hp.netId, Network.playerId);
                }
            }

            // Check if remote player picked up (host-only check)
            if (Network.isMultiplayer && Network.isHost && Network.remotePlayer && !Network.remotePlayer.dead) {
                if (Math.hypot(hp.x - Network.remotePlayer.x, hp.y - Network.remotePlayer.y) < hp.r + Network.remotePlayer.r) {
                    hp.dead = true;
                    // Note: remote player heals on their side via shield/hull sync
                }
            }
        }
        healthPacks = healthPacks.filter(hp => !hp.dead);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.draw();
        for (let t of torps) t.draw();
        for (let e of enemies) e.draw();
        for (let hp of healthPacks) hp.draw();
        for (let b of bombs) b.draw();
        if (absorbEffect) absorbEffect.draw();
        if (boss) boss.draw();
        for (let b of bullets) b.draw();
        for (let el of enemyLasers) el.draw();
        for (let lp of lightningParticles) lp.draw();
        if (!player.dead) player.draw();
        // Draw remote players using synchronized look
        if (Network.isMultiplayer) {
            Network.drawRemotePlayers();
        }


        ctx.save();
        ctx.shadowBlur = 10;
        for (let l of lasers) {
            ctx.shadowColor = l.c;
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            ctx.lineTo(l.x2, l.y2);
            ctx.strokeStyle = l.c;
            ctx.lineWidth = l.w;
            ctx.stroke();
        }
        ctx.restore();

        // ===== NETWORK SYNCHRONIZATION (30Hz) =====
        if (Network.isMultiplayer && Network.connected) {
            const now = performance.now();
            if (now - lastNetworkUpdate >= NETWORK_INTERVAL) {
                lastNetworkUpdate = now;

                if (Network.isHost) {
                    Network.broadcastEntityMoves();

                    // Sync boss attack state every 100ms during boss fight
                    if (boss && !boss.dead && boss.isAttacking) {
                        Network.syncBossAttackState();
                    }
                } else {
                    Network.sendClientShipMove();
                }
            }

            // Sync shields/hull and timer less frequently (1Hz)
            if (now - lastShieldSyncTime >= SHIELD_SYNC_INTERVAL) {
                lastShieldSyncTime = now;
                Network.broadcastShieldState();

                // Host syncs timer every second
                if (Network.isHost) {
                    Network.syncTimer(bossTimer);
                }
            }

            // Handle remote laser visuals
            if (remoteLaserActive) {
                // Visualize remote laser
                // Note: Actual logic is handled in weapon fired event
                remoteLaserTimer -= dt;
                if (remoteLaserTimer <= 0) remoteLaserActive = false;
            }
        }

    } catch (err) {
        console.error("LOOOP FATAL:", err);
    }

    requestAnimationFrame(loop);
}
