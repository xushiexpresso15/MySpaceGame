const Network = {
    isMultiplayer: false,
    isHost: false,
    connected: false,

    // PeerJS instance
    peer: null,
    roomId: null,

    // 1-to-N Connections
    // Map<id, { conn: DataConnection, name: string, active: boolean, id: string }>
    connections: new Map(),

    // My Player ID (0 for host, generated UUID/Number for clients)
    myId: null,

    // Remote player data
    remoteShipDesign: null, // Shared design for now

    // Entity tracking
    entities: new Map(),
    nextWeaponId: 1,

    // Previous positions for delta calculation (local)
    lastPlayerX: 0,
    lastPlayerY: 0,

    // Protocol version - must match between host and client
    PROTOCOL_VERSION: 2,

    // Message types (formal API)
    MSG: {
        // Handshake
        CLIENT_HELLO: 'CH',      // Screen size + version + name
        SERVER_CONFIG: 'SC',     // Negotiated game area + host info + player list
        VERSION_MISMATCH: 'VM',  // Version mismatch error

        // Entity Management
        SHIP_SPRITE: 'SS',       // Sprite data
        ENTITY_CREATE: 'EC',     // Create entity
        ENTITY_DELETE: 'ED',     // Delete/destroy entity
        ENTITY_MOVE: 'EM',       // Movement delta (host->client)
        CLIENT_MOVE: 'CM',       // Client ship move (client->host)

        // Combat
        WEAPON_FIRED: 'WF',      // Weapon (laser/torpedo)
        DAMAGE_EVENT: 'DE',      // Damage notification
        ENEMY_BULLET: 'EB',      // Host-spawned enemy bullet
        ENEMY_LASER: 'EL',       // Host-spawned enemy laser
        PVP_DAMAGE: 'PV',        // Player vs Player damage sync
        COLLISION_EVENT: 'CE',   // Client reports collision with enemy/boss to host

        // Player State Sync
        SHIELD_STATE: 'SH',      // Shield values sync
        PLAYER_STATE: 'PS',      // Full player state (HP, shields, position)
        PLAYER_DEATH: 'PD',      // Player destroyed notification
        KILL_SYNC: 'KS',         // Kill count sync

        // Game Modes
        MODE_CHANGE: 'MC',       // COOP/PVP mode toggle
        HEALTH_PACK: 'HP',       // Health pack spawn/pickup

        // Boss Sync
        BOSS_SPAWN: 'BS',        // Boss spawn sync
        SPAWN_BULLET: 'SB',
        SPAWN_BOMB: 'SBO',
        SPAWN_LASER: 'SL',
        SYNC_EFFECT: 'SE',
        BOSS_PHASE: 'BP',
        SUB_ENTITY: 'BSU',       // Boss Sub Unit
        BOSS_ATTACK_STATE: 'BA', // Full boss attack state sync

        // Game Flow
        GAME_START: 'GS',
        GAME_RESTART: 'GR',
        GAME_OVER: 'GO',         // Includes final stats
        RETURN_TO_LOBBY: 'RL',   // Return all players to lobby after game over
        SYNC_TIMER: 'ST',        // Sync survival timer

        // Connection
        PLAYER_JOINED: 'PJ',     // Notify clients of new player
        PLAYER_LEFT: 'PL',       // Notify clients of player disconnect

        // Visual Effects
        EXPLOSION: 'EX',         // Explosion effect sync
        PVP_VICTORY: 'PW',       // PVP victory - one player wins

        // Chat
        CHAT_MESSAGE: 'CTM',     // Chat message broadcast
    },

    // === URL UTILITIES ===

    /**
     * Generate a random room ID (6 chars, alphanumeric)
     */
    generateRoomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * Get the shareable room URL for LAN multiplayer
     * Returns a URL that other players on the same network can use
     */
    getRoomURL() {
        if (!this.roomId) return '';

        // If accessed via file://, show a helpful message
        if (location.protocol === 'file:') {
            return `⚠️ Please use HTTP server, file:// protocol not supported`;
        }

        // Use detected LAN IP if available
        let origin;
        if (this.detectedIP) {
            origin = `http://${this.detectedIP}:${location.port || '8080'}`;
        } else if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            origin = `http://[Detecting...]:${location.port}`;
        } else {
            origin = location.origin;
        }

        return `${origin}${location.pathname}?room=${this.roomId}`;
    },

    /**
     * Get just the room ID for display
     */
    getRoomId() {
        return this.roomId || '';
    },

    /**
     * Detected LAN IP address
     */
    detectedIP: null,

    /**
     * Detect local LAN IP - tries server endpoint first, then WebRTC fallback
     */
    async detectLocalIP() {
        // Already detected
        if (this.detectedIP) {
            console.log('[Network] Using cached IP:', this.detectedIP);
            return this.detectedIP;
        }

        console.log('[Network] Starting IP detection...');

        // Method 1: Try fetching from server /ip endpoint (most reliable)
        try {
            console.log('[Network] Trying /ip endpoint...');
            const response = await fetch('/ip', {
                method: 'GET',
                cache: 'no-cache'
            });
            console.log('[Network] /ip response status:', response.status);
            if (response.ok) {
                const ip = await response.text();
                console.log('[Network] /ip returned:', ip);
                if (ip && ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
                    this.detectedIP = ip;
                    console.log('[Network] ✅ IP from server:', ip);
                    return ip;
                }
            }
        } catch (e) {
            console.log('[Network] ❌ /ip endpoint failed:', e.message);
        }

        // Method 2: WebRTC fallback
        return new Promise((resolve) => {
            const pc = new RTCPeerConnection({ iceServers: [] });
            const ips = new Set();

            pc.createDataChannel('');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));

            pc.onicecandidate = (event) => {
                if (!event || !event.candidate) {
                    pc.close();
                    let bestIP = null;
                    for (const ip of ips) {
                        if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
                            bestIP = ip;
                            break;
                        }
                        if (!bestIP && !ip.startsWith('169.254.')) {
                            bestIP = ip;
                        }
                    }
                    if (bestIP) {
                        this.detectedIP = bestIP;
                        console.log('[Network] IP from WebRTC:', bestIP);
                    }
                    resolve(bestIP);
                    return;
                }

                const candidate = event.candidate.candidate;
                const match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                if (match) {
                    const ip = match[1];
                    if (ip !== '0.0.0.0' && ip !== '127.0.0.1') {
                        ips.add(ip);
                    }
                }
            };

            setTimeout(() => {
                pc.close();
                resolve(this.detectedIP);
            }, 2000);
        });
    },

    /**
     * Check URL for room parameter and auto-join if present
     * Returns: { hasRoom: boolean, roomId: string|null }
     */
    checkURLForRoom() {
        const params = new URLSearchParams(location.search);
        const roomId = params.get('room');
        return { hasRoom: !!roomId, roomId: roomId };
    },

    // === CONNECTION MANAGEMENT (PeerJS) ===

    /**
     * Start as Host - create room and wait for connections
     */
    async startHost() {
        this.isHost = true;
        this.isMultiplayer = true;
        this.myId = 'host';
        this.roomId = this.generateRoomId();

        // Reset game dimensions to current window size (host sets the initial size)
        gameWidth = window.innerWidth;
        gameHeight = window.innerHeight;
        if (typeof resizeGame === 'function') resizeGame();

        return new Promise((resolve, reject) => {
            // PeerJS ID is the room ID for easy connection
            this.peer = new Peer('spacewings-' + this.roomId, {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' }
                    ]
                }
            });

            this.peer.on('open', (id) => {
                console.log('[Network] Host room created:', this.roomId);
                resolve(true);
            });

            this.peer.on('connection', (conn) => {
                console.log('[Network] Incoming connection:', conn.peer);
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('[Network] PeerJS error:', err);
                if (err.type === 'unavailable-id') {
                    // Room ID already taken, generate new one
                    this.roomId = this.generateRoomId();
                    this.peer.destroy();
                    this.startHost().then(resolve).catch(reject);
                } else {
                    reject(err);
                }
            });
        });
    },

    /**
     * Handle incoming connection (Host only)
     */
    handleIncomingConnection(conn) {
        const clientId = 'client_' + Date.now();
        const slot = {
            conn: conn,
            id: clientId,
            name: 'Unknown',
            active: false
        };
        this.connections.set(clientId, slot);

        conn.on('open', () => {
            console.log('[Network] Client connected:', clientId);
            slot.active = true;
            this.updateConnectedState();
        });

        conn.on('data', (data) => {
            this.handleMessage(clientId, data);
        });

        conn.on('close', () => {
            console.log('[Network] Client disconnected:', clientId);
            this.handleDisconnect(clientId);
        });

        conn.on('error', (err) => {
            console.error('[Network] Connection error:', err);
            this.handleDisconnect(clientId);
        });
    },

    /**
     * Join a game as Client using room ID
     */
    async joinRoom(roomId) {
        this.isHost = false;
        this.isMultiplayer = true;
        this.roomId = roomId;
        this.myId = 'client_' + Date.now();

        return new Promise((resolve, reject) => {
            this.peer = new Peer({
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' }
                    ]
                }
            });

            this.peer.on('open', (id) => {
                console.log('[Network] Client peer created, connecting to room:', roomId);

                // Connect to host
                const conn = this.peer.connect('spacewings-' + roomId, {
                    reliable: true
                });

                const hostSlot = {
                    conn: conn,
                    id: 'host',
                    name: 'Host',
                    active: false
                };
                this.connections.set('host', hostSlot);

                conn.on('open', () => {
                    console.log('[Network] Connected to host!');
                    hostSlot.active = true;
                    this.connected = true;
                    this.updateConnectedState();

                    // Send hello
                    this.sendTo('host', this.MSG.CLIENT_HELLO, {
                        name: myPlayerName,
                        screenWidth: canvas.width,
                        screenHeight: canvas.height,
                        protocolVersion: this.PROTOCOL_VERSION
                    });

                    resolve(true);
                });

                conn.on('data', (data) => {
                    this.handleMessage('host', data);
                });

                conn.on('close', () => {
                    console.log('[Network] Disconnected from host');
                    this.handleDisconnect('host');
                });

                conn.on('error', (err) => {
                    console.error('[Network] Connection error:', err);
                    reject(err);
                });
            });

            this.peer.on('error', (err) => {
                console.error('[Network] PeerJS error:', err);
                reject(err);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    },

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.connections.forEach((slot) => {
            if (slot.conn) slot.conn.close();
        });
        this.connections.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connected = false;
        this.isMultiplayer = false;
        this.isHost = false;
        this.roomId = null;
    },

    send(type, data) {
        if (this.isHost) {
            this.broadcast(type, data);
        } else {
            this.sendTo('host', type, data);
        }
    },

    // Legacy methods for backward compatibility (now unused but kept for safety)
    async createConnectionSlot() {
        // No longer needed with PeerJS - return room URL for copying
        return this.getRoomURL();
    },

    async joinGame(offerCode) {
        // Legacy: try to parse as room ID
        return this.joinRoom(offerCode);
    },

    async acceptAnswer(answerCode) {
        // No longer needed with PeerJS
        return true;
    },

    setupDataChannel(dc, connectionId) {
        dc.onopen = () => {
            console.log('Channel open:', connectionId);
            const slot = this.connections.get(connectionId);
            if (slot) slot.active = true;
            this.updateConnectedState();

            // Handshake
            if (!this.isHost) {
                // Client sends Hello
                this.sendTo(connectionId, this.MSG.CLIENT_HELLO, {
                    name: myPlayerName,
                    screenWidth: canvas.width,
                    screenHeight: canvas.height,
                    protocolVersion: 1
                });
            }
        };
        dc.onclose = () => {
            console.log('Channel closed:', connectionId);
            const slot = this.connections.get(connectionId);
            if (slot) slot.active = false;
            this.handleDisconnect(connectionId);
        };
        dc.onmessage = (e) => {
            this.handleMessage(connectionId, JSON.parse(e.data));
        };
    },

    updateConnectedState() {
        // Connected if at least one slot is active
        this.connected = false;
        for (let slot of this.connections.values()) {
            if (slot.active) this.connected = true;
        }

        // Update UI hooks
        if (typeof updateLobbyUI === 'function') updateLobbyUI();
    },

    handleDisconnect(id) {
        // Get player name before removing
        const slot = this.connections.get(id);
        const leftPlayerName = slot ? slot.name : 'A player';
        const rp = remotePlayers.get(id);
        const rpName = rp ? rp.name : leftPlayerName;

        this.connections.delete(id);
        remotePlayers.delete(id);

        if (this.isHost) {
            // Notify other clients
            this.broadcast(this.MSG.PLAYER_LEFT, { id: id, name: rpName });

            // Show leave toast
            if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                MenuManager.showToast(`${rpName} has left the game`);
            }
        } else {
            // Show leave toast for client too
            if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                MenuManager.showToast(`${rpName} has left the game`);
            }

            // If Host disc, go back to menu
            if (id === 'host') {
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('Host Disconnected!');
                }
                setTimeout(() => {
                    if (typeof MenuManager !== 'undefined') {
                        MenuManager.transitionTo('MP_MENU');
                        gameState = 'MP_MENU';
                    }
                }, 2000);
            }
        }

        this.updateConnectedState();

        // Update party HUD
        updatePartyHUD();
    },

    // === MESSAGING ===

    // Send to specific internal ID
    sendTo(id, type, data) {
        const slot = this.connections.get(id);
        if (slot && slot.conn && slot.conn.open) {
            slot.conn.send({ msg: type, data: data });
        }
    },

    // Broadcast to ALL (Host -> Clients)
    broadcast(type, data, excludeId = null) {
        for (let [id, slot] of this.connections) {
            if (id !== excludeId && slot.conn && slot.conn.open) {
                slot.conn.send({ msg: type, data: data });
            }
        }
    },

    handleMessage(senderId, msg) {
        const data = msg.data;
        switch (msg.msg) {
            case this.MSG.CLIENT_HELLO:
                this.handleClientHello(senderId, data);
                break;
            case this.MSG.SERVER_CONFIG:
                this.handleServerConfig(data);
                break;
            case this.MSG.PLAYER_JOINED:
                if (!this.isHost) this.handlePlayerJoined(data);
                break;
            case this.MSG.SHIP_SPRITE:
                this.handleShipSprite(senderId, data);
                break;
            case this.MSG.ENTITY_CREATE:
                if (!this.isHost) this.handleEntityCreate(data);
                break;
            case this.MSG.ENTITY_MOVE:
                if (!this.isHost) this.handleEntityMove(data);
                break;
            case this.MSG.ENTITY_DELETE:
                if (!this.isHost) this.handleEntityDelete(data);
                break;
            case this.MSG.CLIENT_MOVE:
                if (this.isHost) this.handleClientMove(senderId, data);
                break;
            case this.MSG.WEAPON_FIRED:
                this.handleWeaponFired(senderId, data);
                break;
            case this.MSG.DAMAGE_EVENT:
                this.handleDamageEvent(data);
                break;
            case this.MSG.ENEMY_BULLET:
                // Client receives enemy bullet from Host
                if (!this.isHost) {
                    bullets.push(new Bullet(data.x, data.y, data.angle));
                }
                break;
            case this.MSG.ENEMY_LASER:
                // Client receives enemy laser from Host
                if (!this.isHost) {
                    enemyLasers.push(new EnemyLaser(data.x, data.y, data.angle));
                }
                break;
            case this.MSG.HEALTH_PACK:
                this.handleHealthPack(senderId, data);
                break;
            case this.MSG.BOSS_SPAWN:
                this.handleBossSpawn(data);
                break;
            case this.MSG.SHIELD_STATE:
                this.handleShieldState(data);
                break;
            case this.MSG.PLAYER_STATE:
                this.handlePlayerState(data);
                break;
            case this.MSG.PLAYER_DEATH:
                // If Host received from client, relay to all other clients
                if (this.isHost) {
                    this.broadcast(this.MSG.PLAYER_DEATH, data, senderId);
                }
                this.handlePlayerDeath(data);
                break;
            case this.MSG.KILL_SYNC:
                this.handleKillSync(data);
                break;
            case this.MSG.VERSION_MISMATCH:
                this.handleVersionMismatch(data);
                break;
            case this.MSG.GAME_START:
                if (!this.isHost) {
                    console.log('[Network] Received GAME_START from host');

                    // Apply settings from host
                    if (typeof pvpEnabled !== 'undefined' && data.pvpEnabled !== undefined) {
                        pvpEnabled = data.pvpEnabled;
                    }
                    if (typeof enemySpawnEnabled !== 'undefined' && data.enemySpawnEnabled !== undefined) {
                        enemySpawnEnabled = data.enemySpawnEnabled;
                    }

                    // Reset ALL remote players to alive state
                    for (let [id, rp] of remotePlayers) {
                        rp.dead = false;
                        rp.hull = rp.maxHull || 100;
                    }

                    // Reset local player
                    if (typeof player !== 'undefined' && player) {
                        player.dead = false;
                        player.hull = player.maxHull || 100;
                    }

                    // Reset game over state
                    if (typeof gameOver !== 'undefined') gameOver = false;

                    startMultiplayerGame();
                }
                break;
            case this.MSG.GAME_RESTART:
                console.log('[Network] Received GAME_RESTART from host');
                // Reset remote players' dead status
                if (typeof remotePlayers !== 'undefined') {
                    for (let [id, rp] of remotePlayers) {
                        rp.dead = false;
                        rp.hull = rp.maxHull || 100;
                    }
                }
                // Hide death banner and reset UI if shown
                if (typeof MD3 !== 'undefined') {
                    MD3.hideDeathBanner();
                    MD3.resetUI();
                }
                // Reset game UI and state
                if (typeof resetGameUI === 'function') resetGameUI();
                restartGame();
                // Ensure game state is set to PLAYING
                if (typeof gameState !== 'undefined') gameState = 'PLAYING';
                // Hide any overlays
                if (typeof MenuManager !== 'undefined') MenuManager.hideAll();
                // Show HUD
                const hud = document.getElementById('md3-hud');
                if (hud) hud.classList.remove('md3-hidden');
                const partyHud = document.getElementById('md3-party-hud');
                if (partyHud) partyHud.classList.remove('md3-hidden');
                // Update party HUD
                if (typeof updatePartyHUD === 'function') updatePartyHUD();
                // Show connection status toast
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('🔄 Game Restarted - Connected');
                }
                // Immediately sync position with host so spawn positions are correct
                // This ensures host sees client at right-side spawn position
                this.sendClientShipMove();
                break;
            case this.MSG.GAME_OVER:
                this.handleGameOver(data);
                break;
            // Boss Sync
            case this.MSG.SPAWN_BULLET:
                bullets.push(new Bullet(data.x, data.y, data.angle));
                break;
            case this.MSG.SPAWN_BOMB:
                let b = new Bomb(data.x, data.y, data.targetX, data.targetY);
                if (data.isScatter) b.isScatter = true;
                bombs.push(b);
                break;
            case this.MSG.SPAWN_LASER:
                enemyLasers.push(new EnemyLaser(data.x, data.y, data.angle));
                break;
            case this.MSG.SYNC_EFFECT:
                this.handleSyncEffect(data);
                break;
            case this.MSG.BOSS_PHASE:
                if (boss) {
                    boss.hp = data.hp;
                    boss.phase = data.phase;
                }
                break;
            case this.MSG.SUB_ENTITY:
                this.handleSubEntity(data);
                break;
            case this.MSG.RETURN_TO_LOBBY:
                this.handleReturnToLobby(data);
                break;
            case this.MSG.SYNC_TIMER:
                if (!this.isHost && typeof bossTimer !== 'undefined') {
                    bossTimer = data.time;
                }
                break;
            case this.MSG.BOSS_ATTACK_STATE:
                this.handleBossAttackState(data);
                break;
            case this.MSG.PVP_DAMAGE:
                this.handlePvpDamage(data);
                break;
            case this.MSG.COLLISION_EVENT:
                if (this.isHost) this.handleCollisionEvent(senderId, data);
                break;
            case this.MSG.EXPLOSION:
                // If Host received from client, relay to all other clients and show locally
                if (this.isHost) {
                    this.broadcast(this.MSG.EXPLOSION, data, senderId);
                    // Also create explosion on host
                    if (data.type === 'LARGE') {
                        explosions.push(new LargeExplosion(data.x, data.y));
                    } else {
                        explosions.push(new Explosion(data.x, data.y));
                    }
                } else {
                    // Client receives explosion effect from host
                    if (data.type === 'LARGE') {
                        explosions.push(new LargeExplosion(data.x, data.y));
                    } else {
                        explosions.push(new Explosion(data.x, data.y));
                    }
                }
                break;
            case this.MSG.PVP_VICTORY:
                this.handlePVPVictory(data);
                break;
            case this.MSG.CHAT_MESSAGE:
                // Relay chat messages and display them
                if (this.isHost) {
                    // Host relays to all clients except sender
                    this.broadcast(this.MSG.CHAT_MESSAGE, data, senderId);
                }
                // Display the message locally
                if (typeof ChatSystem !== 'undefined' && ChatSystem.receiveMessage) {
                    ChatSystem.receiveMessage(senderId, data.sender, data.text);
                }
                break;
        }
    },

    handleSubEntity(data) {
        if (!boss) return;
        if (data.entityType === 'SHIELD') {
            if (data.action === 'SPAWN') {
                // Determine if LiquidCrystal
                if (boss.shields) {
                    boss.shields.push(new CrystalShield(boss, data.index, data.total));
                }
            } else if (data.action === 'DEATH') {
                if (boss.shields) {
                    let idx = boss.shields.findIndex(s => s.index === data.index);
                    if (idx !== -1) boss.shields.splice(idx, 1);
                }
            }
        } else if (data.entityType === 'TURRET') {
            if (data.action === 'SPAWN') {
                if (boss.turrets) {
                    let t = new LaserTurret(data.x, data.y, boss);
                    t.netId = data.id;
                    boss.turrets.push(t);
                }
            } else if (data.action === 'DEATH') {
                if (boss.turrets) {
                    let idx = boss.turrets.findIndex(t => t.netId === data.id);
                    if (idx !== -1) boss.turrets.splice(idx, 1);
                }
            }
        } else if (data.entityType === 'CRYSTAL_BOMB') {
            // Treated as projectile but owned by boss arrays
            if (boss.crystalBombs) {
                boss.crystalBombs.push(new CrystalBomb(data.x, data.y, data.angle));
            }
        } else if (data.entityType === 'HOMING_ORB') {
            if (boss.homingOrbs) {
                boss.homingOrbs.push(new HomingOrb(data.x, data.y));
            }
        }
    },

    broadcastSubEntity(data) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.SUB_ENTITY, data);
    },

    broadcastBossAttack(type, data) {
        if (!this.isHost) return;
        this.broadcast(type, data);
    },

    handleSyncEffect(data) {
        if (data.type === 'LIGHTNING') {
            lightningParticles.push(new LightningParticle(data.x, data.y));
        } else if (data.type === 'ABSORB') {
            // Visual only, logic handled by state
            absorbEffect = new AbsorbEffect([], data.x, data.y); // Empty enemies list for client visual
        } else if (data.type === 'STUN') {
            if (!stunEffect) stunEffect = new StunEffect();
            player.speed = 0;
            setTimeout(() => { if (player) player.speed = player.baseSpeed; }, data.duration * 1000);
        } else if (data.type === 'VOID_PULL') {
            if (boss) {
                boss.voidPullActive = true;
                boss.voidPullTimer = data.duration;
            }
        } else if (data.type === 'HARVEST_BEAM') {
            // Visual effect for Soul Harvest
            if (boss) {
                // Creating a visual-only beam logic on client would require more code insertion
                // For now, simpler particle bursts at player
                explosions.push(new Explosion(player.x, player.y)); // Placeholder visual
            }
        }
    },

    // === HANDSHAKING ===

    handleClientHello(senderId, data) {
        if (!this.isHost) return;

        const slot = this.connections.get(senderId);
        if (slot) {
            slot.name = data.name || 'Player';
            // Init remote player entity
            this.createRemotePlayer(senderId, slot.name);

            // Negotiate Size
            gameWidth = Math.min(gameWidth, data.screenWidth);
            gameHeight = Math.min(gameHeight, data.screenHeight);

            // Send Config (exclude the joining player from existingPlayers to avoid duplicates)
            this.sendTo(senderId, this.MSG.SERVER_CONFIG, {
                yourId: senderId,  // Tell client their assigned ID
                gameWidth: gameWidth,
                gameHeight: gameHeight,
                hostName: myPlayerName,
                hostId: 'host_0', // Host is always 0 effectively
                existingPlayers: Array.from(remotePlayers.entries())
                    .filter(([rid, rp]) => rid !== senderId) // Don't include the joining player
                    .map(([rid, rp]) => ({
                        id: rid,
                        name: rp.name,
                        x: rp.x,
                        y: rp.y
                    }))
            });

            // Notify others
            this.broadcast(this.MSG.PLAYER_JOINED, {
                id: senderId,
                name: slot.name
            }, senderId);

            // Send standard sprites
            this.sendAllSprites(senderId);
        }
    },

    handleServerConfig(data) {
        if (this.isHost) return;

        // Use the ID assigned by host (critical for player death sync!)
        if (data.yourId) {
            this.myId = data.yourId;
            console.log('[Network] Server assigned ID:', this.myId);
        }

        gameWidth = data.gameWidth;
        gameHeight = data.gameHeight;
        resizeGame();

        // Create Host
        this.createRemotePlayer('host', data.hostName || 'Host');

        // Create existing peers
        if (data.existingPlayers) {
            if (data.existingPlayers) {
                for (let p of data.existingPlayers) {
                    if (p.id === this.myId) continue; // Don't add myself as remote
                    this.createRemotePlayer(p.id, p.name, p.x, p.y);
                }
            }
        }

        // Send my sprites
        this.sendAllSprites('host');
    },

    handlePlayerJoined(data) {
        this.createRemotePlayer(data.id, data.name);
        // Show notification?
        console.log("Player joined:", data.name);
        if (typeof showClipboardFeedback === 'function') showClipboardFeedback(data.name + ' Joined!');
    },

    // Shield color palette for remote players (distinct hues)
    playerColors: [
        { h: 200, s: 100, l: 60, name: 'Cyan' },      // Player 1: Cyan
        { h: 280, s: 100, l: 65, name: 'Purple' },    // Player 2: Purple
        { h: 40, s: 100, l: 55, name: 'Orange' },     // Player 3: Orange
        { h: 320, s: 100, l: 60, name: 'Pink' },      // Player 4: Pink
        { h: 160, s: 100, l: 50, name: 'Teal' },      // Player 5: Teal
        { h: 60, s: 100, l: 50, name: 'Yellow' },     // Player 6: Yellow
    ],
    nextPlayerColorIndex: 0,

    createRemotePlayer(id, name, x, y) {
        let rp = remotePlayers.get(id);
        if (rp) return;

        // Assign unique color to this player
        const colorIdx = this.nextPlayerColorIndex % this.playerColors.length;
        const color = this.playerColors[colorIdx];
        this.nextPlayerColorIndex++;

        rp = {
            entityId: id,
            name: name,
            x: x || gameWidth / 2,
            y: y || gameHeight / 2,
            angle: -Math.PI / 2,
            hull: 100, maxHull: 100,
            shield: [150, 150, 150, 150],
            maxShield: 150,
            shR: 46, // Shield radius (same as player)
            r: 23,   // Core radius
            hits: [],
            dead: false,
            isRemote: true,
            shieldColor: color, // Unique color for this player
            shieldColorStr: `hsl(${color.h}, ${color.s}%, ${color.l}%)`
        };
        remotePlayers.set(id, rp);
        if (typeof updateLobbyUI === 'function') updateLobbyUI();

        console.log(`[Network] Remote player ${name} assigned color: ${color.name}`);
    },

    // === GAME LOGIC PROXY ===

    handleClientMove(senderId, data) {
        const rp = remotePlayers.get(senderId);
        if (rp) {
            rp.x = data.x;
            rp.y = data.y;
            rp.angle = data.angle * Math.PI / 180;
            // Sync bounce state
            rp.bounceTimer = data.bounceTimer || 0;
            rp.bounceVelX = data.bounceVelX || 0;
            rp.bounceVelY = data.bounceVelY || 0;
            if (data.dead && !rp.dead) {
                rp.dead = true;
                explosions.push(new Explosion(rp.x, rp.y));
            }
            // Broadcast this move to OTHER clients so they see each other
            this.broadcast(this.MSG.ENTITY_MOVE, {
                entityId: senderId,
                x: rp.x, y: rp.y, angle: data.angle, dead: rp.dead,
                bounceTimer: rp.bounceTimer,
                bounceVelX: rp.bounceVelX,
                bounceVelY: rp.bounceVelY
            }, senderId);
        }
    },

    handleEntityMove(data) {
        // Update generic entities (Enemies, Boss)
        if (this.entities.has(data.entityId)) {
            const e = this.entities.get(data.entityId);

            // Skip updates for dead entities - prevent frozen entity issues
            if (e.dead) {
                // If host is telling us it's dead, just confirm and skip
                if (data.dead) return;
                // Otherwise ignore updates to prevent desync
                return;
            }

            e.x = data.x; e.y = data.y;
            e.angle = data.angle * Math.PI / 180;
            // Sync laser charging animation
            if (data.c !== undefined) {
                e.laserCharging = !!data.c;
                if (data.ca !== undefined) e.chargeAngle = data.ca * Math.PI / 180;
                if (data.ct !== undefined) e.chargeTime = data.ct;
            }
            // Sync HP so clients can see damage from collisions
            if (data.hp !== undefined) e.hp = data.hp;
            if (data.dead && !e.dead) {
                e.dead = true;
                explosions.push(new Explosion(e.x, e.y));
            }
            return;
        }


        // Update Boss
        if (data.entityId === 'boss' && boss) {
            boss.x = data.x; boss.y = data.y;
            boss.angle = data.angle * Math.PI / 180;
            if (data.c !== undefined) {
                boss.laserCharging = !!data.c;
                if (data.ca !== undefined) boss.chargeAngle = data.ca * Math.PI / 180;
                if (data.ct !== undefined) boss.chargeTime = data.ct;
            }
            if (data.phase !== undefined) boss.phase = data.phase;
            if (data.hp !== undefined) boss.hp = data.hp;
            if (data.dead && !boss.dead) {
                boss.dead = true;
                bossActive = false;
                explosions.push(new Explosion(boss.x, boss.y));
            }
            return;
        }

        // Update Remote Players (Host or other Clients)
        const rp = remotePlayers.get(data.entityId);
        if (rp) {
            rp.x = data.x; rp.y = data.y; rp.angle = data.angle * Math.PI / 180;
            // Sync bounce state
            if (data.bounceTimer !== undefined) rp.bounceTimer = data.bounceTimer;
            if (data.bounceVelX !== undefined) rp.bounceVelX = data.bounceVelX;
            if (data.bounceVelY !== undefined) rp.bounceVelY = data.bounceVelY;
            if (data.dead && !rp.dead) {
                rp.dead = true;
                explosions.push(new Explosion(rp.x, rp.y));
            }
        }
    },

    /**
     * Handle entity deletion (enemy death) on client
     */
    handleEntityDelete(data) {
        if (this.isHost) return;

        const entityId = data.entityId;

        // Remove enemy from array - try entityId first, then fallback to netId parsing
        let enemyIdx = enemies.findIndex(e => e.entityId === entityId);

        // Fallback: if not found by entityId, try matching by netId
        if (enemyIdx === -1) {
            const netIdMatch = entityId.match(/enemy_(\d+)/);
            if (netIdMatch) {
                const netId = parseInt(netIdMatch[1]);
                enemyIdx = enemies.findIndex(e => e.netId === netId);
            }
        }

        if (enemyIdx !== -1) {
            const enemy = enemies[enemyIdx];
            // Note: Explosion is now sent via separate EXPLOSION message, not created here
            enemies.splice(enemyIdx, 1);
        }

        // Remove from entities map
        this.entities.delete(entityId);
    },

    handleWeaponFired(senderId, data) {
        // If Host received, rebroadcast to others
        if (this.isHost) {
            this.broadcast(this.MSG.WEAPON_FIRED, data, senderId);
        }

        if (data.weaponType === 'TORPEDO') {
            const t = new Torpedo(data.x, data.y, data.angle, true);
            t.isRemote = true;
            t.weaponId = data.weaponId;
            torps.push(t);
        } else if (data.weaponType === 'LASER') {
            // We need to know who fired to attach visual
            let origin = remotePlayers.get(data.shooterEntityId);

            // Fallback if we can't map ID perfectly (1:1 assumptions in old code)
            // Just trigger generic remote laser
            remoteLaserActive = true;
            remoteLaserData = { a: data.angle, x: data.x, y: data.y };
            remoteLaserTimer = 0.5;
        }
    },

    // Simplified sprite sending
    sendAllSprites(targetId) {
        // Just send player sprites for now
        for (let i = 0; i < ROTATION_STEPS; i++) {
            this.sendTo(targetId, this.MSG.SHIP_SPRITE, {
                rotationIndex: i,
                imageData: playerImgs[i].toDataURL('image/png'),
                role: 'PLAYER'
            });
        }
    },

    handleShipSprite(senderId, data) {
        if (!this.remoteShipDesign) this.remoteShipDesign = [];
        // Just storing one design for all remotes for simplicity currently
        // Ideally Map<id, sprites[]>
        const img = new Image();
        img.onload = () => {
            this.remoteShipDesign[data.rotationIndex] = img;
        };
        img.src = data.imageData;
    },

    createEntity(entityId, type, x, y, angle, shipId) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.ENTITY_CREATE, {
            entityId: entityId,
            entityType: type,
            x: x, y: y, angle: angle,
            shipId: shipId
        });
    },

    deleteEntity(entityId) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.ENTITY_DELETE, { entityId: entityId });
        this.entities.delete(entityId);
    },

    /**
     * Broadcast explosion effect to all clients AND create locally
     * Works for both Host and Client:
     * - Host broadcasts to all clients
     * - Client sends to host who relays to other clients
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} type - 'NORMAL' or 'LARGE'
     */
    broadcastExplosion(x, y, type = 'NORMAL') {
        if (!this.connected) return;
        this.send(this.MSG.EXPLOSION, { x: x, y: y, type: type });

        // IMPORTANT: Also create explosion locally so broadcaster sees it
        if (type === 'LARGE') {
            if (typeof LargeExplosion !== 'undefined') explosions.push(new LargeExplosion(x, y));
        } else {
            if (typeof Explosion !== 'undefined') explosions.push(new Explosion(x, y));
        }
    },

    /**
     * Sync all enemy positions from Host to Clients
     * Call this periodically from the game loop
     */
    syncEnemies() {
        if (!this.isHost || !this.connected) return;

        for (const e of enemies) {
            // Handle dead enemies - broadcast delete if not already notified
            if (e.dead) {
                if (!e.deathNotified) {
                    this.broadcast(this.MSG.ENTITY_DELETE, { entityId: e.entityId || ('enemy_' + e.netId) });
                    e.deathNotified = true;
                }
                continue;
            }

            this.broadcast(this.MSG.ENTITY_MOVE, {
                entityId: 'enemy_' + e.netId,
                x: e.x,
                y: e.y,
                angle: e.angle * 180 / Math.PI,
                c: e.laserCharging ? 1 : 0,
                ca: e.chargeAngle ? e.chargeAngle * 180 / Math.PI : 0, // charge angle for aiming animation
                ct: e.chargeTime || 0, // charge time remaining
                hp: e.hp, // Sync HP so clients can see damage
                dead: e.dead
            });
        }

        // Also sync boss position and state
        if (boss && !boss.dead) {
            this.broadcast(this.MSG.ENTITY_MOVE, {
                entityId: 'boss',
                x: boss.x,
                y: boss.y,
                angle: boss.angle * 180 / Math.PI,
                c: boss.laserCharging ? 1 : 0,
                ca: boss.chargeAngle ? boss.chargeAngle * 180 / Math.PI : 0,
                ct: boss.chargeTime || 0,
                phase: boss.phase || 0,
                hp: boss.hp,
                dead: boss.dead
            });
        }
    },

    // Entity Create/Delete (Host -> Clients)
    handleEntityCreate(data) {
        if (data.entityType === 'ENEMY_SHIP') {
            const enemy = new Ship(data.x, data.y, false, data.shipId === 'enemyRed' ? 'red' : 'blue');
            // FIX: Set both entityId and netId correctly
            enemy.entityId = data.entityId;  // e.g., "enemy_1"
            // Extract numeric netId from entityId string
            const netIdMatch = data.entityId.match(/enemy_(\d+)/);
            enemy.netId = netIdMatch ? parseInt(netIdMatch[1]) : 0;
            enemy.angle = data.angle * Math.PI / 180;
            enemies.push(enemy);
            this.entities.set(data.entityId, enemy);
        }
    },

    fireWeapon(type, x, y, angle) {
        const payload = {
            shooterEntityId: this.myId,
            weaponType: type,
            weaponId: 'w_' + this.nextWeaponId++,
            x: x, y: y, angle: angle
        };

        if (this.isHost) {
            this.broadcast(this.MSG.WEAPON_FIRED, payload);
        } else {
            this.sendTo('host', this.MSG.WEAPON_FIRED, payload);
        }
    },

    // =========================================================================
    // MISSING NETWORK FUNCTIONS (Now Implemented)
    // =========================================================================

    /**
     * Send enemy bullet spawn (Host → Client)
     */
    sendEnemyBullet(x, y, angle) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.ENEMY_BULLET, { x, y, angle });
    },

    /**
     * Send enemy laser spawn (Host → Client)
     */
    sendEnemyLaser(x, y, angle) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.ENEMY_LASER, { x, y, angle });
    },

    /**
     * Send health pack spawn (Host → Client)
     */
    sendHealthPackSpawn(x, y, netId) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.HEALTH_PACK, { action: 'SPAWN', x, y, netId });
    },

    /**
     * Send health pack pickup notification
     */
    sendHealthPackPickup(netId, playerId) {
        const payload = { action: 'PICKUP', netId, playerId };
        if (this.isHost) {
            this.broadcast(this.MSG.HEALTH_PACK, payload);
        } else {
            this.sendTo('host', this.MSG.HEALTH_PACK, payload);
        }
    },

    /**
     * Send boss spawn (Host → Client)
     */
    sendBossSpawn(bossType, x, y) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.BOSS_SPAWN, { bossType, x, y });
    },

    broadcastShieldState() {
        const payload = {
            entityId: this.myId,
            hull: player.hull,
            maxHull: player.maxHull,
            shield: player.shield,
            // Include hits for glow effect sync
            hits: player.hits ? player.hits.map(h => ({ angle: h.angle, sector: h.sector, life: h.life })) : []
        };

        if (this.isHost) {
            this.broadcast(this.MSG.SHIELD_STATE, payload);
        } else {
            this.sendTo('host', this.MSG.SHIELD_STATE, payload);
        }
    },

    handleShieldState(data) {
        const rp = remotePlayers.get(data.entityId);
        if (rp) {
            rp.hull = data.hull;
            rp.maxHull = data.maxHull;
            rp.shield = data.shield;
            // Sync hits for glow effect
            if (data.hits && data.hits.length > 0) {
                rp.hits = data.hits;
            }
        }
    },

    // === BROADCAST LOOP ===
    broadcastEntityMoves() {
        if (!this.isHost) return;

        // Host Move (including bounce state)
        this.broadcast(this.MSG.ENTITY_MOVE, {
            entityId: 'host',
            x: player.x, y: player.y, angle: player.angle * 180 / Math.PI, dead: player.dead,
            bounceTimer: player.bounceTimer || 0,
            bounceVelX: player.bounceVelX || 0,
            bounceVelY: player.bounceVelY || 0
        });

        // Enemies
        for (const e of enemies) {
            if (e.dead) continue;
            this.broadcast(this.MSG.ENTITY_MOVE, {
                entityId: e.entityId,
                x: e.x, y: e.y, angle: e.angle * 180 / Math.PI
            });
        }
    },

    sendClientShipMove() {
        if (this.isHost) return;
        // Client sends to Host (including bounce state)
        this.sendTo('host', this.MSG.CLIENT_MOVE, {
            x: player.x, y: player.y, angle: player.angle * 180 / Math.PI, dead: player.dead,
            bounceTimer: player.bounceTimer || 0,
            bounceVelX: player.bounceVelX || 0,
            bounceVelY: player.bounceVelY || 0
        });
    },

    drawRemotePlayers() {
        // Iterate all remote players
        for (let [id, rp] of remotePlayers) {
            if (rp.dead) continue;

            // Draw Ship
            const sprites = this.remoteShipDesign || playerImgs;
            let idx = spriteIdx(rp.angle);
            if (sprites && sprites[idx]) {
                ctx.save();
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#00f';
                ctx.drawImage(sprites[idx], rp.x - SHIP_SIZE / 2, rp.y - SHIP_SIZE / 2, SHIP_SIZE, SHIP_SIZE);

                // Name Tag
                ctx.fillStyle = '#fff';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.shadowBlur = 4;
                ctx.fillText(rp.name, rp.x, rp.y - 50);

                // Health Bar (above name)
                const hullPercent = (rp.hull || 100) / (rp.maxHull || 100);
                const barWidth = 50;
                const barHeight = 4;
                const barX = rp.x - barWidth / 2;
                const barY = rp.y - 62;

                // Background
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

                // HP fill with color based on percentage
                if (hullPercent > 0.5) {
                    ctx.fillStyle = '#0f0'; // Green
                } else if (hullPercent > 0.25) {
                    ctx.fillStyle = '#fa0'; // Orange
                } else {
                    ctx.fillStyle = '#f00'; // Red
                }
                ctx.fillRect(barX, barY, barWidth * Math.max(0, hullPercent), barHeight);

                ctx.restore();
            }

            // Draw Shields with unique player color
            const p = rp;
            const shieldColor = p.shieldColor || { h: 200, s: 100, l: 60 };
            const shR = p.shR || 46;

            ctx.save();

            // Draw each shield segment with player's unique color
            for (let i = 0; i < 4; i++) {
                let startAng = i * Math.PI / 2 - Math.PI / 4 + p.angle;
                let endAng = startAng + Math.PI / 2;

                if (p.shield[i] > 0) {
                    // Active shield with player's unique color glow
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = `hsla(${shieldColor.h}, ${shieldColor.s}%, ${shieldColor.l}%, 0.8)`;
                    ctx.strokeStyle = `hsla(${shieldColor.h}, ${shieldColor.s}%, ${shieldColor.l}%, 0.5)`;
                    ctx.lineWidth = 3;
                } else {
                    // Broken shield - red indicator
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = 'rgba(255,100,100,0.5)';
                    ctx.strokeStyle = 'rgba(255,100,100,.5)';
                    ctx.lineWidth = 2;
                }
                ctx.beginPath();
                ctx.arc(p.x, p.y, shR, startAng, endAng);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Draw shield hits with player's color
            if (p.hits && p.hits.length > 0) {
                for (let i = p.hits.length - 1; i >= 0; i--) {
                    p.hits[i].life -= 0.05;
                    if (p.hits[i].life <= 0) p.hits.splice(i, 1);
                }

                ctx.save(); // Isolate clip region
                ctx.globalCompositeOperation = "lighter";
                ctx.beginPath();
                ctx.arc(p.x, p.y, shR, 0, 2 * Math.PI);
                ctx.clip();

                for (let h of p.hits) {
                    if (p.shield[h.sector] <= 0) continue;
                    let ix = p.x + Math.cos(h.angle) * shR;
                    let iy = p.y + Math.sin(h.angle) * shR;
                    let gr = ctx.createRadialGradient(ix, iy, 0, ix, iy, 60);
                    // Use player's unique color for the hit glow
                    gr.addColorStop(0, `rgba(255,255,255,${h.life})`);
                    gr.addColorStop(.3, `hsla(${shieldColor.h}, ${shieldColor.s}%, ${shieldColor.l}%, ${h.life * .8})`);
                    gr.addColorStop(1, `hsla(${shieldColor.h}, ${shieldColor.s}%, 30%, 0)`);
                    ctx.fillStyle = gr;
                    ctx.fillRect(ix - 60, iy - 60, 120, 120);
                }
                ctx.restore(); // Restore from clip
            }
            ctx.globalCompositeOperation = "source-over"; // Reset composite operation
            ctx.restore();
        }
    },

    // =========================================================================
    // NEW SYNC HANDLERS
    // =========================================================================

    /**
     * Handle full player state sync (HP, shields, position)
     */
    handlePlayerState(data) {
        const rp = remotePlayers.get(data.playerId);
        if (rp) {
            rp.hull = data.hull;
            rp.maxHull = data.maxHull;
            rp.shield = data.shield;
            rp.x = data.x;
            rp.y = data.y;
            rp.angle = data.angle * Math.PI / 180;
            rp.dead = data.dead;
            rp.kills = data.kills || 0;
        }

        // Handle REVIVE_ALL special message (boss killed = revive all dead players)
        if (data.playerId === 'REVIVE_ALL' && data.revive) {
            // CRITICAL: Revive ALL remote players so they become visible again
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) {
                    rp.dead = false;
                    rp.hull = rp.maxHull || 100;
                    // Reset shields
                    rp.shield = [rp.maxShield || 150, rp.maxShield || 150, rp.maxShield || 150, rp.maxShield || 150];
                }
            }

            // Revive local player if dead
            if (typeof player !== 'undefined' && player && player.dead) {
                player.dead = false;
                player.hull = player.maxHull;
                player.shield = [player.maxShield, player.maxShield, player.maxShield, player.maxShield];

                // Hide death banner
                if (typeof MD3 !== 'undefined') MD3.hideDeathBanner();

                // Show revival toast
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('🎉 You have been revived! (Boss Defeated)');
                }
            } else {
                // Show boss defeated toast even if not dead
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('🎉 Boss Defeated!');
                }
            }

            // Update party HUD to show all revived players
            if (typeof updatePartyHUD === 'function') updatePartyHUD();
        }

        // Handle BOSS_KILLED from client (host should broadcast REVIVE_ALL to everyone)
        if (data.playerId === 'BOSS_KILLED' && this.isHost) {
            // Revive ALL remote players on host side
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) {
                    rp.dead = false;
                    rp.hull = rp.maxHull || 100;
                    rp.shield = [rp.maxShield || 150, rp.maxShield || 150, rp.maxShield || 150, rp.maxShield || 150];
                }
            }

            // Revive host if dead
            if (typeof player !== 'undefined' && player && player.dead) {
                player.dead = false;
                player.hull = player.maxHull;
                player.shield = [player.maxShield, player.maxShield, player.maxShield, player.maxShield];
                if (typeof MD3 !== 'undefined') MD3.hideDeathBanner();
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('🎉 Boss Defeated! You have been revived!');
                }
            } else {
                if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                    MenuManager.showToast('🎉 Boss Defeated!');
                }
            }

            // Update party HUD
            if (typeof updatePartyHUD === 'function') updatePartyHUD();

            // Broadcast revival to all clients
            this.broadcast(this.MSG.PLAYER_STATE, {
                playerId: 'REVIVE_ALL',
                revive: true
            });
        }
    },

    /**
     * Handle player death notification
     */
    handlePlayerDeath(data) {
        console.log('[Network] Received player death:', data.playerId);

        const rp = remotePlayers.get(data.playerId);
        if (rp && !rp.dead) {
            rp.dead = true;
            // Create large explosion for player death
            explosions.push(new LargeExplosion(data.x, data.y));

            // Show toast notification
            if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
                MenuManager.showToast(`${rp.name || 'Player'} was destroyed!`);
            }
        }

        // Update party HUD
        if (typeof updatePartyHUD === 'function') updatePartyHUD();

        // Check for PVP victory first (PVP + No Enemy Spawn mode)
        if (this.isHost && typeof gameOver !== 'undefined' && !gameOver) {
            const winner = this.checkPVPVictory();
            if (winner) {
                console.log('[Network] PVP Victory! Winner:', winner.name);
                this.broadcastPVPVictory(winner.name, winner.id);
                return; // Don't check for all-dead game over
            }
        }

        // Immediately check if all players are now dead
        // This is critical when we (local player) are already dead
        if (typeof player !== 'undefined' && player.dead && typeof gameOver !== 'undefined' && !gameOver) {
            let allDead = true;
            for (let rp of remotePlayers.values()) {
                if (!rp.dead) {
                    allDead = false;
                    break;
                }
            }
            if (allDead) {
                console.log('[Network] All players dead after receiving death notification - triggering game over');
                gameOver = true;

                const totalKills = typeof MD3 !== 'undefined' ? MD3.getKills() : 0;

                // If we're host, broadcast game over
                if (this.isHost) {
                    this.broadcastGameOver(totalKills);
                }

                // Show game over UI locally
                if (typeof MD3 !== 'undefined') {
                    MD3.showGameOver(this.isHost, totalKills);
                }
            }
        }
    },

    /**
     * Handle kill count sync
     */
    handleKillSync(data) {
        const rp = remotePlayers.get(data.playerId);
        if (rp) {
            rp.kills = data.kills;
        }

        // Update party HUD
        if (typeof updatePartyHUD === 'function') updatePartyHUD();
    },

    /**
     * Broadcast PVP victory to all clients
     * Called when only one player remains alive in PVP + No Enemy Spawn mode
     */
    broadcastPVPVictory(winnerName, winnerId) {
        if (!this.isHost) return;
        this.broadcast(this.MSG.PVP_VICTORY, {
            winnerName: winnerName,
            winnerId: winnerId
        });

        // Also trigger locally on host
        this.handlePVPVictory({ winnerName: winnerName, winnerId: winnerId });
    },

    /**
     * Handle PVP victory notification
     * Shows winner announcement and game over screen
     */
    handlePVPVictory(data) {
        console.log('[Network] PVP Victory:', data.winnerName);

        // Set game over state
        if (typeof gameOver !== 'undefined') gameOver = true;

        // Show PVP victory screen
        if (typeof MD3 !== 'undefined') {
            MD3.showPVPVictory(data.winnerName, this.isHost);
        }
    },

    /**
     * Check for PVP victory condition
     * Returns winner info if only one player alive, null otherwise
     */
    checkPVPVictory() {
        // Only check in PVP mode with enemy spawn disabled
        if (!pvpEnabled || enemySpawnEnabled) return null;
        if (!this.isMultiplayer || !this.connected) return null;

        let alivePlayers = [];

        // Check local player
        if (typeof player !== 'undefined' && player && !player.dead) {
            alivePlayers.push({
                name: myPlayerName || 'Player',
                id: this.isHost ? 'host' : this.myId
            });
        }

        // Check remote players
        for (let [id, rp] of remotePlayers) {
            if (!rp.dead) {
                alivePlayers.push({
                    name: rp.name || 'Player',
                    id: id
                });
            }
        }

        // If exactly one player alive, they win
        if (alivePlayers.length === 1) {
            return alivePlayers[0];
        }

        return null;
    },

    /**
     * Handle protocol version mismatch
     */
    handleVersionMismatch(data) {
        alert(`Version mismatch! You: v${this.PROTOCOL_VERSION}, Host: v${data.hostVersion}\nPlease update your game.`);

        // Disconnect
        this.connections.forEach((slot, id) => {
            if (slot.dc) slot.dc.close();
            if (slot.pc) slot.pc.close();
        });
        this.connections.clear();
        this.connected = false;
        this.isMultiplayer = false;

        // Return to menu
        if (typeof MenuManager !== 'undefined') {
            MenuManager.transitionTo('MP_MENU');
        }
    },

    /**
     * Handle game over with stats
     */
    handleGameOver(data) {
        // Set game over state
        if (typeof gameOver !== 'undefined') gameOver = true;

        // Show game over screen with stats
        if (typeof MD3 !== 'undefined') {
            MD3.enemiesDestroyed = data.totalKills || 0;
            MD3.showGameOver(false, data.totalKills || 0);
        }
    },

    // =========================================================================
    // SYNC BROADCAST FUNCTIONS (Host -> Clients)
    // =========================================================================

    /**
     * Sync full player state to all clients (call periodically)
     */
    syncPlayerState() {
        if (!this.isHost || !this.connected) return;

        // Sync local player (host) state to clients
        if (typeof player !== 'undefined' && player) {
            this.broadcast(this.MSG.PLAYER_STATE, {
                playerId: 'host',
                x: player.x,
                y: player.y,
                angle: player.angle * 180 / Math.PI,
                hull: player.hull,
                maxHull: player.maxHull,
                shield: player.shield,
                dead: player.dead,
                kills: typeof MD3 !== 'undefined' ? MD3.getKills() : 0
            });
        }
    },

    /**
     * Broadcast player death event
     * Works for both Host and Client:
     * - Host broadcasts to all clients
     * - Client sends to host who relays to other clients
     */
    broadcastPlayerDeath(playerId, x, y) {
        this.send(this.MSG.PLAYER_DEATH, {
            playerId: playerId,
            x: x,
            y: y
        });
    },

    /**
     * Broadcast kill sync update
     */
    broadcastKillSync(playerId, kills) {
        this.broadcast(this.MSG.KILL_SYNC, {
            playerId: playerId,
            kills: kills
        });
    },

    /**
     * Handle health pack spawn/pickup
     */
    handleHealthPack(senderId, data) {
        if (data.action === 'SPAWN') {
            // Client receives new health pack from Host
            if (!this.isHost) {
                const hp = new HealthPack(data.x, data.y);
                hp.netId = data.netId;
                healthPacks.push(hp);
            }
        } else if (data.action === 'PICKUP') {
            // Someone picked up a health pack
            if (this.isHost) {
                // Host broadcasts to all clients
                this.broadcast(this.MSG.HEALTH_PACK, data, senderId);
            }
            // Remove the health pack locally
            const idx = healthPacks.findIndex(hp => hp.netId === data.netId);
            if (idx !== -1) {
                healthPacks.splice(idx, 1);
            }
        }
    },

    /**
     * Handle boss spawn on client
     */
    handleBossSpawn(data) {
        if (this.isHost) return; // Host already has the boss

        // Clear enemies if boss is spawning
        enemies = [];
        bossTimer = 0;
        bossActive = true;

        // Create boss based on type
        if (data.bossType === 'GALAXY') {
            boss = new Boss(0);
        } else if (data.bossType === 'CRYSTAL') {
            boss = new LiquidCrystal();
        } else if (data.bossType === 'VOID') {
            boss = new VoidReaper();
        }

        if (boss) {
            boss.entityId = 'boss';
            boss.x = data.x;
            boss.y = data.y;
            explosions.push(new Explosion(boss.x, boss.y));
        }
    },

    // =========================================================================
    // RETURN TO LOBBY HANDLING
    // =========================================================================

    /**
     * Handle return to lobby message (received by clients)
     * All players go back to lobby waiting room
     */
    handleReturnToLobby(data) {
        console.log('[Network] Returning to lobby');

        // Reset game state
        if (typeof gameOver !== 'undefined') gameOver = false;
        if (typeof player !== 'undefined' && player) {
            player.dead = false;
            player.hull = player.maxHull || 100;
        }

        // Reset ALL remote players to alive state for next game
        for (let [id, rp] of remotePlayers) {
            rp.dead = false;
            rp.hull = rp.maxHull || 100;
        }

        // Reset game entities
        enemies = [];
        torps = [];
        bullets = [];
        enemyLasers = [];
        explosions = [];
        healthPacks = [];
        bombs = [];
        boss = null;
        bossActive = false;

        // Hide game over overlay
        if (typeof MD3 !== 'undefined') {
            MD3.resetUI();
        }

        // Transition to appropriate lobby state
        if (typeof MenuManager !== 'undefined') {
            if (this.isHost) {
                MenuManager.transitionTo('HOST_LOBBY');
                if (typeof gameState !== 'undefined') gameState = 'HOST_LOBBY';
            } else {
                MenuManager.transitionTo('JOIN_LOBBY');
                if (typeof gameState !== 'undefined') gameState = 'JOIN_LOBBY';

                // Wait for transition animation to complete before showing connected state
                // transitionTo() resets the overlay, so we must delay showing connected
                setTimeout(() => {
                    const connectedDiv = document.getElementById('md3-join-connected');
                    const waitingDiv = document.getElementById('md3-join-waiting');
                    const answerDiv = document.getElementById('md3-join-answer');
                    const connectingDiv = document.getElementById('md3-join-connecting');
                    if (connectedDiv) connectedDiv.classList.remove('md3-hidden');
                    if (waitingDiv) waitingDiv.classList.add('md3-hidden');
                    if (answerDiv) answerDiv.classList.add('md3-hidden');
                    if (connectingDiv) connectingDiv.classList.add('md3-hidden');
                }, 400);
            }
        }

        // Show toast notification
        if (typeof MenuManager !== 'undefined' && MenuManager.showToast) {
            MenuManager.showToast('Returning to lobby...');
        }
    },

    /**
     * Host broadcasts return to lobby to all clients
     */
    broadcastReturnToLobby() {
        if (!this.isHost) return;
        this.broadcast(this.MSG.RETURN_TO_LOBBY, {});
        // Also handle locally
        this.handleReturnToLobby({});
    },

    // =========================================================================
    // TIMER SYNC
    // =========================================================================

    /**
     * Host broadcasts survival timer to clients (call every 1 second)
     */
    syncTimer(time) {
        if (!this.isHost || !this.connected) return;
        this.broadcast(this.MSG.SYNC_TIMER, { time: time });
    },

    // =========================================================================
    // BOSS ATTACK STATE SYNC
    // =========================================================================

    /**
     * Handle boss attack state sync (received by clients)
     */
    handleBossAttackState(data) {
        if (this.isHost || !boss) return;

        // Apply attack state
        boss.attackState = data.attackState || 'IDLE';
        boss.isAttacking = data.isAttacking || false;
        boss.invulnerable = data.invulnerable || false;
        boss.attackSubTimer = data.attackSubTimer || 0;

        // Common fields for all bosses
        if (data.phase !== undefined) boss.phase = data.phase;
        if (data.shakeTimer !== undefined) boss.shakeTimer = data.shakeTimer;
        if (data.attackWarningTimer !== undefined) boss.attackWarningTimer = data.attackWarningTimer;

        // Attack-specific fields
        if (data.dashTarget) boss.dashTarget = data.dashTarget;
        if (data.dashChargeTime !== undefined) boss.dashChargeTime = data.dashChargeTime;
        if (data.laserAngles) boss.laserAngles = data.laserAngles;
        if (data.laserSubState) boss.laserSubState = data.laserSubState;
        if (data.spiralAngle !== undefined) boss.spiralAngle = data.spiralAngle;

        // Attack warning
        if (data.showAttackWarning !== undefined) {
            boss.showAttackWarning = data.showAttackWarning;
            boss.currentAttackInfo = data.currentAttackInfo;
        }

        // LiquidCrystal specific fields
        if (data.dashPhase !== undefined) boss.dashPhase = data.dashPhase;
        if (data.spinPhase !== undefined) boss.spinPhase = data.spinPhase;
        if (data.bombRamPhase !== undefined) boss.bombRamPhase = data.bombRamPhase;
        if (data.dashProgress !== undefined) boss.dashProgress = data.dashProgress;
        if (data.teleportProgress !== undefined) boss.teleportProgress = data.teleportProgress;
        if (data.dashStartX !== undefined) {
            boss.dashStartX = data.dashStartX;
            boss.dashStartY = data.dashStartY;
        }
        if (data.teleportTargetX !== undefined) {
            boss.teleportTargetX = data.teleportTargetX;
            boss.teleportTargetY = data.teleportTargetY;
            boss.teleportStartX = data.teleportStartX;
            boss.teleportStartY = data.teleportStartY;
        }

        // VoidReaper specific fields
        if (data.voidPullActive !== undefined) boss.voidPullActive = data.voidPullActive;
        if (data.voidPullTimer !== undefined) boss.voidPullTimer = data.voidPullTimer;
        if (data.harvestTimer !== undefined) boss.harvestTimer = data.harvestTimer;
        if (data.enrageGlow !== undefined) boss.enrageGlow = data.enrageGlow;
    },


    /**
     * Host broadcasts boss attack state (call when attack starts/changes)
     */
    syncBossAttackState() {
        if (!this.isHost || !this.connected || !boss) return;

        const data = {
            attackState: boss.attackState,
            isAttacking: boss.isAttacking,
            invulnerable: boss.invulnerable,
            attackSubTimer: boss.attackSubTimer,
            showAttackWarning: boss.showAttackWarning,
            currentAttackInfo: boss.currentAttackInfo,
            // Common fields for all bosses
            phase: boss.phase,
            shakeTimer: boss.shakeTimer,
            attackWarningTimer: boss.attackWarningTimer
        };

        // Add attack-specific fields
        if (boss.dashTarget) data.dashTarget = boss.dashTarget;
        if (boss.dashChargeTime !== undefined) data.dashChargeTime = boss.dashChargeTime;
        if (boss.laserAngles) data.laserAngles = boss.laserAngles;
        if (boss.laserSubState) data.laserSubState = boss.laserSubState;
        if (boss.spiralAngle !== undefined) data.spiralAngle = boss.spiralAngle;

        // LiquidCrystal specific fields
        if (boss.dashPhase !== undefined) data.dashPhase = boss.dashPhase;
        if (boss.spinPhase !== undefined) data.spinPhase = boss.spinPhase;
        if (boss.bombRamPhase !== undefined) data.bombRamPhase = boss.bombRamPhase;
        if (boss.dashProgress !== undefined) data.dashProgress = boss.dashProgress;
        if (boss.teleportProgress !== undefined) data.teleportProgress = boss.teleportProgress;
        if (boss.dashStartX !== undefined) {
            data.dashStartX = boss.dashStartX;
            data.dashStartY = boss.dashStartY;
        }
        if (boss.teleportTargetX !== undefined) {
            data.teleportTargetX = boss.teleportTargetX;
            data.teleportTargetY = boss.teleportTargetY;
            data.teleportStartX = boss.teleportStartX;
            data.teleportStartY = boss.teleportStartY;
        }

        // VoidReaper specific fields
        if (boss.voidPullActive !== undefined) data.voidPullActive = boss.voidPullActive;
        if (boss.voidPullTimer !== undefined) data.voidPullTimer = boss.voidPullTimer;
        if (boss.harvestTimer !== undefined) data.harvestTimer = boss.harvestTimer;
        if (boss.enrageGlow !== undefined) data.enrageGlow = boss.enrageGlow;

        this.broadcast(this.MSG.BOSS_ATTACK_STATE, data);
    },


    /**
     * Broadcast game over to all clients
     */
    broadcastGameOver(totalKills) {
        this.broadcast(this.MSG.GAME_OVER, {
            totalKills: totalKills
        });
    },

    // =========================================================================
    // PVP DAMAGE SYNC
    // =========================================================================

    /**
 * Handle PVP damage event (when another player hits you)
 */
    handlePvpDamage(data) {
        // Only apply damage if we are the target
        if (data.targetId === this.myId && player && !player.dead) {
            const damage = data.damage || 20;
            const hitAngle = data.hitAngle !== undefined ? data.hitAngle : 0;

            // Calculate sector from hit angle (same as enemy bullet logic)
            const sector = getSector(player.angle, hitAngle);

            // Apply shield damage first (shields are stored as array)
            if (player.shield && player.shield[sector] > 0) {
                let overflow = Math.max(0, damage - player.shield[sector]);
                player.shield[sector] = Math.max(0, player.shield[sector] - damage);

                // Add hit effect (shield glow)
                if (player.hits) {
                    player.hits.push(new ShieldHit(hitAngle, sector));
                }

                // Add shield impact glow at hit point
                if (typeof shieldImpactGlows !== 'undefined' && typeof ShieldImpactGlow !== 'undefined') {
                    let hitX = player.x + Math.cos(hitAngle) * (player.shR || 50);
                    let hitY = player.y + Math.sin(hitAngle) * (player.shR || 50);
                    shieldImpactGlows.push(new ShieldImpactGlow(hitX, hitY));
                }

                // Overflow damage goes to hull
                if (overflow > 0) {
                    player.hull = Math.max(0, player.hull - overflow);
                }
            } else {
                // Direct hull damage
                player.hull = Math.max(0, player.hull - damage);

                // Add sparkler effect for hull hit
                if (typeof sparklerEffects !== 'undefined' && typeof SparklerEffect !== 'undefined' &&
                    data.x !== undefined && data.y !== undefined) {
                    sparklerEffects.push(new SparklerEffect(data.x, data.y, hitAngle));
                }
            }

            // Update HUD
            if (typeof hullDisplay !== 'undefined') {
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
            }

            // Add explosion at hit location
            if (data.x !== undefined && data.y !== undefined) {
                explosions.push(new Explosion(data.x, data.y));
            }

            // Check for player death
            if (player.hull <= 0 && !player.dead) {
                player.dead = true;

                // Broadcast death
                const playerId = this.isHost ? 'host' : this.myId;
                this.broadcastPlayerDeath(playerId, player.x, player.y);
                this.broadcastExplosion(player.x, player.y, 'LARGE');

                // Show spectator mode
                if (typeof showSpectatorMode === 'function') showSpectatorMode();

                // Check for PVP victory (host only)
                if (this.isHost) {
                    const winner = this.checkPVPVictory();
                    if (winner) {
                        console.log('[Network] PVP Victory after local death! Winner:', winner.name);
                        this.broadcastPVPVictory(winner.name, winner.id);
                    }
                }
            }
        }
    },

    /**
     * Send PVP damage to a specific player
     */
    sendPvpDamage(targetId, damage, x, y, hitAngle) {
        if (!this.connected || !pvpEnabled) return;

        const data = {
            attackerId: this.myId,
            targetId: targetId,
            damage: damage,
            x: x,
            y: y,
            hitAngle: hitAngle
        };

        // Broadcast to all (including host who will forward to target)
        if (this.isHost) {
            this.broadcast(this.MSG.PVP_DAMAGE, data);
        } else {
            this.sendTo('host', this.MSG.PVP_DAMAGE, data);
        }
    },

    // =========================================================================
    // COLLISION EVENT SYNC (Client -> Host)
    // =========================================================================

    /**
     * Handle collision event from client (Host only)
     * Client reports that they collided with an enemy/boss
     * Host applies damage and broadcasts death if needed
     */
    handleCollisionEvent(senderId, data) {
        if (!this.isHost) return;

        const entityId = data.entityId;
        const damage = data.damage || 60;

        // Find the enemy by entityId, with fallback to netId
        let enemy = enemies.find(e => e.entityId === entityId);

        // Fallback: parse netId from entityId string
        if (!enemy) {
            const netIdMatch = entityId.match(/enemy_(\d+)/);
            if (netIdMatch) {
                const netId = parseInt(netIdMatch[1]);
                enemy = enemies.find(e => e.netId === netId);
            }
        }

        if (enemy && !enemy.dead) {
            const hitAngle = data.hitAngle || 0;
            const sector = getSector(enemy.angle, hitAngle);

            // Check shields first
            if (enemy.shield && enemy.shield[sector] > 0) {
                enemy.shield[sector] -= damage;

                // Add shield hit visual effect
                if (enemy.hits) {
                    enemy.hits.push({ angle: hitAngle, sector: sector, life: 0.5 });
                }

                // Broadcast shield hit effect
                this.broadcastExplosion(enemy.x + Math.cos(hitAngle) * 30, enemy.y + Math.sin(hitAngle) * 30, 'SMALL');

                // Overflow damage to hull
                if (enemy.shield[sector] < 0) {
                    enemy.hp += enemy.shield[sector];
                    enemy.shield[sector] = 0;
                }
            } else {
                // Direct hull damage
                enemy.hp -= damage;
            }

            // Calculate bounce for the enemy
            const rp = remotePlayers.get(senderId);
            if (rp) {
                const collisionAngle = Math.atan2(enemy.y - rp.y, enemy.x - rp.x);
                const step = Math.PI / 8;
                const enemyBounceAngle = Math.round(collisionAngle / step) * step;
                enemy.bounceTimer = 7;
                enemy.bounceVelX = Math.cos(enemyBounceAngle) * 5;
                enemy.bounceVelY = Math.sin(enemyBounceAngle) * 5;
            }

            // Check if dead
            if (enemy.hp <= 0) {
                enemy.dead = true;
                // Broadcast explosion (also creates locally) and delete entity
                this.broadcastExplosion(enemy.x, enemy.y, 'NORMAL');
                this.deleteEntity(enemy.entityId || entityId);
            }
        }

        // Handle boss collision
        if (entityId === 'boss' && boss && !boss.dead) {
            // Boss takes no damage from collision, but we record the hit for sync purposes
            // The damage is one-way (player takes damage, boss doesn't)
        }
    },

    /**
     * Send collision event to host (Client only)
     * Called when local player collides with an enemy
     */
    sendCollisionEvent(entityId, damage, playerX, playerY) {
        if (!this.connected || this.isHost) return;

        this.sendTo('host', this.MSG.COLLISION_EVENT, {
            entityId: entityId,
            damage: damage,
            playerX: playerX,
            playerY: playerY
        });
    },

    /**
     * Broadcast a chat message to all players
     */
    broadcastChat(text, senderName) {
        if (!this.connected) return;

        const name = senderName || (typeof myPlayerName !== 'undefined' ? myPlayerName : 'Unknown');
        const data = {
            sender: name,
            text: text,
            timestamp: Date.now()
        };

        if (this.isHost) {
            // Host broadcasts to all clients
            this.broadcast(this.MSG.CHAT_MESSAGE, data);
        } else {
            // Client sends to host (host will relay)
            this.sendTo('host', this.MSG.CHAT_MESSAGE, data);
        }
    }
};
