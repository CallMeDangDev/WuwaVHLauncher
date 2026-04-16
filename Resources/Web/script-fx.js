/* ===========================================
   PARTICLES
   =========================================== */
function initParticles() {
    const c = document.getElementById('particleCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    let W, H;
    const P = [];
    const N = 35;

    function resize() { W = c.width = innerWidth; H = c.height = innerHeight; }
    resize();
    addEventListener('resize', resize);

    class Dot {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random()*W;
            this.y = Math.random()*H;
            this.r = Math.random()*1.8+0.4;
            this.vx = (Math.random()-0.5)*0.25;
            this.vy = -Math.random()*0.35-0.05;
            this.a = Math.random()*0.4+0.08;
            this.da = (Math.random()>0.5?1:-1)*(Math.random()*0.004+0.001);
            const gold = Math.random()>0.35;
            this.R = gold?210:80; this.G = gold?170:195; this.B = gold?68:220;
        }
        tick() {
            this.x += this.vx; this.y += this.vy;
            this.a += this.da;
            if (this.a>0.55) this.da = -Math.abs(this.da);
            if (this.a<0.04) this.da = Math.abs(this.da);
            if (this.y<-10||this.x<-10||this.x>W+10) {
                this.x = Math.random()*W; this.y = H+10; this.a = 0.04;
            }
        }
        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
            ctx.fillStyle = `rgba(${this.R},${this.G},${this.B},${this.a})`;
            ctx.fill();
            if (this.r>1) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.r*3, 0, Math.PI*2);
                ctx.fillStyle = `rgba(${this.R},${this.G},${this.B},${this.a*0.12})`;
                ctx.fill();
            }
        }
    }
    for (let i=0; i<N; i++) P.push(new Dot());
    (function loop() {
        ctx.clearRect(0,0,W,H);
        P.forEach(p => { p.tick(); p.draw(ctx); });
        requestAnimationFrame(loop);
    })();
}

/* ===========================================
   NAV WAVE — Oscillation / Sound-Wave Indicator
   =========================================== */
let navWaveT = 0;      // global time tick

// Indicator lerp state
let _indCurL = 0, _indCurW = 0;   // currently rendered bounds (px from nav left)
let _indTgtL = 0, _indTgtW = 0;   // target bounds
let _indReady = false;

function initNavWave() {
    const canvas = document.getElementById('navWaveCanvas');
    if (!canvas) return;
    (function loop() {
        if (_indReady) {
            // Exponential lerp — ~0.10 per frame at 60 fps ≈ smooth 350 ms settle
            const k = 0.10;
            _indCurL += (_indTgtL - _indCurL) * k;
            _indCurW += (_indTgtW - _indCurW) * k;
        }
        drawNavWave(canvas);
        navWaveT++;
        requestAnimationFrame(loop);
    })();
}

function drawNavWave(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    if (W <= 0 || H <= 0 || !_indReady) return;

    ctx.clearRect(0, 0, W, H);

    const cL = _indCurL;        // indicator left edge (lerped)
    const cW = _indCurW;        // indicator width (lerped)
    if (cW <= 1) return;

    const t = navWaveT;

    // Arch envelope relative to indicator region: 0 at edges, 1 at centre
    const arch = x => Math.sin(Math.PI * (x - cL) / cW);

    // Slow breathe
    const breathe = 0.88 + 0.12 * Math.sin(t * 0.010);

    // Tall parabolic arch
    const MAIN_AMP = H * 0.44;

    const N = 6;

    const drawArc = (side) => {
        for (let i = 0; i < N; i++) {
            const scale  = (i + 1) / N;
            const amp    = MAIN_AMP * scale * breathe;
            const freq   = 0.044 + i * 0.007;
            const speed  = 0.030 + i * 0.004;
            const phase  = i * 0.85 + (side > 0 ? Math.PI : 0);
            const oscAmp = H * 0.040 * scale;

            const yLine  = x =>
                H * 0.50
                + side * amp * arch(x)
                + oscAmp * arch(x) * Math.sin((x - cL) * freq + t * speed + phase);

            const outerRatio = scale;
            const op   = 0.15 + outerRatio * 0.82;
            const lw   = 0.5  + outerRatio * 1.8;
            const blur = 2    + outerRatio * 14;

            ctx.save();
            ctx.shadowColor = `rgba(242,210,100,${op * 0.75})`;
            ctx.shadowBlur  = blur;
            ctx.beginPath();
            for (let x = cL; x <= cL + cW; x++) {
                x === cL ? ctx.moveTo(x, yLine(x)) : ctx.lineTo(x, yLine(x));
            }
            ctx.strokeStyle = `rgba(242,212,100,${op})`;
            ctx.lineWidth   = lw;
            ctx.stroke();
            ctx.restore();
        }
    };

    drawArc(-1); // top arcs
    drawArc(+1); // bottom arcs
}

/* ===========================================
   TOP NAV
   =========================================== */
