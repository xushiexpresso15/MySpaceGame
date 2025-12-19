// DOM Elements and Context
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const menuControls = document.getElementById("menuControls");
const gameUI = document.getElementById("gameUI");
const torpFwdDisplay = document.getElementById("torpFwd");
const torpAftDisplay = document.getElementById("torpAft");
const hullDisplay = document.getElementById("hullDisplay");
const reloadMsg = document.getElementById("reloadMsg");
const timerDisplay = document.getElementById("timer");

canvas.width = innerWidth;
canvas.height = innerHeight;

// Game Area (Negotiated)
let gameWidth = canvas.width;
let gameHeight = canvas.height;

// Game State
let gameState = 'NAME_INPUT';
let gameOver = false;
let gameMode = 'COOP'; // 'COOP' or 'PVP'
let pvpEnabled = false; // PVP mode - players can damage each other
let enemySpawnEnabled = true; // Enemy spawn - set to false for peaceful mode
let survivalTimer = 0;
let menuSelection = 0;
let bossSelection = 0;
let mpSelection = 0;
let connectionCode = '';

// Entities
let player;
let enemies = [];
let healthPacks = [];
let bombs = [];
let bullets = [];
let enemyLasers = [];
let explosions = [];
let torps = [];
let lightningParticles = [];
let stunEffect = null;
let absorbEffect = null;
let lasers = []; // Local laser visuals
let stars; // Starfield

// New visual effect arrays
let shieldImpactGlows = [];  // Laser + shield small diffuse glow
let sparklerEffects = [];    // Laser + hull sparkler sparks

// Boss State
let boss = null;
let bossActive = false;
let bossTimer = 60;
let selectedBossType = null;

// Player Stats
let torpFwd = 12;
let torpAft = 5;
let laserReady = true;
let laserCooldown = 0;
let laserBurst = 0;
let canReload = false;
let reloadTimer = 0;

// Spawning Timers
let enemySpawnTimer = 0;
let healthPackTimer = 10;

// ID Counters
let nextNetEnemyId = 1;
let nextHealthPackId = 1;

// Network Timers
let lastNetworkUpdate = 0;
let lastShieldSyncTime = 0;

// Remote Visuals
let remoteLaserActive = false;
let remoteLaserData = null;
let remoteLaserTimer = 0;

// Multiplayer / Party State
let myPlayerName = "Commander";
let remotePlayers = new Map(); // id -> { x, y, angle, hull, maxHull, dead, name, etc. }
let isSpectating = false;

// Input
const keys = {};
const mouse = { x: 0, y: 0 };
