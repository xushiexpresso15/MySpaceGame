// Ship sprite arrays
const playerImgs = [], redEnemyImgs = [], blueEnemyImgs = [];

/**
 * COORDINATE SYSTEM:
 * Game uses standard math angles:
 *   0° (0 rad)         = East (right)
 *   90° (π/2 rad)      = South (down) 
 *   180° (π rad)       = West (left)
 *   270° (3π/2 rad)    = North (up)
 * 
 * Initial ship angle is -π/2 = -90° = 270° = pointing UP
 * spriteIdx converts this to index 12 (out of 16)
 * 
 * Therefore: sprite index 0 = ship facing RIGHT (0°)
 *            sprite index 4 = ship facing DOWN (90°)
 *            sprite index 8 = ship facing LEFT (180°)
 *            sprite index 12 = ship facing UP (270°)
 */

function genSprites() {
    // Player ship sprites - 16 frames at 22.5° steps
    for (let i = 0; i < ROTATION_STEPS; i++) {
        let c = document.createElement("canvas");
        c.width = SHIP_SIZE; c.height = SHIP_SIZE;
        let h = c.getContext("2d");

        // Rotation angle for this sprite frame
        // i=0 means angle=0 which means facing RIGHT
        // We rotate the canvas, then draw ship pointing RIGHT (positive X direction)
        let r = i * ROTATION_ANGLE;
        h.translate(SHIP_SIZE / 2, SHIP_SIZE / 2);
        h.rotate(r);

        // Draw ship facing RIGHT (positive X direction, nose at +X)
        // Engine glow at tail (negative X)
        h.shadowBlur = 18; h.shadowColor = "#0ff"; h.fillStyle = "rgba(100,255,255,.8)";
        h.beginPath(); h.moveTo(-22, -10); h.lineTo(-22, 10); h.lineTo(-35, 0); h.fill();
        h.shadowBlur = 0;

        // Ship body with 3D gradient effect (nose pointing right)
        let g = h.createLinearGradient(0, -22, 0, 22);
        g.addColorStop(0, "#003366"); g.addColorStop(.3, "#0088cc");
        g.addColorStop(.5, "#00aaff"); g.addColorStop(.7, "#0088cc"); g.addColorStop(1, "#003366");
        h.fillStyle = g; h.strokeStyle = "#66ccff"; h.lineWidth = 2;
        h.beginPath();
        h.moveTo(28, 0);    // Nose (pointing right = forward)
        h.lineTo(-22, 22);  // Bottom wing
        h.lineTo(-18, 12);  // Inner bottom
        h.lineTo(-22, 0);   // Tail center
        h.lineTo(-18, -12); // Inner top
        h.lineTo(-22, -22); // Top wing
        h.closePath();
        h.fill(); h.stroke();

        // Cockpit with glow
        let cg = h.createRadialGradient(5, 0, 2, 2, 0, 8);
        cg.addColorStop(0, "#ffffcc"); cg.addColorStop(.5, "#ffcc00"); cg.addColorStop(1, "#ff8800");
        h.fillStyle = cg;
        h.beginPath(); h.ellipse(2, 0, 8, 6, 0, 0, 2 * Math.PI); h.fill();

        // Wing details
        h.strokeStyle = "#44aaff"; h.lineWidth = 1;
        h.beginPath(); h.moveTo(-15, -18); h.lineTo(-5, -8); h.stroke();
        h.beginPath(); h.moveTo(-15, 18); h.lineTo(-5, 8); h.stroke();

        playerImgs.push(c);
    }

    // Red enemy sprites - 16 frames
    for (let i = 0; i < ROTATION_STEPS; i++) {
        let c = document.createElement("canvas");
        c.width = SHIP_SIZE; c.height = SHIP_SIZE;
        let h = c.getContext("2d");
        let r = i * ROTATION_ANGLE;
        h.translate(SHIP_SIZE / 2, SHIP_SIZE / 2);
        h.rotate(r);

        // Engine pods at tail (symmetric on both sides)
        h.shadowBlur = 10; h.shadowColor = "#f00"; h.fillStyle = "rgba(255,60,0,.9)";
        h.fillRect(-25, -15, 10, 6); h.fillRect(-25, 9, 10, 6);
        h.shadowBlur = 0;

        // Main hull with 3D gradient (nose pointing right)
        let g = h.createLinearGradient(0, -26, 0, 26);
        g.addColorStop(0, "#330000"); g.addColorStop(.3, "#990000");
        g.addColorStop(.5, "#cc2200"); g.addColorStop(.7, "#990000"); g.addColorStop(1, "#330000");
        h.fillStyle = g; h.strokeStyle = "#ff6644"; h.lineWidth = 2;
        h.beginPath();
        h.moveTo(25, 0);   // Nose (right)
        h.lineTo(-8, 26);  // Bottom
        h.lineTo(-12, 18);
        h.lineTo(-8, 0);   // Tail
        h.lineTo(-12, -18);
        h.lineTo(-8, -26); // Top
        h.closePath();
        h.fill(); h.stroke();

        // Central weapon port
        h.fillStyle = "#660000";
        h.beginPath(); h.arc(8, 0, 4, 0, Math.PI * 2); h.fill();

        redEnemyImgs.push(c);
    }

    // Blue enemy sprites - 16 frames
    for (let i = 0; i < ROTATION_STEPS; i++) {
        let c = document.createElement("canvas");
        c.width = SHIP_SIZE; c.height = SHIP_SIZE;
        let h = c.getContext("2d");
        let r = i * ROTATION_ANGLE;
        h.translate(SHIP_SIZE / 2, SHIP_SIZE / 2);
        h.rotate(r);

        // Engine pods at tail (symmetric on both sides)
        h.shadowBlur = 10; h.shadowColor = "#00f"; h.fillStyle = "rgba(60,100,255,.9)";
        h.fillRect(-25, -15, 10, 6); h.fillRect(-25, 9, 10, 6);
        h.shadowBlur = 0;

        // Main hull with 3D gradient (nose pointing right)
        let g = h.createLinearGradient(0, -26, 0, 26);
        g.addColorStop(0, "#000033"); g.addColorStop(.3, "#000099");
        g.addColorStop(.5, "#2200cc"); g.addColorStop(.7, "#000099"); g.addColorStop(1, "#000033");
        h.fillStyle = g; h.strokeStyle = "#6644ff"; h.lineWidth = 2;
        h.beginPath();
        h.moveTo(25, 0);   // Nose (right)
        h.lineTo(-8, 26);  // Bottom
        h.lineTo(-12, 18);
        h.lineTo(-8, 0);   // Tail
        h.lineTo(-12, -18);
        h.lineTo(-8, -26); // Top
        h.closePath();
        h.fill(); h.stroke();

        // Central weapon port
        h.fillStyle = "#000066";
        h.beginPath(); h.arc(8, 0, 4, 0, Math.PI * 2); h.fill();

        blueEnemyImgs.push(c);
    }

    console.log("Sprites generated:", playerImgs.length, "player,", redEnemyImgs.length, "red,", blueEnemyImgs.length, "blue");
}

// Initialize sprites on load
genSprites();
