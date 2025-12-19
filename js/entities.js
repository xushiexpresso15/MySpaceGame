class Boss {
    constructor(absorbedEnemies) {
        this.x = canvas.width / 2;
        this.y = 100;
        this.angle = Math.PI / 2;
        this.target = Math.PI / 2;
        this.r = 80;
        this.baseHp = 4000;
        this.hp = this.baseHp + absorbedEnemies * 100;
        this.maxHp = this.hp;
        this.dead = false;
        this.speed = 30;
        this.baseSpeed = 30;

        // Random movement system
        this.movementTimer = Math.random() * 7 + 3;
        this.movementDirection = Math.random() * Math.PI * 2;

        // Attack system
        this.specialAttackTimer = this.getSpecialAttackCooldown();
        this.normalAttackTimer = Math.random() * 3 + 1;
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.invulnerable = false;

        // Phase system
        this.phase = 1;
        this.updatePhase();

        // Attack-specific properties
        this.dashTarget = null;
        this.dashChargeTime = 0;
        this.shotgunVolley = 0;
        this.laserRound = 0;
        this.bombRound = 0;
        this.attackSubTimer = 0;

        // Laser charging (for normal attacks)
        this.laserCharging = false;

        // Hurt effect
        this.hurtTimer = 0;
    }

    getSpecialAttackCooldown() {
        if (this.phase === 1) return Math.random() * 4 + 6; // Phase 1: 6-10s
        if (this.phase === 2) return Math.random() * 4 + 3; // Phase 2: 3-7s
        return Math.random() * 2 + 1; // Phase 3: 1-3s
    }

    updatePhase() {
        let hpPercent = this.hp / this.maxHp;
        if (hpPercent > 0.5) this.phase = 1;
        else if (hpPercent > 0.25) this.phase = 2;
        else this.phase = 3;
    }
    update(dt) {
        if (Network.isMultiplayer && !Network.isHost) {
            if (this.hurtTimer > 0) this.hurtTimer -= dt;
            return;
        }
        // Update phase
        this.updatePhase();

        // Update hurt timer
        if (this.hurtTimer > 0) this.hurtTimer -= dt;

        // Rotation toward movement direction
        if (!this.isAttacking) {
            let d = this.movementDirection - this.angle;
            while (d <= -Math.PI) d += Math.PI * 2;
            while (d > Math.PI) d -= Math.PI * 2;
            if (Math.abs(d) > 0.01) {
                let s = ROT_SPEED * 0.3 * dt;
                this.angle += Math.sign(d) * Math.min(Math.abs(d), s);
            }
            if (this.angle > Math.PI) this.angle -= Math.PI * 2;
            if (this.angle < -Math.PI) this.angle += Math.PI * 2;
        }

        // Random movement
        if (!this.isAttacking && !this.laserCharging) {
            this.movementTimer -= dt;
            if (this.movementTimer <= 0) {
                this.movementDirection = Math.random() * Math.PI * 2;
                this.movementTimer = Math.random() * 7 + 3;
            }

            let vx = Math.cos(this.movementDirection) * this.speed * dt;
            let vy = Math.sin(this.movementDirection) * this.speed * dt;
            let nx = this.x + vx, ny = this.y + vy;
            if (nx > this.r && nx < canvas.width - this.r) this.x = nx;
            if (ny > this.r && ny < canvas.height - this.r) this.y = ny;
        }

        // Contact damage - local player
        if (!player.dead && Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
            player.hull = Math.max(0, player.hull - player.maxHull * 0.1 * dt);
            hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
        }

        // Contact damage - remote players (Host only sends damage notifications)
        if (Network.isMultiplayer && Network.isHost) {
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) continue;
                let dist = Math.hypot(rp.x - this.x, rp.y - this.y);
                if (dist < this.r + (rp.r || 23)) {
                    // Send continuous contact damage to remote player
                    // Using rate-limited damage to avoid spam (every 100ms)
                    if (!this.lastContactDamage) this.lastContactDamage = {};
                    const now = Date.now();
                    if (!this.lastContactDamage[id] || now - this.lastContactDamage[id] > 100) {
                        this.lastContactDamage[id] = now;
                        const damage = 10; // Damage per tick (100ms)
                        const hitAngle = Math.atan2(rp.y - this.y, rp.x - this.x);
                        Network.sendPvpDamage(id, damage, this.x, this.y, hitAngle);
                    }
                }
            }
        }

        // Special attack timer
        if (!this.isAttacking && this.attackState === 'IDLE') {
            this.specialAttackTimer -= dt;
            if (this.specialAttackTimer <= 0) {
                this.startSpecialAttack();
            }
        }

        // Normal attack timer
        this.normalAttackTimer -= dt;
        if (this.normalAttackTimer <= 0 && this.attackState === 'IDLE' && !this.laserCharging) {
            this.doNormalAttack();
        }

        // Attack warning timer
        if (this.showAttackWarning && this.attackWarningTimer > 0) {
            this.attackWarningTimer -= dt;
            if (this.attackWarningTimer <= 0) {
                this.showAttackWarning = false;
            }
        }

        // Laser charging (like enemy ships)
        if (this.laserCharging) {
            this.chargeTime -= dt;
            if (this.chargeTime <= 0) {
                enemyLasers.push(new EnemyLaser(this.x, this.y, this.chargeAngle));
                this.laserCharging = false;
                this.normalAttackTimer = Math.random() * 3 + 1;
            }
        }

        // Handle attack states
        this.handleAttackState(dt);
    }

    startSpecialAttack() {
        let attacks = ['DASH', 'SHOTGUN', 'LASER_MULTI', 'SUMMON', 'BOMB', 'SPIRAL', 'SCATTER_BOMB'];
        this.attackState = attacks[Math.floor(Math.random() * attacks.length)];
        this.isAttacking = true;
        this.attackSubTimer = 0;

        // ===== ATTACK WARNING ANIMATION =====
        // Show attack name with icon to help players recognize the attack
        this.showAttackWarning = true;
        this.attackWarningTimer = 1.5; // Show warning for 1.5 seconds

        // Attack icons and names for display
        const attackInfo = {
            'DASH': { icon: '⚡', name: 'CHARGE ATTACK', color: '#00BFFF' },
            'SHOTGUN': { icon: '💥', name: 'SHOTGUN BLAST', color: '#FF6B6B' },
            'LASER_MULTI': { icon: '🔴', name: 'MULTI-LASER', color: '#FF4444' },
            'SUMMON': { icon: '👾', name: 'SUMMON MINIONS', color: '#AA44FF' },
            'BOMB': { icon: '💣', name: 'BOMB BARRAGE', color: '#FF8C00' },
            'SPIRAL': { icon: '🌀', name: 'SPIRAL ATTACK', color: '#00FF88' },
            'SCATTER_BOMB': { icon: '☄️', name: 'SCATTER BOMBS', color: '#FFAA00' }
        };

        this.currentAttackInfo = attackInfo[this.attackState];

        // Initialize attack-specific values
        if (this.attackState === 'DASH') {
            this.dashChargeTime = 2.0;
            this.dashTarget = { x: player.x, y: player.y };
        } else if (this.attackState === 'SHOTGUN') {
            this.shotgunVolley = 0;
        } else if (this.attackState === 'LASER_MULTI') {
            this.laserRound = 0;
        } else if (this.attackState === 'BOMB') {
            this.bombRound = 0;
        } else if (this.attackState === 'SPIRAL') {
            this.spiralVolley = 0;
            this.spiralAngle = 0;
        } else if (this.attackState === 'SCATTER_BOMB') {
            this.scatterBombRound = 0;
        }
    }

    doNormalAttack() {
        let ang = Math.atan2(player.y - this.y, player.x - this.x);
        if (Math.random() < 0.5) {
            if (Network.isMultiplayer && Network.isHost) {
                Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: ang });
            }
            bullets.push(new Bullet(this.x, this.y, ang));
            this.normalAttackTimer = Math.random() * 3 + 1;
        } else {
            // Laser with 1-second charging/aiming
            this.laserCharging = true;
            this.chargeTime = 1.0;
            this.chargeAngle = ang;
        }
    }

    handleAttackState(dt) {
        if (this.attackState === 'IDLE') return;
        // DASH ATTACK - Shake, blue glow, lightning, knockback, stun
        if (this.attackState === 'DASH') {
            if (this.dashChargeTime > 0) {
                // Charging - generate lightning particles
                this.dashChargeTime -= dt;
                if (Math.random() < 0.3) {
                    lightningParticles.push(new LightningParticle(
                        this.x + (Math.random() - 0.5) * this.r * 2,
                        this.y + (Math.random() - 0.5) * this.r * 2
                    ));
                }
            } else if (!this.dashExecuted) {
                // Initialize dash
                this.dashExecuted = true;
                this.dashStartX = this.x;
                this.dashStartY = this.y;
                this.dashProgress = 0;
                this.dashDuration = 0.3;
            } else if (this.dashProgress < 1) {
                // Execute dash
                this.dashProgress += dt / this.dashDuration;
                if (this.dashProgress > 1) this.dashProgress = 1;
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * this.dashProgress;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * this.dashProgress;
                // Lightning trail
                for (let i = 0; i < 5; i++) {
                    lightningParticles.push(new LightningParticle(this.x, this.y));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SYNC_EFFECT, { type: 'LIGHTNING', x: this.x, y: this.y });
                    }
                }
                // Check collision with player
                if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r && !this.dashHit) {
                    this.dashHit = true;
                    let damage = player.maxHull / 3; // 3-hit kill
                    player.hull = Math.max(0, player.hull - damage);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    // Knockback
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 100;
                    player.y += Math.sin(angle) * 100;
                    // Clamp player to screen bounds (use SHIP_SIZE/2 to match movement boundary)
                    player.x = Math.max(SHIP_SIZE / 2, Math.min(canvas.width - SHIP_SIZE / 2, player.x));
                    player.y = Math.max(SHIP_SIZE / 2, Math.min(canvas.height - SHIP_SIZE / 2, player.y));
                    // Stun for 1 second
                    if (!stunEffect) stunEffect = new StunEffect();
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SYNC_EFFECT, { type: 'STUN', duration: 1.0 });
                    }
                    player.speed = 0;
                    setTimeout(() => { if (player) player.speed = player.baseSpeed; }, 1000);
                }
            } else {
                this.endAttack();
                delete this.dashExecuted;
                delete this.dashHit;
            }
        }
        // SHOTGUN ATTACK - 8 directions, 10 volleys, 0.3s interval
        else if (this.attackState === 'SHOTGUN') {
            this.attackSubTimer += dt;
            if (this.attackSubTimer >= 0.3) {
                this.attackSubTimer = 0;
                // Fire 8-direction burst
                for (let i = 0; i < 8; i++) {
                    let angle = i * Math.PI / 4;
                    bullets.push(new Bullet(this.x, this.y, angle));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: angle });
                    }
                }
            }
            this.shotgunVolley++;
            if (this.shotgunVolley >= 10) {
                this.endAttack();
            }
        }
        // LASER_MULTI ATTACK - 5 lasers, teleport, 3 rounds
        else if (this.attackState === 'LASER_MULTI') {
            if (this.laserSubState === undefined) {
                this.laserSubState = 'AIMING';
                this.laserAimTime = 1.0;
                this.laserAngles = [];
                for (let i = 0; i < 5; i++) {
                    this.laserAngles.push(Math.random() * Math.PI * 2);
                }
            }
            if (this.laserSubState === 'AIMING') {
                this.laserAimTime -= dt;
                if (this.laserAimTime <= 0) {
                    // Fire all 5 lasers
                    for (let angle of this.laserAngles) {
                        enemyLasers.push(new EnemyLaser(this.x, this.y, angle));
                    }
                    this.laserSubState = 'TELEPORTING';
                    this.invulnerable = true;
                    this.teleportDelay = 0.2;
                }
            } else if (this.laserSubState === 'TELEPORTING') {
                // Start slide animation
                if (this.laserTeleportStartX === undefined) {
                    this.laserTeleportStartX = this.x;
                    this.laserTeleportStartY = this.y;
                    // Calculate target position
                    let newX, newY, attempts = 0;
                    do {
                        newX = Math.random() * (canvas.width - 200) + 100;
                        newY = Math.random() * (canvas.height - 200) + 100;
                        attempts++;
                    } while (Math.hypot(newX - player.x, newY - player.y) < 150 && attempts < 50);
                    this.laserTeleportTargetX = newX;
                    this.laserTeleportTargetY = newY;
                    this.laserTeleportProgress = 0;
                    this.laserTeleportDuration = 0.6;
                }

                // Ease-out animation (1 - (1-t)^3)
                this.laserTeleportProgress += dt / this.laserTeleportDuration;
                if (this.laserTeleportProgress >= 1) {
                    this.laserTeleportProgress = 1;
                }
                let easeT = 1 - Math.pow(1 - this.laserTeleportProgress, 3);
                this.x = this.laserTeleportStartX + (this.laserTeleportTargetX - this.laserTeleportStartX) * easeT;
                this.y = this.laserTeleportStartY + (this.laserTeleportTargetY - this.laserTeleportStartY) * easeT;

                if (this.laserTeleportProgress >= 1) {
                    this.invulnerable = false;
                    delete this.laserTeleportStartX;
                    delete this.laserTeleportStartY;
                    delete this.laserTeleportTargetX;
                    delete this.laserTeleportTargetY;
                    delete this.laserTeleportProgress;

                    // Fire 8-direction bullet burst after teleport
                    for (let i = 0; i < 8; i++) {
                        let angle = i * Math.PI / 4;
                        bullets.push(new Bullet(this.x, this.y, angle));
                        if (Network.isMultiplayer && Network.isHost) {
                            Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: angle });
                        }
                    }

                    this.laserRound++;
                    if (this.laserRound >= 3) {
                        this.endAttack();
                        delete this.laserSubState;
                    } else {
                        // Next round
                        this.laserSubState = 'AIMING';
                        this.laserAimTime = 1.0;
                        this.laserAngles = [];
                        for (let i = 0; i < 5; i++) {
                            this.laserAngles.push(Math.random() * Math.PI * 2);
                        }
                    }
                }
            }
        }
        // SUMMON ATTACK - Spawn 1-2 minibosses
        else if (this.attackState === 'SUMMON') {
            let count = Math.floor(Math.random() * 2) + 1; // 1-2 minibosses
            for (let i = 0; i < count; i++) {
                let angle = (i / count) * Math.PI * 2;
                let dist = 150;
                let x = this.x + Math.cos(angle) * dist;
                let y = this.y + Math.sin(angle) * dist;

                // Clamp positions to stay within screen bounds
                let margin = 60;
                x = Math.max(margin, Math.min(canvas.width - margin, x));
                y = Math.max(margin, Math.min(canvas.height - margin, y));

                let enemyType = Math.random() < 0.5 ? 'red' : 'blue';
                let miniboss = new Ship(x, y, false, enemyType);
                miniboss.isMiniboss = true;

                if (Network.isMultiplayer && Network.isHost) {
                    miniboss.netId = nextNetEnemyId++;
                    miniboss.entityId = 'enemy_' + miniboss.netId;
                    Network.createEntity(miniboss.entityId, 'ENEMY_SHIP', x, y, 0, enemyType === 'red' ? 'enemyRed' : 'enemyBlue');
                    Network.entities.set(miniboss.entityId, miniboss);
                }
                enemies.push(miniboss);
            }
            this.endAttack();
        }
        // BOMB ATTACK - 5 bombs, 3s timer, teleport, 3 rounds
        else if (this.attackState === 'BOMB') {
            if (this.bombSubState === undefined) {
                this.bombSubState = 'THROWING';
                this.bombThrown = false;
            }
            if (this.bombSubState === 'THROWING' && !this.bombThrown) {
                // Throw 5 bombs
                for (let i = 0; i < 5; i++) {
                    let angle = Math.random() * Math.PI * 2;
                    let dist = Math.random() * 300 + 100;
                    let targetX = this.x + Math.cos(angle) * dist;
                    let targetY = this.y + Math.sin(angle) * dist;
                    // Keep in bounds
                    targetX = Math.max(100, Math.min(canvas.width - 100, targetX));
                    targetY = Math.max(100, Math.min(canvas.height - 100, targetY));
                    bombs.push(new Bomb(this.x, this.y, targetX, targetY));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SPAWN_BOMB, { x: this.x, y: this.y, targetX: targetX, targetY: targetY });
                    }
                }
                this.bombThrown = true;
                this.bombSubState = 'WAITING';
                this.bombWaitTime = 1.0; // Wait 1 second before teleport
            } else if (this.bombSubState === 'WAITING') {
                this.bombWaitTime -= dt;
                if (this.bombWaitTime <= 0) {
                    this.bombSubState = 'TELEPORTING';
                    this.invulnerable = true;
                    this.teleportDelay = 0.2;
                }
            } else if (this.bombSubState === 'TELEPORTING') {
                // Start slide animation
                if (this.bombTeleportStartX === undefined) {
                    this.bombTeleportStartX = this.x;
                    this.bombTeleportStartY = this.y;
                    // Calculate target position
                    let newX, newY, attempts = 0;
                    do {
                        newX = Math.random() * (canvas.width - 200) + 100;
                        newY = Math.random() * (canvas.height - 200) + 100;
                        attempts++;
                    } while (Math.hypot(newX - player.x, newY - player.y) < 150 && attempts < 50);
                    this.bombTeleportTargetX = newX;
                    this.bombTeleportTargetY = newY;
                    this.bombTeleportProgress = 0;
                    this.bombTeleportDuration = 0.6;
                }

                // Ease-out animation (1 - (1-t)^3)
                this.bombTeleportProgress += dt / this.bombTeleportDuration;
                if (this.bombTeleportProgress >= 1) {
                    this.bombTeleportProgress = 1;
                }
                let easeT = 1 - Math.pow(1 - this.bombTeleportProgress, 3);
                this.x = this.bombTeleportStartX + (this.bombTeleportTargetX - this.bombTeleportStartX) * easeT;
                this.y = this.bombTeleportStartY + (this.bombTeleportTargetY - this.bombTeleportStartY) * easeT;

                if (this.bombTeleportProgress >= 1) {
                    this.invulnerable = false;
                    delete this.bombTeleportStartX;
                    delete this.bombTeleportStartY;
                    delete this.bombTeleportTargetX;
                    delete this.bombTeleportTargetY;
                    delete this.bombTeleportProgress;

                    // Fire 8-direction bullet burst after teleport
                    for (let i = 0; i < 8; i++) {
                        let angle = i * Math.PI / 4;
                        bullets.push(new Bullet(this.x, this.y, angle));
                        if (Network.isMultiplayer && Network.isHost) {
                            Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: angle });
                        }
                    }

                    this.bombRound++;
                    if (this.bombRound >= 3) {
                        this.endAttack();
                        delete this.bombSubState;
                    } else {
                        // Next round
                        this.bombSubState = 'THROWING';
                        this.bombThrown = false;
                    }
                }
            }
        }
        // SPIRAL ATTACK - 4-direction rotating bullets, 10 volleys
        else if (this.attackState === 'SPIRAL') {
            this.attackSubTimer += dt;
            if (this.attackSubTimer >= 0.3) {
                this.attackSubTimer = 0;
                // Fire 4-direction burst with current angle
                for (let i = 0; i < 4; i++) {
                    let angle = this.spiralAngle + i * Math.PI / 2;
                    bullets.push(new Bullet(this.x, this.y, angle));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: angle });
                    }
                }
                // Rotate 15 degrees for next volley
                this.spiralAngle += 15 * Math.PI / 180;
                this.spiralVolley++;
                if (this.spiralVolley >= 10) {
                    this.endAttack();
                }
            }
        }
        // SCATTER_BOMB ATTACK - 5 bombs that explode into 8 bullets, 1 round only
        else if (this.attackState === 'SCATTER_BOMB') {
            if (this.scatterBombSubState === undefined) {
                this.scatterBombSubState = 'THROWING';
                this.scatterBombThrown = false;
            }
            if (this.scatterBombSubState === 'THROWING' && !this.scatterBombThrown) {
                // Throw 5 scatter bombs
                for (let i = 0; i < 5; i++) {
                    let angle = Math.random() * Math.PI * 2;
                    let dist = Math.random() * 300 + 100;
                    let targetX = this.x + Math.cos(angle) * dist;
                    let targetY = this.y + Math.sin(angle) * dist;
                    targetX = Math.max(100, Math.min(canvas.width - 100, targetX));
                    targetY = Math.max(100, Math.min(canvas.height - 100, targetY));
                    let scatterBomb = new Bomb(this.x, this.y, targetX, targetY);
                    scatterBomb.isScatter = true;
                    bombs.push(scatterBomb);
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SPAWN_BOMB, { x: this.x, y: this.y, targetX: targetX, targetY: targetY, isScatter: true });
                    }
                }
                this.scatterBombThrown = true;
                this.scatterBombSubState = 'WAITING';
                this.scatterBombWaitTime = 1.0;
            } else if (this.scatterBombSubState === 'WAITING') {
                this.scatterBombWaitTime -= dt;
                if (this.scatterBombWaitTime <= 0) {
                    this.scatterBombSubState = 'TELEPORTING';
                    this.invulnerable = true;
                    this.teleportDelay = 0.2;
                }
            } else if (this.scatterBombSubState === 'TELEPORTING') {
                // Start slide animation
                if (this.scatterTeleportStartX === undefined) {
                    this.scatterTeleportStartX = this.x;
                    this.scatterTeleportStartY = this.y;
                    // Calculate target position
                    let newX, newY, attempts = 0;
                    do {
                        newX = Math.random() * (canvas.width - 200) + 100;
                        newY = Math.random() * (canvas.height - 200) + 100;
                        attempts++;
                    } while (Math.hypot(newX - player.x, newY - player.y) < 150 && attempts < 50);
                    this.scatterTeleportTargetX = newX;
                    this.scatterTeleportTargetY = newY;
                    this.scatterTeleportProgress = 0;
                    this.scatterTeleportDuration = 0.6;
                }

                // Ease-out animation (1 - (1-t)^3)
                this.scatterTeleportProgress += dt / this.scatterTeleportDuration;
                if (this.scatterTeleportProgress >= 1) {
                    this.scatterTeleportProgress = 1;
                }
                let easeT = 1 - Math.pow(1 - this.scatterTeleportProgress, 3);
                this.x = this.scatterTeleportStartX + (this.scatterTeleportTargetX - this.scatterTeleportStartX) * easeT;
                this.y = this.scatterTeleportStartY + (this.scatterTeleportTargetY - this.scatterTeleportStartY) * easeT;

                if (this.scatterTeleportProgress >= 1) {
                    this.invulnerable = false;
                    delete this.scatterTeleportStartX;
                    delete this.scatterTeleportStartY;
                    delete this.scatterTeleportTargetX;
                    delete this.scatterTeleportTargetY;
                    delete this.scatterTeleportProgress;

                    // Fire 8-direction bullet burst after teleport
                    for (let i = 0; i < 8; i++) {
                        let angle = i * Math.PI / 4;
                        bullets.push(new Bullet(this.x, this.y, angle));
                        if (Network.isMultiplayer && Network.isHost) {
                            Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: angle });
                        }
                    }

                    // End attack after 1 round
                    this.endAttack();
                    delete this.scatterBombSubState;
                }
            }
        }
    }

    endAttack() {
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.specialAttackTimer = this.getSpecialAttackCooldown();
    }
    draw() {
        ctx.save();

        // Hurt flash effect
        if (this.hurtTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(this.hurtTimer * 30) * 0.3;
        }

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#f80';
        ctx.fillStyle = 'rgba(255,136,0,0.3)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
        ctx.fill();
        let grad = ctx.createRadialGradient(this.x, this.y, this.r * 0.3, this.x, this.y, this.r);
        grad.addColorStop(0, '#ff0');
        grad.addColorStop(0.5, '#f80');
        grad.addColorStop(1, '#f00');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
            let a = i * Math.PI / 4 + this.angle * 0.5;
            let x1 = this.x + Math.cos(a) * (this.r - 15);
            let y1 = this.y + Math.sin(a) * (this.r - 15);
            let x2 = this.x + Math.cos(a) * (this.r - 5);
            let y2 = this.y + Math.sin(a) * (this.r - 5);
            ctx.strokeStyle = '#ff0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        // ctx.restore() moved to end of function to wrap entire draw


        // Draw laser charging indicator (normal attack)
        if (this.laserCharging) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#f00';
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            let endX = this.x + Math.cos(this.chargeAngle) * 1200;
            let endY = this.y + Math.sin(this.chargeAngle) * 1200;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Draw Multi-Laser aiming indicators (special attack)
        if (this.attackState === 'LASER_MULTI' && this.laserSubState === 'AIMING' && this.laserAngles) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#f00';
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            for (let angle of this.laserAngles) {
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                let endX = this.x + Math.cos(angle) * 1200;
                let endY = this.y + Math.sin(angle) * 1200;
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Health bar background
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(this.x - 120, this.y - this.r - 50, 240, 25);

        // Health bar color based on phase
        let hpPercent = this.hp / this.maxHp;
        let barColor = this.phase === 1 ? '#0f0' : this.phase === 2 ? '#fa0' : '#f00';
        ctx.fillStyle = barColor;
        ctx.fillRect(this.x - 120, this.y - this.r - 50, 240 * hpPercent, 25);

        // Health bar border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - 120, this.y - this.r - 50, 240, 25);

        // Boss name
        ctx.fillStyle = '#f80';
        ctx.font = 'bold 18px Courier New';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#f80';
        ctx.fillText('GALAXY DESTROYER', this.x, this.y - this.r - 58);

        // HP numbers
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Courier New';
        ctx.shadowBlur = 0;
        ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, this.y - this.r - 32);

        // ===== ATTACK WARNING DISPLAY =====
        if (this.showAttackWarning && this.currentAttackInfo && this.attackWarningTimer > 0) {
            let alpha = Math.min(1, this.attackWarningTimer / 0.3); // Fade out in last 0.3s
            let pulse = 0.7 + Math.sin(Date.now() * 0.015) * 0.3;

            // Warning glow around boss
            ctx.save();
            ctx.globalAlpha = alpha * 0.4;
            ctx.shadowBlur = 40;
            ctx.shadowColor = this.currentAttackInfo.color;
            ctx.strokeStyle = this.currentAttackInfo.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r + 20 + Math.sin(Date.now() * 0.01) * 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Only keeping the warning glow
        }
        ctx.restore();
    }
}

