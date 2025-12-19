// ========== GAME CONSTANTS ==========
const SHIP_SIZE = 80;  // 80x80 pixel sprites (increased from 60 to prevent clipping)
const ROTATION_STEPS = 16;  // 22.5° per step (360/16 = 22.5°)
const ROTATION_ANGLE = 22.5 * Math.PI / 180;  // 22.5° in radians
const ROT_SPEED = Math.PI * 2.5, SPD = 160, TOR_SPD = 360, STAR_CT = 250;
const PLAYER_BOUND = SHIP_SIZE / 2;

// ========== NETWORK CONSTANTS ==========
const PROTOCOL_VERSION = 1;
const NETWORK_HZ = 30;  // 30 updates per second
const NETWORK_INTERVAL = 1000 / NETWORK_HZ;  // ~33.33ms
const SHIELD_SYNC_INTERVAL = 1000;
