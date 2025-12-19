class Star {
    constructor() {
        this.s = [];
        for (let i = 0; i < STAR_CT; i++) {
            this.s.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                sz: Math.random() * 2.5 + .5,
                t: Math.random() > 0.8 ? '#ccf' : (Math.random() > 0.8 ? '#ffc' : '#fff'),
                a: Math.random() * 0.8 + 0.2
            });
        }
    }
    draw() {
        ctx.shadowBlur = 4; ctx.shadowColor = "white";
        for (let s of this.s) {
            ctx.globalAlpha = s.a; ctx.fillStyle = s.t;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.sz, 0, 2 * Math.PI); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
}

class ShieldHit {
    constructor(a, s) { this.angle = a; this.sector = s; this.life = 1; }
}

class Explosion {
    constructor(x, y) {
        this.x = x; this.y = y; this.p = [];
        this.age = 0;
        this.lifeTime = 1.0;

        // Particles
        for (let i = 0; i < 50; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 150 + 50;
            this.p.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                life: Math.random() * 0.5 + 0.5,
                maxLife: 1.0,
                size: Math.random() * 4 + 2,
                color: `hsl(${Math.random() * 60 + 10}, 100%, 60%)` // Orange/Yellow/Red
            });
        }
    }
    update(dt) {
        this.age += dt;
        for (let i = this.p.length - 1; i >= 0; i--) {
            let a = this.p[i];
            a.x += a.dx * dt; a.y += a.dy * dt; a.life -= dt;
            a.dx *= 0.95; // Friction
            a.dy *= 0.95;
            if (a.life <= 0) this.p.splice(i, 1);
        }
    }
    draw() {
        // Central flash
        if (this.age < 0.1) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.age / 0.1);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Shockwave
        if (this.age < 0.5) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.age / 0.5);
            ctx.lineWidth = 15 * (1 - this.age / 0.5);
            ctx.strokeStyle = "#fa0";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.age * 300, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Particles
        for (let a of this.p) {
            ctx.globalAlpha = a.life;
            ctx.fillStyle = a.color;
            ctx.beginPath(); ctx.arc(a.x, a.y, a.size, 0, 2 * Math.PI); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

class AbsorbEffect {
    constructor(enemies, bossX, bossY) {
        this.bossX = bossX;
        this.bossY = bossY;
        this.enemies = enemies.map(e => ({
            ship: e,
            startX: e.x,
            startY: e.y,
            particles: []
        }));
        this.duration = 2.0;
        this.elapsed = 0;
        this.done = false;
        this.pulseParticles = [];
    }
    update(dt) {
        this.elapsed += dt;
        let progress = Math.min(1, this.elapsed / this.duration);
        let easeProgress = 1 - Math.pow(1 - progress, 3);

        for (let e of this.enemies) {
            e.ship.x = e.startX + (this.bossX - e.startX) * easeProgress;
            e.ship.y = e.startY + (this.bossY - e.startY) * easeProgress;

            if (Math.random() < 0.3) {
                e.particles.push({
                    x: e.ship.x + (Math.random() - 0.5) * 40,
                    y: e.ship.y + (Math.random() - 0.5) * 40,
                    vx: (this.bossX - e.ship.x) * 0.5,
                    vy: (this.bossY - e.ship.y) * 0.5,
                    life: 1,
                    size: Math.random() * 3 + 1,
                    color: e.ship.enemyType === 'red' ? '#f33' : '#33f'
                });
            }
        }

        for (let e of this.enemies) {
            for (let i = e.particles.length - 1; i >= 0; i--) {
                let p = e.particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt * 0.8;
                if (p.life <= 0) e.particles.splice(i, 1);
            }
        }

        if (this.elapsed >= this.duration) {
            this.done = true;
        }
    }
    draw() {
        for (let e of this.enemies) {
            // Draw absorbed ship ghost
            ctx.save();
            ctx.globalAlpha = 1 - (this.elapsed / this.duration);
            e.ship.draw();
            ctx.restore();

            // Particles
            for (let p of e.particles) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }
}

class StunEffect {
    constructor() {
        this.duration = 1.0;
        this.elapsed = 0;
        this.done = false;

        // Apply stun CSS effect
        const canvas = document.getElementById('gameCanvas');
        /* 
        if (canvas) {
            canvas.classList.add('md3-stun-shake');
        } 
        */
    }
    update(dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.done = true;
            // Remove stun CSS effect
            const canvas = document.getElementById('gameCanvas');
            /*
            if (canvas) {
                canvas.classList.remove('md3-stun-shake');
            }
            */
        }
    }
    draw() {
        // Screen overlay with pulse effect
        ctx.save();
        const pulse = Math.sin(this.elapsed * 15) * 0.1 + 0.2;
        ctx.globalAlpha = pulse * (1 - this.elapsed / this.duration);
        ctx.fillStyle = '#8800ff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Stars around player head
        for (let i = 0; i < 5; i++) {
            let angle = (this.elapsed * 4 + i * Math.PI * 2 / 5);
            let x = player.x + Math.cos(angle) * 50;
            let y = player.y + Math.sin(angle) * 20 - 45;
            ctx.save();
            ctx.fillStyle = '#ffff00';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ffff00';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 1 - (this.elapsed / this.duration);
            ctx.fillText('★', x, y);
            ctx.restore();
        }

        // Show "STUNNED!" text
        ctx.save();
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff0';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff0';
        ctx.globalAlpha = 0.8 * (1 - this.elapsed / this.duration);
        ctx.fillText('⚡ STUNNED ⚡', player.x, player.y - 80);
        ctx.restore();
    }
}

class LightningParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = (Math.random() - 0.5) * 200;
        this.life = 1;
        this.size = Math.random() * 4 + 2;
        this.color = `hsl(${Math.random() * 60 + 180}, 100%, 70%)`;
        this.path = [{ x, y }];
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.path.push({ x: this.x, y: this.y });
        if (this.path.length > 5) this.path.shift();
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        if (this.path.length > 0) {
            ctx.moveTo(this.path[0].x, this.path[0].y);
            for (let i = 1; i < this.path.length; i++) {
                ctx.lineTo(this.path[i].x, this.path[i].y);
            }
        }
        ctx.stroke();
        ctx.restore();
    }
}