// ========== LIQUID CRYSTAL BOSS ==========
class CrystalShield {
    constructor(boss, index, total) {
        this.boss = boss;
        this.index = index;
        this.total = total;
        this.angle = (index / total) * Math.PI * 2;
        this.distance = 80;
        this.r = 15;
        this.dead = false;
    }
    update(dt) {
        this.angle += dt * 2;
        this.x = this.boss.x + Math.cos(this.angle) * this.distance;
        this.y = this.boss.y + Math.sin(this.angle) * this.distance;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0ff';
        let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.5, '#0ff');
        grad.addColorStop(1, '#08f');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class CrystalBomb {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 80;
        this.r = 12;
        this.rotation = 0;
        this.dead = false;
    }
    update(dt) {
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        this.rotation += dt * 5;
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) {
            this.dead = true;
        }
        // Check collision with player (respects shields like bullets)
        let dist = Math.hypot(player.x - this.x, player.y - this.y);
        let ang = Math.atan2(this.y - player.y, this.x - player.x);
        let sector = getSector(player.angle, ang);

        // Shield collision (no stun - only shield damage)
        if (player.shield[sector] > 0 && dist < player.shR) {
            let dmg = player.maxShield * (0.15 + Math.random() * 0.1);
            let overflow = Math.max(0, dmg - player.shield[sector]);
            player.shield[sector] = Math.max(0, player.shield[sector] - dmg);
            player.hits.push(new ShieldHit(ang, sector));
            this.dead = true;
            explosions.push(new Explosion(this.x, this.y));

            if (overflow > 0) {
                player.hull = Math.max(0, player.hull - overflow);
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
            }
        }
        // Direct hull hit (no shield)
        else if (player.shield[sector] <= 0 && dist < this.r + player.r) {
            this.dead = true;
            explosions.push(new Explosion(this.x, this.y));
            player.hull = Math.max(0, player.hull - 20);
            hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';

            // Stun if not already stunned (non-stacking)
            if (!stunEffect || stunEffect.done) {
                stunEffect = new StunEffect();
                stunEffect.duration = 3.0;
                player.speed = 0;
                setTimeout(() => { if (player) player.speed = player.baseSpeed; }, 3000);
            }
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#0ff';
        // Draw crystal shape
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.moveTo(0, -this.r);
        ctx.lineTo(this.r * 0.6, 0);
        ctx.lineTo(0, this.r);
        ctx.lineTo(-this.r * 0.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }
}

class LaserTurret {
    constructor(x, y, boss) {
        this.x = x;
        this.y = y;
        this.boss = boss;
        this.hp = 150;
        this.maxHp = 150;
        this.r = 25;
        this.dead = false;
        this.healTimer = Math.random() * 5 + 5;
        this.isHealing = false;
        this.healDuration = 0;
        this.rotation = 0;
    }
    update(dt) {
        this.rotation += dt * 2;
        if (!this.isHealing) {
            this.healTimer -= dt;
            if (this.healTimer <= 0 && this.boss && !this.boss.dead) {
                this.isHealing = true;
                this.healDuration = Math.random() * 2 + 1;
            }
        } else {
            this.healDuration -= dt;
            if (this.boss && !this.boss.dead) {
                this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + 40 * dt);
            }
            if (this.healDuration <= 0) {
                this.isHealing = false;
                this.healTimer = Math.random() * 5 + 5;
            }
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        // Base
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f00';
        ctx.fillStyle = '#400';
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();
        // Crystal top
        ctx.fillStyle = '#f44';
        ctx.beginPath();
        ctx.moveTo(0, -this.r * 0.8);
        ctx.lineTo(this.r * 0.5, 0);
        ctx.lineTo(0, this.r * 0.8);
        ctx.lineTo(-this.r * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Draw healing beam
        if (this.isHealing && this.boss && !this.boss.dead) {
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f00';
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 6;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.boss.x, this.boss.y);
            ctx.stroke();
            ctx.strokeStyle = '#faa';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
        // HP bar
        ctx.fillStyle = '#400';
        ctx.fillRect(this.x - 20, this.y - this.r - 12, 40, 6);
        ctx.fillStyle = '#f44';
        ctx.fillRect(this.x - 20, this.y - this.r - 12, 40 * (this.hp / this.maxHp), 6);
    }
}

class LiquidCrystal {
    constructor() {
        this.x = canvas.width / 2;
        this.y = 100;
        this.r = 50;
        this.baseHp = 3500;
        this.hp = this.baseHp;
        this.maxHp = this.hp;
        this.dead = false;
        this.speed = 60;
        this.baseSpeed = 60;

        // Crystal rotation
        this.outerRotation = 0;
        this.innerRotation = 0;

        // 4-direction movement (0=right, 1=down, 2=left, 3=up)
        this.moveDirection = Math.floor(Math.random() * 4);
        this.directionChangeTimer = Math.random() * 3 + 2;

        // Attack system
        this.specialAttackTimer = this.getSpecialAttackCooldown();
        this.normalAttackTimer = Math.random() * 4 + 3;
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.invulnerable = false;

        // Phase system
        this.phase = 1;

        // Attack-specific
        this.dashComboCount = 0;
        this.spinTeleportCount = 0;
        this.crystalBombs = [];
        this.shields = [];
        this.turrets = [];

        // Shake effect
        this.shakeTimer = 0;
        this.shakeOffset = { x: 0, y: 0 };

        // Hurt effect
        this.hurtTimer = 0;
    }

