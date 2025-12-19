// ============================================
// Material Design 3 - UI Logic
// ============================================

// --- DOM Element References ---
const spectatorOverlay = document.getElementById('spectator-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const btnRestart = document.getElementById('btn-restart');
const btnReload = document.getElementById('btn-reload');
const waitMessage = document.getElementById('wait-message');
const scoreEnemies = document.getElementById('score-enemies');
const scoreTime = document.getElementById('score-time');

// --- Game State ---
let enemiesDestroyedCount = 0;
let gameStartTime = 0;

// ============================================
// Core UI Functions
// ============================================

/**
 * Toggle element visibility using MD3 hidden class
 */
function toggleElement(elementOrId, show) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;
    if (show) {
        el.classList.remove('md3-hidden');
    } else {
        el.classList.add('md3-hidden');
    }
}

/**
 * Mock function to trigger Game Over UI state
 * Called when all players are dead
 */
function checkGameOver(isHost = true, score = 0) {
    showGameOverScreen(isHost, score);
}

/**
 * Show Spectator Mode UI
 * Player is dead but others are still alive
 */
function showSpectatorMode() {
    // Fade out HUD
    const gameUI = document.getElementById('gameUI');
    if (gameUI) {
        gameUI.classList.add('fading-out');
        setTimeout(() => {
            toggleElement(gameUI, false);
        }, 500);
    }

    // Show spectator overlay
    toggleElement(spectatorOverlay, true);
    toggleElement(gameOverOverlay, false);
}

/**
 * Show Game Over Screen
 * All players are dead
 */
function showGameOverScreen(isHost, score) {
    // Hide HUD
    toggleElement('gameUI', false);
    toggleElement(spectatorOverlay, false);

    // Update stats
    if (scoreEnemies) scoreEnemies.textContent = score || enemiesDestroyedCount;
    if (scoreTime) {
        const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        scoreTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Show/hide restart button based on host status
    if (isHost) {
        toggleElement(btnRestart, true);
        toggleElement(waitMessage, false);
    } else {
        toggleElement(btnRestart, false);
        toggleElement(waitMessage, true);
    }

    // Show overlay
    toggleElement(gameOverOverlay, true);
}

/**
 * Reset UI to playing state
 */
function resetGameUI() {
    toggleElement('gameUI', true);
    toggleElement(spectatorOverlay, false);
    toggleElement(gameOverOverlay, false);

    const gameUI = document.getElementById('gameUI');
    if (gameUI) gameUI.classList.remove('fading-out');

    // Reset counters
    enemiesDestroyedCount = 0;
    gameStartTime = Date.now();
}

/**
 * Handle Restart Action
 */
function handleRestartAction() {
    // Reset remote players' status first (host side)
    if (typeof remotePlayers !== 'undefined') {
        for (let [id, rp] of remotePlayers) {
            rp.dead = false;
            rp.hull = rp.maxHull || 100;
        }
    }

    if (typeof restartGame === 'function') {
        restartGame();
    }
    if (typeof Network !== 'undefined' && Network.isMultiplayer && Network.isHost) {
        Network.broadcast(Network.MSG.GAME_RESTART, {});
    }
    resetGameUI();

    // Show HUD after restart
    const hud = document.getElementById('md3-hud');
    if (hud) hud.classList.remove('md3-hidden');
    const partyHud = document.getElementById('md3-party-hud');
    if (partyHud) partyHud.classList.remove('md3-hidden');

    // Update party HUD
    if (typeof updatePartyHUD === 'function') updatePartyHUD();
}

/**
 * Handle Reload Action
 */
function handleReloadAction() {
    if (typeof torpFwd !== 'undefined') {
        torpFwd = 12;
        torpAft = 5;
        torpFwdDisplay.innerText = torpFwd;
        torpAftDisplay.innerText = torpAft;
        canReload = false;
        reloadTimer = 0;
        toggleElement(btnReload, false);
    }
}

// ============================================
// MD3 Ripple Effect
// ============================================

function createRipple(event) {
    const button = event.currentTarget;

    // Remove existing ripples
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();

    // Create new ripple
    const ripple = document.createElement('span');
    ripple.classList.add('ripple');

    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

    button.appendChild(ripple);

    // Remove after animation
    setTimeout(() => ripple.remove(), 600);
}

// ============================================
// Event Listeners - Mouse Only
// ============================================

// Restart Button
if (btnRestart) {
    btnRestart.addEventListener('click', (e) => {
        createRipple(e);
        setTimeout(handleRestartAction, 300);
    });
}

// Reload Button
if (btnReload) {
    btnReload.addEventListener('click', (e) => {
        createRipple(e);
        setTimeout(handleReloadAction, 150);
    });
}

// ============================================
// Utility Functions
// ============================================

function showClipboardFeedback(message) {
    const el = document.getElementById('clipboardFeedback');
    el.innerText = message;
    el.style.display = 'block';
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'fadeOut 1s ease-out forwards';
    setTimeout(() => { el.style.display = 'none'; }, 1000);
}

/**
 * Show reload button when ammo is empty
 */
function showReloadButton() {
    toggleElement(btnReload, true);
}

/**
 * Increment enemy destroyed counter
 */
function incrementEnemyScore() {
    enemiesDestroyedCount++;
}

// ============================================
// Legacy Canvas Menu Functions
// ============================================

function drawMenu() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') {
        return; // Don't draw canvas menu, don't touch legacy UI elements
    }

    // Legacy fallback only
    menuControls.style.display = 'block';
    gameUI.style.display = 'none';
    timerDisplay.style.display = 'none';
    toggleElement(spectatorOverlay, false);
    toggleElement(gameOverOverlay, false);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0ff';
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 60px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE SHOOTER', canvas.width / 2, 150);
    ctx.restore();

    ctx.fillStyle = '#888';
    ctx.font = '20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('Select Game Mode', canvas.width / 2, 200);

    let options = ['NORMAL MODE', 'BOSS BATTLE', 'MULTIPLAYER'];
    for (let i = 0; i < options.length; i++) {
        ctx.save();
        if (i === menuSelection) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0f0';
            ctx.fillStyle = '#0f0';
            ctx.fillText('> ' + options[i] + ' <', canvas.width / 2, 280 + i * 50);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText(options[i], canvas.width / 2, 280 + i * 50);
        }
        ctx.restore();
    }

    ctx.fillStyle = '#555';
    ctx.font = '16px Courier New';
    if (menuSelection === 0) {
        ctx.fillText('Fight enemies and survive until the boss appears', canvas.width / 2, 480);
    } else if (menuSelection === 1) {
        ctx.fillText('Jump directly into a boss fight', canvas.width / 2, 480);
    } else {
        ctx.fillText('Play with another player over LAN', canvas.width / 2, 480);
    }

    ctx.fillStyle = '#444';
    ctx.font = '14px Courier New';
    ctx.fillText('↑↓ to select, ENTER to confirm', canvas.width / 2, canvas.height - 50);
}