// =====================================================================
// NEW VISUAL EFFECTS FOR WEAPON IMPACTS
// =====================================================================

/**
 * ShieldImpactGlow - Small, diffuse spheroid glow at laser-shield impact point
 * Represents the subtle contact point where laser meets shield
 */
class ShieldImpactGlow {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 0.4;  // Short duration
        this.maxLife = 0.4;
        this.radius = 25;  // Small diffuse glow
    }
    update(dt) {
        this.life -= dt;
    }
    draw() {
        if (this.life <= 0) return;

        let alpha = this.life / this.maxLife;
        let currentRadius = this.radius * (1 + (1 - alpha) * 0.5); // Slight expand

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Outer diffuse glow
        let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentRadius);
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
        grad.addColorStop(0.3, `rgba(100, 200, 255, ${alpha * 0.6})`);
        grad.addColorStop(0.7, `rgba(50, 150, 255, ${alpha * 0.3})`);
        grad.addColorStop(1, 'rgba(0, 100, 255, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

/**
 * SparklerEffect - Sparkler-like sparks for laser hitting hull (no shields)
 * Many tiny bright sparks spraying out like handheld sparkler fireworks
 */
class SparklerEffect {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle || 0;
        this.sparks = [];
        this.age = 0;

        // Create many tiny sparks
        for (let i = 0; i < 30; i++) {
            let sparkAngle = this.angle + Math.PI + (Math.random() - 0.5) * Math.PI * 0.8;
            let speed = Math.random() * 200 + 100;
            this.sparks.push({
                x: x,
                y: y,
                dx: Math.cos(sparkAngle) * speed,
                dy: Math.sin(sparkAngle) * speed,
                life: Math.random() * 0.4 + 0.2,
                maxLife: 0.6,
                size: Math.random() * 2 + 1,
                brightness: Math.random() * 0.5 + 0.5
            });
        }
    }
    update(dt) {
        this.age += dt;
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            let s = this.sparks[i];
            s.x += s.dx * dt;
            s.y += s.dy * dt;
            s.dy += 200 * dt; // Gravity
            s.dx *= 0.98; // Friction
            s.life -= dt;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }
    }
    draw() {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let s of this.sparks) {
            let alpha = (s.life / s.maxLife) * s.brightness;

            // Bright white core
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#fff';
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();

            // Orange/yellow tail
            ctx.shadowBlur = 0;
            ctx.fillStyle = `rgba(255, 200, 100, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

/**
 * SmallExplosion - Smaller explosion for torpedo hitting active shield
 * Represents torpedo being wasted/absorbed by shield
 */
class SmallExplosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.p = [];
        this.age = 0;
        this.lifeTime = 0.5; // Shorter than full explosion

        // Fewer, smaller particles
        for (let i = 0; i < 20; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 80 + 30;
            this.p.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                life: Math.random() * 0.3 + 0.2,
                maxLife: 0.5,
                size: Math.random() * 3 + 1,
                color: `hsl(${Math.random() * 40 + 20}, 100%, 60%)` // Orange/yellow
            });
        }
    }
    update(dt) {
        this.age += dt;
        for (let i = this.p.length - 1; i >= 0; i--) {
            let a = this.p[i];
            a.x += a.dx * dt;
            a.y += a.dy * dt;
            a.life -= dt;
            a.dx *= 0.92;
            a.dy *= 0.92;
            if (a.life <= 0) this.p.splice(i, 1);
        }
    }
    draw() {
        // Small central flash
        if (this.age < 0.05) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.age / 0.05);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 25, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Particles
        for (let a of this.p) {
            ctx.globalAlpha = a.life / a.maxLife;
            ctx.fillStyle = a.color;
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

/**
 * LargeExplosion - Bigger explosion for torpedo hitting hull (no shields)
 * Represents actual damage to ship, larger than shield explosion
 */
class LargeExplosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.p = [];
        this.age = 0;
        this.lifeTime = 1.2; // Longer duration

        // More particles, larger sizes
        for (let i = 0; i < 70; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 200 + 80;
            this.p.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                life: Math.random() * 0.7 + 0.5,
                maxLife: 1.2,
                size: Math.random() * 6 + 3,
                color: `hsl(${Math.random() * 60}, 100%, ${50 + Math.random() * 20}%)` // Red/Orange/Yellow
            });
        }
    }
    update(dt) {
        this.age += dt;
        for (let i = this.p.length - 1; i >= 0; i--) {
            let a = this.p[i];
            a.x += a.dx * dt;
            a.y += a.dy * dt;
            a.life -= dt;
            a.dx *= 0.94;
            a.dy *= 0.94;
            if (a.life <= 0) this.p.splice(i, 1);
        }
    }
    draw() {
        // Large central flash
        if (this.age < 0.15) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.age / 0.15);
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 80, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Shockwave ring
        if (this.age < 0.6) {
            ctx.save();
            ctx.globalAlpha = 1 - (this.age / 0.6);
            ctx.lineWidth = 20 * (1 - this.age / 0.6);
            ctx.strokeStyle = "#fa0";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.age * 400, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Particles
        for (let a of this.p) {
            ctx.globalAlpha = a.life / a.maxLife;
            ctx.fillStyle = a.color;
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}