    getSpecialAttackCooldown() {
        if (this.phase === 1) return Math.random() * 5 + 5;
        if (this.phase === 2) return Math.random() * 4 + 3;
        return Math.random() * 2 + 2;
    }

    updatePhase() {
        let hpPercent = this.hp / this.maxHp;
        if (hpPercent > 0.6) this.phase = 1;
        else if (hpPercent > 0.3) this.phase = 2;
        else this.phase = 3;
    }

    update(dt) {
        // Visual updates run for both Host and Client
        this.updatePhase();

        // Update hurt timer
        if (this.hurtTimer > 0) this.hurtTimer -= dt;

        // Crystal rotation
        this.outerRotation += dt * 0.5;
        this.innerRotation += dt * 2;

        // Shake effect
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            this.shakeOffset.x = (Math.random() - 0.5) * 10;
            this.shakeOffset.y = (Math.random() - 0.5) * 10;
        } else {
            this.shakeOffset.x = 0;
            this.shakeOffset.y = 0;
        }

        // Sub-entity updates (Client does visual only, effectively)
        for (let i = this.shields.length - 1; i >= 0; i--) {
            this.shields[i].update(dt);
            if (this.shields[i].dead) this.shields.splice(i, 1);
        }
        for (let i = this.turrets.length - 1; i >= 0; i--) {
            this.turrets[i].update(dt);
            if (this.turrets[i].dead) this.turrets.splice(i, 1);
        }
        for (let i = this.crystalBombs.length - 1; i >= 0; i--) {
            this.crystalBombs[i].update(dt);
            if (this.crystalBombs[i].dead) this.crystalBombs.splice(i, 1);
        }

        if (Network.isMultiplayer && !Network.isHost) return;


        // 4-direction movement (when not attacking)
        if (!this.isAttacking) {
            this.directionChangeTimer -= dt;
            if (this.directionChangeTimer <= 0) {
                this.moveDirection = Math.floor(Math.random() * 4);
                this.directionChangeTimer = Math.random() * 3 + 2;
            }

            let dirAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
            let angle = dirAngles[this.moveDirection];
            let nx = this.x + Math.cos(angle) * this.speed * dt;
            let ny = this.y + Math.sin(angle) * this.speed * dt;

            // Wall collision - turn 90 degrees
            let hitWall = false;
            if (nx < this.r + 20 || nx > canvas.width - this.r - 20) {
                hitWall = true;
                this.moveDirection = (this.moveDirection + (Math.random() < 0.5 ? 1 : 3)) % 4;
            }
            if (ny < this.r + 20 || ny > canvas.height - this.r - 20) {
                hitWall = true;
                this.moveDirection = (this.moveDirection + (Math.random() < 0.5 ? 1 : 3)) % 4;
            }

            if (!hitWall) {
                this.x = nx;
                this.y = ny;
            }
        }