function drawBossSelect() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') return;

    menuControls.style.display = 'block';
    gameUI.style.display = 'none';
    timerDisplay.style.display = 'none';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#f80';
    ctx.fillStyle = '#f80';
    ctx.font = 'bold 50px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT BOSS', canvas.width / 2, 120);
    ctx.restore();

    let bosses = [
        { name: 'GALAXY DESTROYER', color: '#f80', desc: 'Aggressive attacker with lasers and bombs' },
        { name: 'LIQUID CRYSTAL', color: '#0ff', desc: 'Crystal boss with shields and dash attacks' },
        { name: 'VOID REAPER', color: '#80f', desc: '[HARD] 4-phase boss with gravity pull and soul harvest' }
    ];

    for (let i = 0; i < bosses.length; i++) {
        let y = 220 + i * 150;
        ctx.save();
        if (i === bossSelection) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = bosses[i].color;
            ctx.strokeStyle = bosses[i].color;
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
        }
        ctx.strokeRect(canvas.width / 2 - 200, y - 40, 400, 100);
        ctx.font = 'bold 28px Courier New';
        ctx.fillStyle = i === bossSelection ? bosses[i].color : '#666';
        ctx.textAlign = 'center';
        ctx.fillText(bosses[i].name, canvas.width / 2, y);
        ctx.font = '14px Courier New';
        ctx.fillStyle = '#555';
        ctx.fillText(bosses[i].desc, canvas.width / 2, y + 35);
        ctx.restore();
    }

    ctx.fillStyle = '#444';
    ctx.font = '14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ to select, ENTER to fight, ESC to go back', canvas.width / 2, canvas.height - 50);
}

function drawNameInput() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0af';
    ctx.fillStyle = '#0af';
    ctx.font = 'bold 50px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('IDENTIFICATION', canvas.width / 2, 120);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = '20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('Enter your callsign:', canvas.width / 2, 220);

    ctx.strokeStyle = '#0af';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width / 2 - 150, 250, 300, 50);

    ctx.fillStyle = '#0f0';
    ctx.font = '28px Courier New';
    let display = myPlayerName + (Math.floor(Date.now() / 500) % 2 === 0 ? '_' : '');
    ctx.fillText(display, canvas.width / 2, 285);

    ctx.fillStyle = '#444';
    ctx.font = '14px Courier New';
    ctx.fillText('Type to edit, ENTER to confirm', canvas.width / 2, 350);
}

function drawMPMenu() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0af';
    ctx.fillStyle = '#0af';
    ctx.font = 'bold 50px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER', canvas.width / 2, 120);
    ctx.restore();

    let options = ['HOST GAME', 'JOIN GAME'];
    for (let i = 0; i < options.length; i++) {
        ctx.save();
        ctx.font = '28px Courier New';
        ctx.textAlign = 'center';
        if (i === mpSelection) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0f0';
            ctx.fillStyle = '#0f0';
            ctx.fillText('> ' + options[i] + ' <', canvas.width / 2, 250 + i * 60);
        } else {
            ctx.fillStyle = '#666';
            ctx.fillText(options[i], canvas.width / 2, 250 + i * 60);
        }
        ctx.restore();
    }

    ctx.fillStyle = '#555';
    ctx.font = '16px Courier New';
    ctx.textAlign = 'center';
    if (mpSelection === 0) {
        ctx.fillText('Create a party and invite others', canvas.width / 2, 420);
    } else {
        ctx.fillText('Join an existing party via code', canvas.width / 2, 420);
    }

    ctx.fillStyle = '#444';
    ctx.font = '14px Courier New';
    ctx.fillText('↑↓ select, ENTER confirm, ESC back', canvas.width / 2, canvas.height - 50);
}

