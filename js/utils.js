// Helper function to clamp player position to screen bounds
function clampPlayerToBounds() {
    player.x = Math.max(PLAYER_BOUND, Math.min(gameWidth - PLAYER_BOUND, player.x));
    player.y = Math.max(PLAYER_BOUND, Math.min(gameHeight - PLAYER_BOUND, player.y));
}

function spriteIdx(a) {
    let n = a;
    if (n < 0) n += Math.PI * 2;
    return Math.round(n / ROTATION_ANGLE) % ROTATION_STEPS;
}

function getAngle() {
    let x = 0, y = 0; const P = c => keys[c];
    let nx = 0, ny = 0, np = false;
    if (P("Numpad8")) { ny--; np = true } if (P("Numpad2")) { ny++; np = true }
    if (P("Numpad4")) { nx--; np = true } if (P("Numpad6")) { nx++; np = true }
    if (P("Numpad7")) { nx--; ny--; np = true } if (P("Numpad9")) { nx++; ny--; np = true }
    if (P("Numpad1")) { nx--; ny++; np = true } if (P("Numpad3")) { nx++; ny++; np = true }
    if (np) { x = nx; y = ny; } else {
        if (P("ArrowUp")) y--; if (P("ArrowDown")) y++;
        if (P("ArrowLeft")) x--; if (P("ArrowRight")) x++;
    }
    if (x === 0 && y === 0) return { angle: null, label: "None" };
    let ang = Math.atan2(y, x);
    let deg = ang * 180 / Math.PI + 90;
    if (deg < 0) deg += 360;
    let sec = Math.round(deg / 22.5) % 16;
    const L = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return { angle: ang, label: L[sec] };
}

function getSector(shipAngle, hitAngle) {
    let diff = hitAngle - shipAngle;
    while (diff <= -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    // Convert to degrees for simpler logic
    let deg = diff * 180 / Math.PI;

    // 0: Front (-45 to 45)
    // 1: Right (45 to 135)
    // 2: Rear (135 to 180 or -180 to -135)
    // 3: Left (-135 to -45)

    if (deg >= -45 && deg < 45) return 0;
    if (deg >= 45 && deg < 135) return 1;
    if (deg >= -135 && deg < -45) return 3;
    return 2;
}

async function copyToClipboard(text) {
    if (!text) return;
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else {
            throw new Error('Clipboard API unavailable');
        }
    } catch (err) {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";  // Avoid scrolling to bottom
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
    }
}