        // Contact damage (not during knockback immunity) - local player
        if (!player.dead && Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r && (!player.knockbackImmune || player.knockbackImmune <= 0)) {
            player.hull = Math.max(0, player.hull - player.maxHull * 0.05 * dt);
            hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
        }

        // Contact damage - remote players (Host only)
        if (Network.isMultiplayer && Network.isHost) {
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) continue;
                let dist = Math.hypot(rp.x - this.x, rp.y - this.y);
                if (dist < this.r + (rp.r || 23)) {
                    if (!this.lastContactDamage) this.lastContactDamage = {};
                    const now = Date.now();
                    if (!this.lastContactDamage[id] || now - this.lastContactDamage[id] > 100) {
                        this.lastContactDamage[id] = now;
                        const damage = 5; // Lower damage (0.05 * dt equivalent)
                        const hitAngle = Math.atan2(rp.y - this.y, rp.x - this.x);
                        Network.sendPvpDamage(id, damage, this.x, this.y, hitAngle);
                    }
                }
            }
        }

        // Special attack timer (only runs when IDLE)
        if (this.attackState === 'IDLE') {
            this.specialAttackTimer -= dt;
            if (this.specialAttackTimer <= 0) {
                this.startSpecialAttack();
            }
        }

        // Normal attack timer (only when truly idle, separate from special attacks)
        if (this.attackState === 'IDLE') {
            this.normalAttackTimer -= dt;
            if (this.normalAttackTimer <= 0 && this.specialAttackTimer > 1) {
                this.startNormalAttack();
            }
        }

        // Handle attack states
        this.handleAttackState(dt);


    }

    startSpecialAttack() {
        let attacks = ['DASH_COMBO', 'SPIN_TELEPORT', 'SUMMON_TURRET', 'SHIELD', 'CRYSTAL_BOMBS', 'BOMB_RAM_COMBO'];
        this.attackState = attacks[Math.floor(Math.random() * attacks.length)];
        this.isAttacking = true;
        this.attackSubTimer = 0;

        if (this.attackState === 'DASH_COMBO') {
            this.dashComboCount = 0;
            this.dashPhase = 'SHAKE';
            this.shakeTimer = 3.0; // First shake is 3 seconds
            this.isFirstDash = true;
        } else if (this.attackState === 'SPIN_TELEPORT') {
            this.spinTeleportCount = 0;
            this.spinPhase = 'SPINNING';
            this.spinTimer = 3.0;
            this.innerRotation = 0;
        } else if (this.attackState === 'SHIELD') {
            this.shields = [];
            for (let i = 0; i < 5; i++) {
                this.shields.push(new CrystalShield(this, i, 5));
                if (Network.isMultiplayer && Network.isHost) {
                    Network.broadcastSubEntity({ entityType: 'SHIELD', action: 'SPAWN', index: i, total: 5 });
                }
            }
        } else if (this.attackState === 'CRYSTAL_BOMBS') {
            this.bombRoundsShot = 0;
            this.bombTimer = 0;
        } else if (this.attackState === 'BOMB_RAM_COMBO') {
            this.bombRamRound = 0;
            this.bombRamPhase = 'CHARGE'; // CHARGE -> SHOOT -> SHAKE -> DASH -> repeat
            this.chargeTimer = 1.5; // 1.5 second charge-up
            this.chargeSpinSpeed = 0;
        }
    }

    startNormalAttack() {
        this.attackState = 'NORMAL_RAM';
        this.isAttacking = true;
        this.shakeTimer = 0.5;
        this.normalRamPhase = 'SHAKE';
    }

    handleAttackState(dt) {
        if (this.attackState === 'IDLE') return;

        // NORMAL RAM
        if (this.attackState === 'NORMAL_RAM') {
            if (this.normalRamPhase === 'SHAKE') {
                if (this.shakeTimer <= 0) {
                    this.normalRamPhase = 'DASH';
                    this.dashTarget = this.calculateBestDirection();
                    this.dashStartX = this.x;
                    this.dashStartY = this.y;
                    this.dashProgress = 0;
                }
            } else if (this.normalRamPhase === 'DASH') {
                this.dashProgress += dt / 0.3;
                if (this.dashProgress >= 1) this.dashProgress = 1;
                let easeT = 1 - Math.pow(1 - this.dashProgress, 3);
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * easeT;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * easeT;

                // Collision check (only once per dash)
                if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r && !this.normalRamHit) {
                    this.normalRamHit = true;
                    player.hull = Math.max(0, player.hull - 15);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 50;
                    player.y += Math.sin(angle) * 50;
                    // Clamp player to screen bounds (use SHIP_SIZE/2 to match movement boundary)
                    player.x = Math.max(SHIP_SIZE / 2, Math.min(canvas.width - SHIP_SIZE / 2, player.x));
                    player.y = Math.max(SHIP_SIZE / 2, Math.min(canvas.height - SHIP_SIZE / 2, player.y));
                    // If still colliding after clamp, push sideways
                    if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
                        let perpAngle = angle + Math.PI / 2;
                        player.x += Math.cos(perpAngle) * 100;
                        player.y += Math.sin(perpAngle) * 100;
                        player.x = Math.max(SHIP_SIZE / 2, Math.min(canvas.width - SHIP_SIZE / 2, player.x));
                        player.y = Math.max(SHIP_SIZE / 2, Math.min(canvas.height - SHIP_SIZE / 2, player.y));
                    }
                    player.knockbackImmune = 0.5;
                }

                if (this.dashProgress >= 1) {
                    this.endAttack();
                    this.normalAttackTimer = Math.random() * 4 + 3;
                    delete this.normalRamHit;
                }
            }
        }

        // DASH COMBO
        else if (this.attackState === 'DASH_COMBO') {
            if (this.dashPhase === 'SHAKE') {
                if (this.shakeTimer <= 0) {
                    this.dashPhase = 'DASH';
                    this.dashTarget = this.calculateBestDirection();
                    this.dashStartX = this.x;
                    this.dashStartY = this.y;
                    this.dashProgress = 0;
                }
            } else if (this.dashPhase === 'DASH') {
                this.dashProgress += dt / 0.3;
                if (this.dashProgress >= 1) this.dashProgress = 1;
                let easeT = 1 - Math.pow(1 - this.dashProgress, 3);
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * easeT;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * easeT;

                // Collision check
                if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r && !this.dashHit) {
                    this.dashHit = true;
                    player.hull = Math.max(0, player.hull - 20);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 80;
                    player.y += Math.sin(angle) * 80;
                    // Clamp player to screen bounds (use SHIP_SIZE/2 to match movement boundary)
                    player.x = Math.max(SHIP_SIZE / 2, Math.min(canvas.width - SHIP_SIZE / 2, player.x));
                    player.y = Math.max(SHIP_SIZE / 2, Math.min(canvas.height - SHIP_SIZE / 2, player.y));
                    // If still colliding after clamp, push sideways
                    if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
                        let perpAngle = angle + Math.PI / 2;
                        player.x += Math.cos(perpAngle) * 100;
                        player.y += Math.sin(perpAngle) * 100;
                        player.x = Math.max(SHIP_SIZE / 2, Math.min(canvas.width - SHIP_SIZE / 2, player.x));
                        player.y = Math.max(SHIP_SIZE / 2, Math.min(canvas.height - SHIP_SIZE / 2, player.y));
                    }
                    player.knockbackImmune = 0.5;
                }

                if (this.dashProgress >= 1) {
                    this.dashComboCount++;
                    delete this.dashHit;
                    if (this.dashComboCount >= 10) {
                        this.endAttack();
                        delete this.isFirstDash;
                    } else {
                        this.dashPhase = 'SHAKE';
                        this.shakeTimer = 0.5; // Subsequent shakes are 0.5 seconds
                    }
                }
            }
        }

        // SPIN TELEPORT
        else if (this.attackState === 'SPIN_TELEPORT') {
            if (this.spinPhase === 'SPINNING') {
                this.spinTimer -= dt;
                this.innerRotation += dt * 15; // Fast spin
                // Particle effect
                if (Math.random() < 0.3) {
                    let angle = Math.random() * Math.PI * 2;
                    lightningParticles.push(new LightningParticle(
                        this.x + Math.cos(angle) * this.r,
                        this.y + Math.sin(angle) * this.r
                    ));
                }
                if (this.spinTimer <= 0) {
                    this.spinPhase = 'TELEPORT';
                    this.teleportStartX = this.x;
                    this.teleportStartY = this.y;
                    // Teleport to one of 4 cardinal directions (300px away)
                    let directions = [
                        { x: this.x + 300, y: this.y },       // right
                        { x: this.x - 300, y: this.y },       // left
                        { x: this.x, y: this.y + 300 },       // down
                        { x: this.x, y: this.y - 300 }        // up
                    ];
                    // Filter valid positions (within bounds)
                    let validDirs = directions.filter(d =>
                        d.x > 100 && d.x < canvas.width - 100 &&
                        d.y > 100 && d.y < canvas.height - 100
                    );
                    if (validDirs.length === 0) validDirs = directions;
                    let chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
                    this.teleportTargetX = chosen.x;
                    this.teleportTargetY = chosen.y;
                    this.teleportProgress = 0;
                    this.invulnerable = true;
                }
            } else if (this.spinPhase === 'TELEPORT') {
                this.teleportProgress += dt / 0.4;
                if (this.teleportProgress >= 1) this.teleportProgress = 1;
                let easeT = 1 - Math.pow(1 - this.teleportProgress, 3);
                this.x = this.teleportStartX + (this.teleportTargetX - this.teleportStartX) * easeT;
                this.y = this.teleportStartY + (this.teleportTargetY - this.teleportStartY) * easeT;

                if (this.teleportProgress >= 1) {
                    this.invulnerable = false;
                    // Fire 8 crystal bombs
                    for (let i = 0; i < 8; i++) {
                        let angle = i * Math.PI / 4;
                        this.crystalBombs.push(new CrystalBomb(this.x, this.y, angle));
                        if (Network.isMultiplayer && Network.isHost) {
                            Network.broadcastSubEntity({ entityType: 'CRYSTAL_BOMB', x: this.x, y: this.y, angle: angle });
                        }
                    }
                    this.spinTeleportCount++;
                    if (this.spinTeleportCount >= 5) {
                        this.endAttack();
                    } else {
                        this.spinPhase = 'WAIT';
                        this.waitTimer = 0.3;
                    }
                }
            } else if (this.spinPhase === 'WAIT') {
                this.waitTimer -= dt;
                if (this.waitTimer <= 0) {
                    this.spinPhase = 'TELEPORT';
                    this.teleportStartX = this.x;
                    this.teleportStartY = this.y;
                    // Teleport to random position (not near player, not near current pos)
                    let newX, newY, attempts = 0;
                    do {
                        newX = Math.random() * (canvas.width - 200) + 100;
                        newY = Math.random() * (canvas.height - 200) + 100;
                        attempts++;
                    } while ((Math.hypot(newX - player.x, newY - player.y) < 150 ||
                        Math.hypot(newX - this.x, newY - this.y) < 200) && attempts < 50);
                    this.teleportTargetX = newX;
                    this.teleportTargetY = newY;
                    this.teleportProgress = 0;
                    this.invulnerable = true;
                }
            }
        }

        // SUMMON TURRET
        else if (this.attackState === 'SUMMON_TURRET') {
            let tx = Math.random() * (canvas.width - 100) + 50;
            let ty = Math.random() * (canvas.height - 100) + 50;
            let t = new LaserTurret(tx, ty, this);
            if (Network.isMultiplayer && Network.isHost) {
                t.netId = nextNetEnemyId++; // Assume turrets use same ID pool or separate
                Network.broadcastSubEntity({ entityType: 'TURRET', action: 'SPAWN', x: tx, y: ty, id: t.netId });
            }
            this.turrets.push(t);
            this.endAttack();
        }

        // SHIELD - Spawn shields and immediately return to attacking
        else if (this.attackState === 'SHIELD') {
            // Shields already spawned in startSpecialAttack, end attack immediately
            // Shields will continue to exist and rotate around boss until destroyed
            this.endAttack();
        }

        // CRYSTAL BOMBS - 5 bombs per round, 20 rounds total
        else if (this.attackState === 'CRYSTAL_BOMBS') {
            this.innerRotation += dt * 10;
            this.bombTimer += dt;
            if (this.bombTimer >= 0.5 && this.bombRoundsShot < 20) {
                this.bombTimer = 0;
                // Fire 5 bombs at once
                for (let i = 0; i < 5; i++) {
                    let angle = Math.random() * Math.PI * 2;
                    this.crystalBombs.push(new CrystalBomb(this.x, this.y, angle));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastSubEntity({ entityType: 'CRYSTAL_BOMB', x: this.x, y: this.y, angle: angle });
                    }
                }
                this.bombRoundsShot++;
            }
            if (this.bombRoundsShot >= 20 && this.bombTimer >= 0.5) {
                this.endAttack();
            }
        }

        // BOMB RAM COMBO - Fire 3 bombs at player, then ram, 5 rounds
        else if (this.attackState === 'BOMB_RAM_COMBO') {
            // CHARGE phase - unique spinning purple glow charge-up
            if (this.bombRamPhase === 'CHARGE') {
                this.chargeTimer -= dt;
                this.chargeSpinSpeed = Math.min(20, this.chargeSpinSpeed + dt * 15);
                this.innerRotation += dt * this.chargeSpinSpeed;

                // Spawn purple crystal particles during charge
                if (Math.random() < 0.5) {
                    let angle = Math.random() * Math.PI * 2;
                    let dist = this.r + 30;
                    let px = this.x + Math.cos(angle) * dist;
                    let py = this.y + Math.sin(angle) * dist;
                    // Use explosion particles with purple color for effect
                    explosions.push({
                        x: px, y: py,
                        p: [{
                            x: px, y: py,
                            dx: (this.x - px) * 2,
                            dy: (this.y - py) * 2,
                            life: 0.5,
                            size: 4,
                            color: '#f0f'
                        }],
                        update: function (dt) {
                            for (let i = this.p.length - 1; i >= 0; i--) {
                                let a = this.p[i];
                                a.x += a.dx * dt; a.y += a.dy * dt; a.life -= dt;
                                if (a.life <= 0) this.p.splice(i, 1);
                            }
                        },
                        draw: function () {
                            for (let a of this.p) {
                                ctx.globalAlpha = a.life * 2;
                                ctx.fillStyle = a.color;
                                ctx.shadowBlur = 10;
                                ctx.shadowColor = '#f0f';
                                ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, 2 * Math.PI); ctx.fill();
                            }
                            ctx.globalAlpha = 1;
                            ctx.shadowBlur = 0;
                        }
                    });
                }

                if (this.chargeTimer <= 0) {
                    this.bombRamPhase = 'SHOOT';
                }
            }
            // SHOOT phase
            else if (this.bombRamPhase === 'SHOOT') {
                // Fire 3 crystal bombs at player direction with spread
                let baseAngle = Math.atan2(player.y - this.y, player.x - this.x);
                for (let i = -1; i <= 1; i++) {
                    let angle = baseAngle + i * 0.2; // Small spread
                    this.crystalBombs.push(new CrystalBomb(this.x, this.y, angle));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastSubEntity({ entityType: 'CRYSTAL_BOMB', x: this.x, y: this.y, angle: angle });
                    }
                }
                this.bombRamPhase = 'SHAKE';
                this.shakeTimer = 0.5;
            } else if (this.bombRamPhase === 'SHAKE') {
                if (this.shakeTimer <= 0) {
                    this.bombRamPhase = 'DASH';
                    this.dashTarget = this.calculateBestDirection();
                    this.dashStartX = this.x;
                    this.dashStartY = this.y;
                    this.dashProgress = 0;
                    delete this.bombRamHit;
                }
            } else if (this.bombRamPhase === 'DASH') {
                this.dashProgress += dt / 0.3;
                if (this.dashProgress >= 1) this.dashProgress = 1;
                let easeT = 1 - Math.pow(1 - this.dashProgress, 3);
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * easeT;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * easeT;

                // Collision check (only once per dash)
                if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r && !this.bombRamHit) {
                    this.bombRamHit = true;
                    player.hull = Math.max(0, player.hull - 15);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 50;
                    player.y += Math.sin(angle) * 50;
                    clampPlayerToBounds();
                    // If still colliding after clamp, push sideways
                    if (Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
                        let perpAngle = angle + Math.PI / 2;
                        player.x += Math.cos(perpAngle) * 100;
                        player.y += Math.sin(perpAngle) * 100;
                        clampPlayerToBounds();
                    }
                    player.knockbackImmune = 0.5;
                }

                if (this.dashProgress >= 1) {
                    this.bombRamRound++;
                    delete this.bombRamHit;
                    if (this.bombRamRound >= 5) {
                        this.endAttack();
                    } else {
                        this.bombRamPhase = 'SHOOT'; // Go back to shoot phase
                    }
                }
            }
        }
    }

    calculateBestDirection() {
        // Calculate which of 4 directions is closest to player
        let directions = [
            { x: this.x + 300, y: this.y },      // right
            { x: this.x, y: this.y + 300 },      // down
            { x: this.x - 300, y: this.y },      // left
            { x: this.x, y: this.y - 300 }       // up
        ];

        let bestDir = directions[0];
        let bestDist = Infinity;

        for (let dir of directions) {
            // Clamp to screen bounds
            dir.x = Math.max(this.r + 20, Math.min(canvas.width - this.r - 20, dir.x));
            dir.y = Math.max(this.r + 20, Math.min(canvas.height - this.r - 20, dir.y));

            let dist = Math.hypot(player.x - dir.x, player.y - dir.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = dir;
            }
        }
        return bestDir;
    }

    endAttack() {
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.specialAttackTimer = this.getSpecialAttackCooldown();
    }

    draw() {
        ctx.save();

        // Hurt flash effect
        if (this.hurtTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(this.hurtTimer * 30) * 0.3;
        }

        let drawX = this.x + this.shakeOffset.x;
        let drawY = this.y + this.shakeOffset.y;

        // Outer glow
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#0ff';

        // Outer rotating frame (diamond shape)
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(this.outerRotation);
        ctx.strokeStyle = '#08f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -this.r);
        ctx.lineTo(this.r, 0);
        ctx.lineTo(0, this.r);
        ctx.lineTo(-this.r, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Inner rotating crystal
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(this.innerRotation);
        let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 0.6);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, '#0ff');
        grad.addColorStop(0.7, '#08f');
        grad.addColorStop(1, '#04a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -this.r * 0.7);
        ctx.lineTo(this.r * 0.5, 0);
        ctx.lineTo(0, this.r * 0.7);
        ctx.lineTo(-this.r * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.restore();

        // Draw shields
        for (let s of this.shields) s.draw();

        // Draw turrets
        for (let t of this.turrets) t.draw();

        // Draw crystal bombs
        for (let b of this.crystalBombs) b.draw();

        // Health bar
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(this.x - 120, this.y - this.r - 50, 240, 25);

        let hpPercent = this.hp / this.maxHp;
        let barColor = this.phase === 1 ? '#0ff' : this.phase === 2 ? '#08f' : '#f0f';
        ctx.fillStyle = barColor;
        ctx.fillRect(this.x - 120, this.y - this.r - 50, 240 * hpPercent, 25);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - 120, this.y - this.r - 50, 240, 25);

        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 18px Courier New';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#0ff';
        ctx.fillText('LIQUID CRYSTAL', this.x, this.y - this.r - 58);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Courier New';
        ctx.shadowBlur = 0;
        ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, this.y - this.r - 32);
    }
}