function drawHostLobby() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0f0';
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 40px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PARTY LOBBY (HOST)', canvas.width / 2, 80);
    ctx.restore();

    let startY = 150;
    ctx.font = '20px Courier New';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText('Squadron Members:', canvas.width / 2 - 200, 130);

    ctx.fillStyle = '#0f0';
    ctx.fillText(`1. ${myPlayerName} (Host)`, canvas.width / 2 - 180, startY);

    let idx = 2;
    for (let [id, slot] of Network.connections) {
        let status = slot.active ? 'CONNECTED' : 'PENDING JOIN...';
        let color = slot.active ? '#0f0' : '#ff0';
        let name = slot.name || 'Unknown';
        ctx.fillStyle = color;
        ctx.fillText(`${idx}. ${name} [${status}]`, canvas.width / 2 - 180, startY + (idx - 1) * 30);
        if (!slot.active && connectionCode && slot.id === JSON.parse(atob(connectionCode)).id) {
            ctx.fillStyle = '#ff0';
            ctx.font = '12px monospace';
            ctx.fillText(`   (Current Invite Code for this slot)`, canvas.width / 2 + 150, startY + (idx - 1) * 30);
        }
        idx++;
    }

    let nextY = 400;
    if (connectionCode) {
        ctx.fillStyle = '#888';
        ctx.font = '14px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('Invite Code (Send to Player ' + (idx - 1) + '):', canvas.width / 2, nextY);
        ctx.fillStyle = 'rgba(0, 50, 80, .4)';
        ctx.strokeStyle = 'rgba(0, 170, 255, .3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(canvas.width / 2 - 250, nextY + 10, 500, 60, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0af';
        ctx.font = '10px monospace';
        let preview = connectionCode.length > 70 ? connectionCode.substring(0, 70) + '...' : connectionCode;
        ctx.fillText(preview, canvas.width / 2, nextY + 45);
        ctx.fillStyle = '#ff0';
        ctx.font = '14px Courier New';
        ctx.fillText('Press C to COPY | Press V to PASTE Answer', canvas.width / 2, nextY + 90);
    } else {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '16px Courier New';
        ctx.fillText('Press N to invite new player', canvas.width / 2, nextY + 45);
    }

    ctx.fillStyle = '#0f0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Courier New';
    ctx.fillText('Press ENTER to Launch Mission', canvas.width / 2, 550);
}

function drawJoinLobby() {
    // SKIP if DOM MenuManager is handling menus
    if (typeof MenuManager !== 'undefined') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.draw();

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0af';
    ctx.fillStyle = '#0af';
    ctx.font = 'bold 40px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('JOIN SQUADRON', canvas.width / 2, 100);
    ctx.restore();

    ctx.textAlign = 'center';
    if (!Network.connected) {
        if (!connectionCode) {
            ctx.fillStyle = '#888';
            ctx.font = '18px Courier New';
            ctx.fillText('Waiting for Invite Code...', canvas.width / 2, 200);
            ctx.fillText('Press V to PASTE Code from Host', canvas.width / 2, 230);
        } else {
            ctx.fillStyle = '#0f0';
            ctx.font = '18px Courier New';
            ctx.fillText('Answer Generated!', canvas.width / 2, 200);
            ctx.fillStyle = '#ff0';
            ctx.fillText('Press C to COPY Answer -> Send to Host', canvas.width / 2, 230);
            ctx.fillStyle = 'rgba(0, 50, 80, .4)';
            ctx.strokeStyle = '#0f0';
            ctx.strokeRect(canvas.width / 2 - 250, 250, 500, 60);
            ctx.fillStyle = '#0af';
            ctx.font = '10px monospace';
            let preview = connectionCode.length > 70 ? connectionCode.substring(0, 70) + '...' : connectionCode;
            ctx.fillText(preview, canvas.width / 2, 285);
        }
    } else {
        ctx.fillStyle = '#0f0';
        ctx.font = '30px Courier New';
        ctx.fillText('CONNECTED TO HOST', canvas.width / 2, 250);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Courier New';
        ctx.fillText('Waiting for mission start...', canvas.width / 2, 300);
        ctx.fillStyle = '#888';
        ctx.font = '14px Courier New';
        ctx.fillText(`Squadron: ${remotePlayers.size + 1} pilots ready`, canvas.width / 2, 350);
    }

    ctx.fillStyle = '#444';
    ctx.font = '14px Courier New';
    ctx.fillText('ESC to cancel', canvas.width / 2, canvas.height - 50);
}