// VOID REAPER - Hard Boss combining Galaxy Destroyer and Liquid Crystal
class VoidReaper {
    constructor() {
        this.x = canvas.width / 2;
        this.y = 150;
        this.r = 100;
        this.hp = 8000;
        this.maxHp = 8000;
        this.dead = false;
        this.speed = 40;
        this.baseSpeed = 40;

        // Movement
        this.movementTimer = Math.random() * 5 + 3;
        this.movementDirection = Math.random() * Math.PI * 2;

        // Attack system
        this.specialAttackTimer = this.getSpecialAttackCooldown();
        this.normalAttackTimer = Math.random() * 3 + 2;
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.invulnerable = false;

        // 4-phase system
        this.phase = 1;
        this.updatePhase();

        // Visual
        this.ringRotation = 0;
        this.tendrilPhase = 0;
        this.enrageGlow = 0;

        // Attack-specific
        this.afterimages = [];
        this.voidPullActive = false;
        this.shields = [];
        this.bombs = [];
        this.crystalBombs = [];
        this.homingOrbs = [];

        // Shake and hurt effects
        this.shakeTimer = 0;
        this.shakeOffset = { x: 0, y: 0 };
        this.hurtTimer = 0;

        // Laser charging
        this.laserCharging = false;
        this.chargeTime = 0;
        this.chargeAngle = 0;
        this.laserAngles = [];
    }

    getSpecialAttackCooldown() {
        if (this.phase === 1) return Math.random() * 4 + 8;
        if (this.phase === 2) return Math.random() * 3 + 5;
        if (this.phase === 3) return Math.random() * 2 + 3;
        return Math.random() * 1.5 + 1.5; // Enrage
    }

    updatePhase() {
        let hpPercent = this.hp / this.maxHp;
        let oldPhase = this.phase;
        if (hpPercent > 0.75) this.phase = 1;
        else if (hpPercent > 0.5) this.phase = 2;
        else if (hpPercent > 0.25) this.phase = 3;
        else this.phase = 4; // Enrage

        // Trigger enrage effects on phase 4
        if (this.phase === 4 && oldPhase !== 4) {
            this.speed = this.baseSpeed * 1.5;
        }
    }

    update(dt) {
        // Visual updates run for both
        this.updatePhase();

        // Update hurt timer
        if (this.hurtTimer > 0) this.hurtTimer -= dt;

        // Visual updates
        this.ringRotation += dt * (this.phase === 4 ? 3 : 1);
        this.tendrilPhase += dt * 2;
        if (this.phase === 4) {
            this.enrageGlow = 0.5 + Math.sin(Date.now() / 100) * 0.3;
        }

        // Sub-entity updates (Client visual)
        for (let b of this.crystalBombs) b.update(dt);
        this.crystalBombs = this.crystalBombs.filter(b => !b.dead);

        for (let o of this.homingOrbs) o.update(dt);
        this.homingOrbs = this.homingOrbs.filter(o => !o.dead);

        for (let s of this.shields) s.update(dt);
        this.shields = this.shields.filter(s => !s.dead);

        // Afterimages
        for (let i = this.afterimages.length - 1; i >= 0; i--) {
            this.afterimages[i].life -= dt;
            if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
        }

        // Void Pull (Client visual physics)
        if (this.voidPullActive) {
            this.voidPullTimer -= dt;
            // Client-side pull effect if active
            let pullAngle = Math.atan2(this.y - player.y, this.x - player.x);
            let pullForce = 80 * dt;
            player.x += Math.cos(pullAngle) * pullForce;
            player.y += Math.sin(pullAngle) * pullForce;
            if (this.voidPullTimer <= 0) this.voidPullActive = false;
        }

        if (Network.isMultiplayer && !Network.isHost) return;


        // Shake effect
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            this.shakeOffset.x = (Math.random() - 0.5) * 15;
            this.shakeOffset.y = (Math.random() - 0.5) * 15;
        } else {
            this.shakeOffset.x = 0;
            this.shakeOffset.y = 0;
        }

        // Movement (when not attacking)
        if (!this.isAttacking) {
            this.movementTimer -= dt;
            if (this.movementTimer <= 0) {
                this.movementDirection = Math.random() * Math.PI * 2;
                this.movementTimer = Math.random() * 5 + 3;
            }

            this.x += Math.cos(this.movementDirection) * this.speed * dt;
            this.y += Math.sin(this.movementDirection) * this.speed * dt;

            // Boundary check
            if (this.x < this.r + 50) { this.x = this.r + 50; this.movementDirection = Math.PI - this.movementDirection; }
            if (this.x > canvas.width - this.r - 50) { this.x = canvas.width - this.r - 50; this.movementDirection = Math.PI - this.movementDirection; }
            if (this.y < this.r + 50) { this.y = this.r + 50; this.movementDirection = -this.movementDirection; }
            if (this.y > canvas.height - this.r - 50) { this.y = canvas.height - this.r - 50; this.movementDirection = -this.movementDirection; }
        }

        // Attack timers
        if (this.attackState === 'IDLE') {
            this.specialAttackTimer -= dt;
            this.normalAttackTimer -= dt;

            if (this.specialAttackTimer <= 0) {
                this.startSpecialAttack();
            } else if (this.normalAttackTimer <= 0) {
                this.startNormalAttack();
            }
        }

        // Handle attacks
        this.handleAttackState(dt);



        // Contact damage - local player
        if (!player.dead && Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
            if (!player.knockbackImmune || player.knockbackImmune <= 0) {
                player.hull = Math.max(0, player.hull - 30 * dt);
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
            }
        }

        // Contact damage - remote players (Host only)
        if (Network.isMultiplayer && Network.isHost) {
            for (let [id, rp] of remotePlayers) {
                if (rp.dead) continue;
                let dist = Math.hypot(rp.x - this.x, rp.y - this.y);
                if (dist < this.r + (rp.r || 23)) {
                    if (!this.lastContactDamage) this.lastContactDamage = {};
                    const now = Date.now();
                    if (!this.lastContactDamage[id] || now - this.lastContactDamage[id] > 100) {
                        this.lastContactDamage[id] = now;
                        const damage = 3; // Higher damage (30 * dt equivalent)
                        const hitAngle = Math.atan2(rp.y - this.y, rp.x - this.x);
                        Network.sendPvpDamage(id, damage, this.x, this.y, hitAngle);
                    }
                }
            }
        }

        // Laser charging
        if (this.laserCharging) {
            this.chargeTime -= dt;
            if (this.chargeTime <= 0) {
                this.laserCharging = false;
                if (this.laserAngles.length > 0) {
                    for (let angle of this.laserAngles) {
                        enemyLasers.push(new EnemyLaser(this.x, this.y, angle));
                    }
                    this.laserAngles = [];
                } else {
                    enemyLasers.push(new EnemyLaser(this.x, this.y, this.chargeAngle));
                }
                this.normalAttackTimer = Math.random() * 2 + 1;
            }
        }


    }

    startSpecialAttack() {
        let attacks = ['MEGA_DASH', 'LASER_STORM', 'BOMB_BARRAGE', 'CRYSTAL_RAIN', 'SPIN_ASSAULT'];
        if (this.phase >= 2) attacks.push('VOID_PULL');
        if (this.phase >= 3) attacks.push('SOUL_HARVEST');
        if (this.phase >= 2) attacks.push('SHIELD_REFLECT');

        this.attackState = attacks[Math.floor(Math.random() * attacks.length)];
        this.isAttacking = true;
        this.attackSubTimer = 0;

        if (this.attackState === 'MEGA_DASH') {
            this.dashPhase = 'CHARGE';
            this.dashChargeTime = 2.0; // Longer charge for fairness
            this.dashCount = 0;
            this.predictedTarget = { x: player.x, y: player.y }; // Target prediction
        } else if (this.attackState === 'LASER_STORM') {
            this.laserStormWave = 0;
            this.laserStormTimer = 0;
        } else if (this.attackState === 'BOMB_BARRAGE') {
            this.bombBarrageCount = 0;
            this.bombTimer = 0;
        } else if (this.attackState === 'CRYSTAL_RAIN') {
            this.crystalRainCount = 0;
            this.crystalRainTimer = 0;
        } else if (this.attackState === 'SPIN_ASSAULT') {
            this.spinPhase = 'TELEPORT_IN';
            this.teleportProgress = 0;
        } else if (this.attackState === 'VOID_PULL') {
            this.voidPullTimer = 3.0;
            this.voidPullActive = true;
            if (Network.isMultiplayer && Network.isHost) {
                Network.broadcastBossAttack(Network.MSG.SYNC_EFFECT, { type: 'VOID_PULL', duration: 3.0 });
            }
        } else if (this.attackState === 'SOUL_HARVEST') {
            this.harvestTimer = 2.0;
        } else if (this.attackState === 'SHIELD_REFLECT') {
            this.shields = [];
            for (let i = 0; i < 6; i++) {
                this.shields.push(new CrystalShield(this, i, 6));
                if (Network.isMultiplayer && Network.isHost) {
                    Network.broadcastSubEntity({ entityType: 'SHIELD', action: 'SPAWN', index: i, total: 6 });
                }
            }
        }
    }

    startNormalAttack() {
        let attacks = ['TRIPLE_SHOT', 'HOMING_ORB', 'QUICK_LASER'];
        let chosen = attacks[Math.floor(Math.random() * attacks.length)];

        if (chosen === 'TRIPLE_SHOT') {
            let baseAngle = Math.atan2(player.y - this.y, player.x - this.x);
            for (let i = -1; i <= 1; i++) {
                bullets.push(new Bullet(this.x, this.y, baseAngle + i * 0.3));
                if (Network.isMultiplayer && Network.isHost) {
                    Network.broadcastBossAttack(Network.MSG.SPAWN_BULLET, { x: this.x, y: this.y, angle: baseAngle + i * 0.3 });
                }
            }
            this.normalAttackTimer = Math.random() * 2 + 1;
        } else if (chosen === 'HOMING_ORB') {
            this.homingOrbs.push(new HomingOrb(this.x, this.y));
            if (Network.isMultiplayer && Network.isHost) {
                Network.broadcastSubEntity({ entityType: 'HOMING_ORB', x: this.x, y: this.y });
            }
            this.normalAttackTimer = Math.random() * 3 + 2;
        } else if (chosen === 'QUICK_LASER') {
            this.laserCharging = true;
            this.chargeTime = 0.5;
            this.chargeAngle = Math.atan2(player.y - this.y, player.x - this.x);
        }
    }

    handleAttackState(dt) {
        if (this.attackState === 'IDLE') return;

        // MEGA_DASH - 3 dashes with afterimages (balanced version)
        if (this.attackState === 'MEGA_DASH') {
            if (this.dashPhase === 'CHARGE') {
                this.dashChargeTime -= dt;
                this.shakeTimer = 0.1;
                if (Math.random() < 0.3) {
                    lightningParticles.push(new LightningParticle(
                        this.x + (Math.random() - 0.5) * this.r * 2,
                        this.y + (Math.random() - 0.5) * this.r * 2
                    ));
                }
                if (this.dashChargeTime <= 0) {
                    this.dashPhase = 'DASH';
                    this.dashTarget = { x: player.x, y: player.y };
                    this.dashStartX = this.x;
                    this.dashStartY = this.y;
                    this.dashProgress = 0;
                    delete this.dashHit;
                }
            } else if (this.dashPhase === 'DASH') {
                this.dashProgress += dt / 0.5; // Slower dash
                if (this.dashProgress > 1) this.dashProgress = 1;

                let oldX = this.x, oldY = this.y;
                let easeT = 1 - Math.pow(1 - this.dashProgress, 3);
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * easeT;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * easeT;

                // Add afterimage
                if (Math.random() < 0.5) {
                    this.afterimages.push({ x: oldX, y: oldY, life: 0.3 });
                }

                // Collision - reduced damage, no stun
                if (!this.dashHit && Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
                    this.dashHit = true;
                    player.hull = Math.max(0, player.hull - 15);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 60;
                    player.y += Math.sin(angle) * 60;
                    clampPlayerToBounds();
                    player.knockbackImmune = 0.5;
                }

                if (this.dashProgress >= 1) {
                    this.dashCount++;
                    delete this.dashHit;
                    if (this.dashCount >= 3) {
                        this.endAttack();
                    } else {
                        // Short pause then charge again
                        this.dashPhase = 'CHARGE';
                        this.dashChargeTime = 1.5;
                    }
                }
            }
        }

        // LASER_STORM - 8 lasers in 2 waves
        else if (this.attackState === 'LASER_STORM') {
            this.laserStormTimer += dt;
            if (this.laserStormTimer >= 1.5 && this.laserStormWave < 2) {
                this.laserStormTimer = 0;
                this.laserCharging = true;
                this.chargeTime = 1.0;
                this.laserAngles = [];
                for (let i = 0; i < 8; i++) {
                    this.laserAngles.push(Math.random() * Math.PI * 2);
                }
                this.laserStormWave++;
                if (this.laserStormWave >= 2) {
                    setTimeout(() => this.endAttack(), 1500);
                }
            }
        }

        // BOMB_BARRAGE - 5 bombs at once
        else if (this.attackState === 'BOMB_BARRAGE') {
            this.bombTimer += dt;
            if (this.bombTimer >= 0.8 && this.bombBarrageCount < 3) {
                this.bombTimer = 0;
                for (let i = 0; i < 5; i++) {
                    let targetX = player.x + (Math.random() - 0.5) * 200;
                    let targetY = player.y + (Math.random() - 0.5) * 200;
                    bombs.push(new Bomb(this.x, this.y, targetX, targetY));
                    if (Network.isMultiplayer && Network.isHost) {
                        Network.broadcastBossAttack(Network.MSG.SPAWN_BOMB, { x: this.x, y: this.y, targetX: targetX, targetY: targetY });
                    }
                }
                this.bombBarrageCount++;
                if (this.bombBarrageCount >= 3) {
                    this.endAttack();
                }
            }
        }

        // CRYSTAL_RAIN - crystals from top
        else if (this.attackState === 'CRYSTAL_RAIN') {
            this.crystalRainTimer += dt;
            if (this.crystalRainTimer >= 0.2 && this.crystalRainCount < 15) {
                this.crystalRainTimer = 0;
                let x = Math.random() * (canvas.width - 100) + 50;
                this.crystalBombs.push(new CrystalBomb(x, -20, Math.PI / 2));
                if (Network.isMultiplayer && Network.isHost) {
                    Network.broadcastSubEntity({ entityType: 'CRYSTAL_BOMB', x: x, y: -20, angle: Math.PI / 2 });
                }
                this.crystalRainCount++;
                if (this.crystalRainCount >= 15) {
                    this.endAttack();
                }
            }
        }

        // SPIN_ASSAULT - teleport then dash
        else if (this.attackState === 'SPIN_ASSAULT') {
            if (this.spinPhase === 'TELEPORT_IN') {
                this.teleportProgress += dt / 0.3;
                this.invulnerable = true;
                if (this.teleportProgress >= 1) {
                    // Teleport near player
                    let angle = Math.random() * Math.PI * 2;
                    this.x = player.x + Math.cos(angle) * 200;
                    this.y = player.y + Math.sin(angle) * 200;
                    this.x = Math.max(this.r, Math.min(canvas.width - this.r, this.x));
                    this.y = Math.max(this.r, Math.min(canvas.height - this.r, this.y));
                    this.spinPhase = 'DASH';
                    this.invulnerable = false;
                    this.dashProgress = 0;
                    this.dashStartX = this.x;
                    this.dashStartY = this.y;
                    this.dashTarget = { x: player.x, y: player.y };
                    delete this.dashHit;
                }
            } else if (this.spinPhase === 'DASH') {
                this.dashProgress += dt / 0.2;
                if (this.dashProgress > 1) this.dashProgress = 1;
                let easeT = 1 - Math.pow(1 - this.dashProgress, 3);
                this.x = this.dashStartX + (this.dashTarget.x - this.dashStartX) * easeT;
                this.y = this.dashStartY + (this.dashTarget.y - this.dashStartY) * easeT;

                if (!this.dashHit && Math.hypot(player.x - this.x, player.y - this.y) < this.r + player.r) {
                    this.dashHit = true;
                    player.hull = Math.max(0, player.hull - 20);
                    hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
                    let angle = Math.atan2(player.y - this.y, player.x - this.x);
                    player.x += Math.cos(angle) * 60;
                    player.y += Math.sin(angle) * 60;
                    clampPlayerToBounds();
                    player.knockbackImmune = 0.5;
                }

                if (this.dashProgress >= 1) {
                    this.endAttack();
                }
            }
        }

        // VOID_PULL - gravity effect
        else if (this.attackState === 'VOID_PULL') {
            this.voidPullTimer -= dt;
            // Spawn particles toward boss
            if (Math.random() < 0.3) {
                let angle = Math.random() * Math.PI * 2;
                let dist = 200 + Math.random() * 100;
                explosions.push({
                    x: this.x + Math.cos(angle) * dist,
                    y: this.y + Math.sin(angle) * dist,
                    p: [{
                        x: this.x + Math.cos(angle) * dist,
                        y: this.y + Math.sin(angle) * dist,
                        dx: -Math.cos(angle) * 200,
                        dy: -Math.sin(angle) * 200,
                        life: 0.5,
                        size: 3,
                        color: '#80f'
                    }],
                    update: function (dt) {
                        for (let i = this.p.length - 1; i >= 0; i--) {
                            let a = this.p[i];
                            a.x += a.dx * dt; a.y += a.dy * dt; a.life -= dt;
                            if (a.life <= 0) this.p.splice(i, 1);
                        }
                    },
                    draw: function () {
                        for (let a of this.p) {
                            ctx.globalAlpha = a.life * 2;
                            ctx.fillStyle = a.color;
                            ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, 2 * Math.PI); ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                    }
                });
            }
            if (this.voidPullTimer <= 0) {
                this.voidPullActive = false;
                this.endAttack();
            }
        }

        // SOUL_HARVEST - drain shields
        else if (this.attackState === 'SOUL_HARVEST') {
            this.harvestTimer -= dt;
            // Drain player shield
            let totalDrain = 0;
            for (let i = 0; i < 4; i++) {
                if (player.shield[i] > 0) {
                    let drain = Math.min(20 * dt, player.shield[i]);
                    player.shield[i] -= drain;
                    totalDrain += drain;
                }
            }
            // Heal boss
            this.hp = Math.min(this.maxHp, this.hp + totalDrain * 2);

            // Visual effect - purple beam
            if (totalDrain > 0 && Math.random() < 0.5) {
                explosions.push({
                    x: player.x, y: player.y,
                    p: [{
                        x: player.x, y: player.y,
                        dx: (this.x - player.x) * 3,
                        dy: (this.y - player.y) * 3,
                        life: 0.3, size: 4, color: '#f0f'
                    }],
                    update: function (dt) {
                        for (let a of this.p) { a.x += a.dx * dt; a.y += a.dy * dt; a.life -= dt; }
                        this.p = this.p.filter(a => a.life > 0);
                    },
                    draw: function () {
                        for (let a of this.p) {
                            ctx.globalAlpha = a.life * 3;
                            ctx.fillStyle = a.color;
                            ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, 2 * Math.PI); ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                    }
                });
            }

            if (this.harvestTimer <= 0) {
                this.endAttack();
            }
        }

        // SHIELD_REFLECT - shields spawned, end when destroyed
        else if (this.attackState === 'SHIELD_REFLECT') {
            // Shields are already spawned, just wait
            this.endAttack();
        }
    }

    endAttack() {
        this.attackState = 'IDLE';
        this.isAttacking = false;
        this.specialAttackTimer = this.getSpecialAttackCooldown();
    }

    draw() {
        ctx.save();

        // Hurt flash
        if (this.hurtTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(this.hurtTimer * 30) * 0.3;
        }

        let drawX = this.x + this.shakeOffset.x;
        let drawY = this.y + this.shakeOffset.y;

        // Enrage glow
        if (this.phase === 4) {
            ctx.shadowBlur = 50;
            ctx.shadowColor = `rgba(255, 0, 64, ${this.enrageGlow})`;
            ctx.fillStyle = `rgba(255, 0, 64, ${this.enrageGlow * 0.3})`;
            ctx.beginPath();
            ctx.arc(drawX, drawY, this.r + 20, 0, Math.PI * 2);
            ctx.fill();
        }

        // Afterimages
        for (let img of this.afterimages) {
            ctx.globalAlpha = img.life * 0.5;
            ctx.fillStyle = '#408';
            ctx.beginPath();
            ctx.arc(img.x, img.y, this.r * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = this.hurtTimer > 0 ? 0.5 + Math.sin(this.hurtTimer * 30) * 0.3 : 1;

        // Outer rings
        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(this.ringRotation);
        ctx.strokeStyle = '#80f';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#80f';
        for (let i = 0; i < 3; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.ellipse(0, 0, this.r * 0.9, this.r * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        // Core
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#40008080';
        let coreGrad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, this.r * 0.7);
        coreGrad.addColorStop(0, '#fff');
        coreGrad.addColorStop(0.2, '#c0f');
        coreGrad.addColorStop(0.5, '#80f');
        coreGrad.addColorStop(1, '#408');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.r * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(drawX, drawY, this.r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.arc(drawX - 5, drawY - 5, this.r * 0.08, 0, Math.PI * 2);
        ctx.fill();

        // Tendrils
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f0f';
        for (let i = 0; i < 6; i++) {
            let angle = i * Math.PI / 3 + this.tendrilPhase * 0.5;
            let wobble = Math.sin(this.tendrilPhase + i) * 20;
            ctx.beginPath();
            ctx.moveTo(drawX + Math.cos(angle) * this.r * 0.7, drawY + Math.sin(angle) * this.r * 0.7);
            ctx.quadraticCurveTo(
                drawX + Math.cos(angle) * (this.r + 30) + wobble,
                drawY + Math.sin(angle) * (this.r + 30) + wobble,
                drawX + Math.cos(angle) * (this.r + 50),
                drawY + Math.sin(angle) * (this.r + 50)
            );
            ctx.stroke();
        }

        ctx.restore();

        // Draw shields
        for (let s of this.shields) s.draw();

        // Draw homing orbs
        for (let o of this.homingOrbs) o.draw();

        // Draw crystal bombs
        for (let b of this.crystalBombs) b.draw();

        // Laser charge indicator
        if (this.laserCharging) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#f0f';
            ctx.strokeStyle = '#f0f';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            if (this.laserAngles.length > 0) {
                for (let angle of this.laserAngles) {
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.x + Math.cos(angle) * 1200, this.y + Math.sin(angle) * 1200);
                    ctx.stroke();
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + Math.cos(this.chargeAngle) * 1200, this.y + Math.sin(this.chargeAngle) * 1200);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Health bar
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(this.x - 150, this.y - this.r - 60, 300, 30);

        let hpPercent = this.hp / this.maxHp;
        let barColor = this.phase === 1 ? '#80f' : this.phase === 2 ? '#c0f' : this.phase === 3 ? '#f0f' : '#f04';
        ctx.fillStyle = barColor;
        ctx.fillRect(this.x - 150, this.y - this.r - 60, 300 * hpPercent, 30);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - 150, this.y - this.r - 60, 300, 30);

        // Phase indicator
        ctx.fillStyle = this.phase === 4 ? '#f00' : '#80f';
        ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(`PHASE ${this.phase}${this.phase === 4 ? ' - ENRAGE' : ''}`, this.x + 148, this.y - this.r - 65);

        ctx.fillStyle = '#80f';
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#80f';
        ctx.fillText('VOID REAPER', this.x, this.y - this.r - 70);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Courier New';
        ctx.shadowBlur = 0;
        ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, this.y - this.r - 38);
    }
}

// Homing Orb projectile for Void Reaper
class HomingOrb {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.speed = 60;
        this.r = 15;
        this.dead = false;
        this.life = 8; // 8 seconds lifetime
        this.rotation = 0;
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) { this.dead = true; return; }

        // Home toward player
        let angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * this.speed * dt;
        this.y += Math.sin(angle) * this.speed * dt;
        this.rotation += dt * 3;

        // Collision with player
        let dist = Math.hypot(player.x - this.x, player.y - this.y);
        let ang = Math.atan2(this.y - player.y, this.x - player.x);
        let sector = getSector(player.angle, ang);

        if (player.shield[sector] > 0 && dist < player.shR) {
            let dmg = player.maxShield * 0.2;
            player.shield[sector] = Math.max(0, player.shield[sector] - dmg);
            player.hits.push(new ShieldHit(ang, sector));
            this.dead = true;
            explosions.push(new Explosion(this.x, this.y));
        } else if (player.shield[sector] <= 0 && dist < this.r + player.r) {
            player.hull = Math.max(0, player.hull - 15);
            hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
            this.dead = true;
            explosions.push(new Explosion(this.x, this.y));
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#f0f';
        let grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.5, '#f0f');
        grad.addColorStop(1, '#808');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}


class Ship {
    constructor(x, y, isPlayer, enemyType) {
        this.x = x; this.y = y; this.isPlayer = isPlayer;
        this.angle = -Math.PI / 2; this.target = -Math.PI / 2; this.dead = false;
        this.r = 23; this.shR = SHIP_SIZE / 2 + 20;
        this.shield = [150, 150, 150, 150]; this.maxShield = 150;
        this.hull = 100; this.maxHull = 100;
        this.hp = 100; this.maxhp = 100;
        this.hits = [];
        this.speed = isPlayer ? SPD : 120;
        if (isPlayer) {
            this.laserOffline = 0; this.torpFwdOffline = 0; this.torpAftOffline = 0;
            this.torpFwdTargetBad = 0; this.torpAftTargetBad = 0; this.baseSpeed = SPD;

            // Bounce Physics
            this.bounceTimer = 0;
            this.bounceVelX = 0;
            this.bounceVelY = 0;
        } else {
            this.aiState = 'chase'; this.aiTimer = Math.random() * 3 + 2;
            this.enemyType = enemyType || 'red';
            this.laserCharging = false;
            this.chargeTime = 0;
            this.chargeAngle = 0;
            // Bounce Physics for Enemies
            this.bounceTimer = 0;
            this.bounceVelX = 0;
            this.bounceVelY = 0;
        }
    }
    takeDamage(amount) {
        this.hull = Math.max(0, this.hull - amount);
        if (this.isPlayer) {
            hullDisplay.innerText = Math.round(this.hull / this.maxHull * 100) + '%';
        }
    }
    update(dt) {
        // Networking: If client, don't simulate remote entities' physics/AI
        const isRemote = Network.isMultiplayer && !Network.isHost && !this.isPlayer;

        // Bounce Physics Override
        if (this.bounceTimer > 0) {
            this.bounceTimer--;
            let nx = this.x + this.bounceVelX;
            let ny = this.y + this.bounceVelY;
            if (nx > SHIP_SIZE / 2 && nx < gameWidth - SHIP_SIZE / 2) this.x = nx;
            if (ny > SHIP_SIZE / 2 && ny < gameHeight - SHIP_SIZE / 2) this.y = ny;
            return; // Skip normal movement/rotation
        }

        let d = this.target - this.angle;
        while (d <= -Math.PI) d += Math.PI * 2;
        while (d > Math.PI) d -= Math.PI * 2;
        if (Math.abs(d) > 0.01) {
            let s = ROT_SPEED * dt;
            if (!isRemote) {
                this.angle += Math.sign(d) * Math.min(Math.abs(d), s);
            }
        }
        if (this.angle > Math.PI) this.angle -= Math.PI * 2;
        if (this.angle < -Math.PI) this.angle += Math.PI * 2;
        if (!this.laserCharging && !isRemote) {
            let vx = Math.cos(this.angle) * this.speed * dt;
            let vy = Math.sin(this.angle) * this.speed * dt;
            let nx = this.x + vx, ny = this.y + vy;
            if (nx > SHIP_SIZE / 2 && nx < gameWidth - SHIP_SIZE / 2) this.x = nx;
            if (ny > SHIP_SIZE / 2 && ny < gameHeight - SHIP_SIZE / 2) this.y = ny;
        }
        for (let i = this.hits.length - 1; i >= 0; i--) {
            this.hits[i].life -= dt * 1.5;
            if (this.hits[i].life <= 0) this.hits.splice(i, 1);
        }
        if (this.isPlayer) {
            if (this.laserOffline > 0) this.laserOffline -= dt;
            if (this.torpFwdOffline > 0) this.torpFwdOffline -= dt;
            if (this.torpAftOffline > 0) this.torpAftOffline -= dt;
            if (this.torpFwdTargetBad > 0) this.torpFwdTargetBad -= dt;
            if (this.torpAftTargetBad > 0) this.torpAftTargetBad -= dt;
            if (this.knockbackImmune > 0) this.knockbackImmune -= dt;
        } else {
            if (this.laserCharging) {
                this.chargeTime -= dt;
                if (this.chargeTime <= 0) {
                    this.laserCharging = false;
                }
            } else {
                this.aiTimer -= dt;
                if (this.aiTimer <= 0) {
                    let states = ['chase', 'evade', 'orbit'];
                    this.aiState = states[Math.floor(Math.random() * states.length)];
                    this.aiTimer = Math.random() * 3 + 2;
                }
            }
        }
    }
    draw() {
        let imgs = this.isPlayer ? playerImgs : (this.enemyType === 'blue' ? blueEnemyImgs : redEnemyImgs);
        let idx = spriteIdx(this.angle);
        let img = imgs[idx];
        if (img) {
            ctx.drawImage(img, this.x - SHIP_SIZE / 2, this.y - SHIP_SIZE / 2);
        } else {
            // Fallback or debug
            // console.warn('Missing sprite:', idx, this.angle);
        }
        if (this.laserCharging) {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#f00';
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            let endX = this.x + Math.cos(this.chargeAngle) * 1200;
            let endY = this.y + Math.sin(this.chargeAngle) * 1200;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        this.drawHP();
        if (this.isPlayer) this.drawShield();
    }
    drawHP() {
        ctx.fillStyle = "red";
        ctx.fillRect(this.x - 35, this.y - 40, 70, 5);
        let percent = this.isPlayer ? (this.hull / this.maxHull) : (this.hp / this.maxhp);
        ctx.fillStyle = "#0f0";
        ctx.fillRect(this.x - 35, this.y - 40, 70 * percent, 5);
    }
    drawShield() {
        let tot = this.shield.reduce((a, b) => a + b, 0);
        if (tot <= 0) return;
        ctx.save();
        for (let i = 0; i < 4; i++) {
            let startAng = -Math.PI / 4 + i * Math.PI / 2 + this.angle;
            let endAng = startAng + Math.PI / 2;
            if (this.shield[i] > 0) {
                let b = ctx.createRadialGradient(this.x, this.y, this.shR * 0.7, this.x, this.y, this.shR);
                b.addColorStop(0, 'rgba(0,140,255,0)');
                b.addColorStop(.7, 'rgba(0,150,255,.05)');
                b.addColorStop(1, 'rgba(100,220,255,.25)');
                ctx.fillStyle = b;
            } else {
                let b = ctx.createRadialGradient(this.x, this.y, this.shR * 0.7, this.x, this.y, this.shR);
                b.addColorStop(0, 'rgba(255,0,0,0)');
                b.addColorStop(.7, 'rgba(255,0,0,.05)');
                b.addColorStop(1, 'rgba(255,100,100,.25)');
                ctx.fillStyle = b;
            }
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.shR, startAng, endAng);
            ctx.lineTo(this.x, this.y);
            ctx.closePath();
            ctx.fill();
            // Only draw arc outline, not the lines to center
            if (this.shield[i] > 0) {
                ctx.strokeStyle = 'rgba(120,200,255,.35)';
            } else {
                ctx.strokeStyle = 'rgba(255,100,100,.5)';
            }
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.shR, startAng, endAng);
            ctx.stroke();
        }
        if (this.hits.length > 0) {
            ctx.save(); // Isolate clip region
            ctx.globalCompositeOperation = "lighter";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.shR, 0, 2 * Math.PI);
            ctx.clip();
            for (let h of this.hits) {
                if (this.shield[h.sector] <= 0) continue;
                let ix = this.x + Math.cos(h.angle) * this.shR;
                let iy = this.y + Math.sin(h.angle) * this.shR;
                let gr = ctx.createRadialGradient(ix, iy, 0, ix, iy, 60);
                let bright = this.shield[h.sector] / this.maxShield;
                gr.addColorStop(0, `rgba(255,255,255,${h.life * bright})`);
                gr.addColorStop(.3, `rgba(0,200,255,${h.life * .8 * bright})`);
                gr.addColorStop(1, 'rgba(0,50,255,0)');
                ctx.fillStyle = gr;
                ctx.fillRect(ix - 60, iy - 60, 120, 120);
            }
            ctx.restore(); // Restore from clip
        }
        ctx.globalCompositeOperation = "source-over"; // Reset composite operation
        ctx.restore();
    }
}

class Torpedo {
    constructor(x, y, a, fwd) {
        this.x = x; this.y = y;
        this.dx = Math.cos(a) * TOR_SPD;
        this.dy = Math.sin(a) * TOR_SPD;
        this.dead = false; this.fwd = fwd;
    }
    update(dt) {
        this.x += this.dx * dt; this.y += this.dy * dt;
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) this.dead = true;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = "#fa0";
        ctx.fillStyle = "#fa0";
        ctx.beginPath();
        let a = Math.atan2(this.dy, this.dx);
        ctx.translate(this.x, this.y);
        ctx.rotate(a);
        ctx.ellipse(0, 0, 8, 4, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffa";
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, a) {
        this.x = x; this.y = y;
        this.dx = Math.cos(a) * 150;
        this.dy = Math.sin(a) * 150;
        this.dead = false; this.r = 3;
    }
    update(dt) {
        this.x += this.dx * dt; this.y += this.dy * dt;
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) this.dead = true;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 5; ctx.shadowColor = "#f00";
        ctx.fillStyle = "#f33";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#faa";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }
}

class EnemyLaser {
    constructor(x, y, a) {
        this.x1 = x; this.y1 = y; this.angle = a;
        this.x2 = x + Math.cos(a) * 1200;
        this.y2 = y + Math.sin(a) * 1200;
        this.dead = false; this.life = 0.3;
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = "#00f";
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = "#00f";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = "#aaf";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

class HealthPack {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 20;
        this.dead = false;
        this.rotation = 0;
        this.pulse = 0;
    }
    update(dt) {
        this.rotation += dt * 2;
        this.pulse += dt * 3;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        let pulseScale = 1 + Math.sin(this.pulse) * 0.1;
        ctx.scale(pulseScale, pulseScale);

        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0f0';

        ctx.fillStyle = 'rgba(0, 200, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();

        let gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r);
        gradient.addColorStop(0, 'rgba(100, 255, 100, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 200, 0, 0.3)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -2, 20, 4);
        ctx.fillRect(-2, -10, 4, 20);

        ctx.restore();
    }
}

class Bomb {
    constructor(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.x = startX;
        this.y = startY;
        this.progress = 0;
        this.flying = true;
        this.timer = 3.0;
        this.dead = false;
        this.exploded = false;
        this.blastRadius = 100;
    }
    update(dt) {
        if (this.flying) {
            this.progress += dt * 1.5;
            if (this.progress >= 1) {
                this.progress = 1;
                this.flying = false;
            }
            // Arc trajectory
            let t = this.progress;
            this.x = this.startX + (this.targetX - this.startX) * t;
            this.y = this.startY + (this.targetY - this.startY) * t - Math.sin(t * Math.PI) * 150;
        } else if (!this.exploded) {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.explode();
            }
        }
    }
    explode() {
        this.exploded = true;
        this.dead = true;

        // Scatter bombs fire 8 bullets instead of area damage
        if (this.isScatter) {
            for (let i = 0; i < 8; i++) {
                let angle = i * Math.PI / 4;
                bullets.push(new Bullet(this.targetX, this.targetY, angle));
            }
        } else {
            // Normal bomb - area damage
            let dist = Math.hypot(player.x - this.targetX, player.y - this.targetY);
            if (dist < this.blastRadius) {
                player.hull = Math.max(0, player.hull - 50);
                hullDisplay.innerText = Math.round(player.hull / player.maxHull * 100) + '%';
            }
        }

        // Explosion particles for both types
        explosions.push(new Explosion(this.targetX, this.targetY));
    }
    draw() {
        if (this.flying) {
            // Draw bomb projectile
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.isScatter ? '#0af' : '#f00';
            ctx.fillStyle = this.isScatter ? '#0af' : '#f33';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (!this.exploded) {
            // Draw blinking bomb on ground
            let blink = Math.floor(this.timer * 4) % 2 === 0;
            if (blink) {
                ctx.save();
                ctx.shadowBlur = 15;
                ctx.shadowColor = this.isScatter ? '#0af' : '#f00';
                ctx.fillStyle = this.isScatter ? '#0af' : '#f00';
                ctx.beginPath();
                ctx.arc(this.targetX, this.targetY, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            // Draw danger zone (not for scatter bombs)
            if (!this.isScatter) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#f00';
                ctx.beginPath();
                ctx.arc(this.targetX, this.targetY, this.blastRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#f00';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.6;
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}
