/* =============================================
   WUTHERING WAVES VIỆT HOÁ LAUNCHER - Script
   ============================================= */

const S = {
    page: 'home',
    installing: false, installed: false,
    gamePath: '',
    cfg: { gamePath:'' },
    autoCheckDone: false
};

const bridge = () => window.chrome?.webview?.hostObjects?.launcher;

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initTopBar();
    initTopNav();
    initBottomBar();
    initAudioPlayer();
    initWaterRipple();
    initFontCreator();
    loadSettings();
    loadVersions();
});

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
   NAV WAVE â€” Oscillation / Sound-Wave Indicator
   =========================================== */
let navWaveT = 0;      // global time tick

function initNavWave() {
    const canvas = document.getElementById('navWaveCanvas');
    if (!canvas) return;
    // height is set by updateNavIndicator; just start the loop
    (function loop() {
        drawNavWave(canvas);
        navWaveT++;
        requestAnimationFrame(loop);
    })();
}

function drawNavWave(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    if (W <= 0 || H <= 0) return;

    ctx.clearRect(0, 0, W, H);

    const t = navWaveT;

    // Arch envelope: sin(Ï€x/W) â†’ 0 at both tips, 1 at center â†’ pointed ends
    const arch = x => Math.sin(Math.PI * x / W);

    // Slow breathe
    const breathe = 0.88 + 0.12 * Math.sin(t * 0.010);

    // Tall parabolic arch â€” H*0.44 â‰ˆ Â±31px in 70px bar (fills most of bar height)
    const MAIN_AMP = H * 0.44;

    // N stacked layers per side (inner â†’ outer).
    // Each layer i: scale = (i+1)/N â†’ outermost layer = full amp, innermost = small.
    // Layers stack up like a waveform spectrum / audio oscilloscope.
    const N = 6;

    const drawArc = (side) => {
        // side = +1 (bottom) or -1 (top)
        for (let i = 0; i < N; i++) {
            const scale  = (i + 1) / N;                    // 0.17 â€¦ 1.00
            const amp    = MAIN_AMP * scale * breathe;

            // Each layer has unique oscillation: freq & phase vary by layer
            const freq   = 0.044 + i * 0.007;
            const speed  = 0.030 + i * 0.004;
            const phase  = i * 0.85 + (side > 0 ? Math.PI : 0);
            const oscAmp = H * 0.040 * scale;              // oscillation grows with layer

            const yLine  = x =>
                H * 0.50
                + side * amp * arch(x)
                + oscAmp * arch(x) * Math.sin(x * freq + t * speed + phase);

            // Outermost layers: bright & thick; inner layers: dim & thin
            const outerRatio = scale;                       // 0 â†’ 1
            const op   = 0.15 + outerRatio * 0.82;
            const lw   = 0.5  + outerRatio * 1.8;
            const blur = 2    + outerRatio * 14;

            ctx.save();
            ctx.shadowColor = `rgba(242,210,100,${op * 0.75})`;
            ctx.shadowBlur  = blur;
            ctx.beginPath();
            for (let x = 0; x <= W; x++) {
                x === 0 ? ctx.moveTo(x, yLine(x)) : ctx.lineTo(x, yLine(x));
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
function initTopNav() {
    document.querySelectorAll('.top-nav__item').forEach(btn => {
        btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });
    // Position indicator then start oscillation
    requestAnimationFrame(() => {
        updateNavIndicator();
        initNavWave();
    });
}

function switchPage(page) {
    S.page = page;
    const isHome = page === 'home';
    document.querySelectorAll('.top-nav__item').forEach(b =>
        b.classList.toggle('active', b.dataset.page === page));
    document.getElementById('rightPanel').style.display      = isHome ? '' : 'none';
    document.getElementById('pageFontCreator').style.display = isHome ? 'none' : '';
    updateNavIndicator();
    if (!isHome) fcRefreshStatus();
}

function updateNavIndicator() {
    const active = document.querySelector('.top-nav__item.active');
    const ind    = document.getElementById('topNavIndicator');
    const nav    = document.getElementById('topNav');
    if (!active || !ind || !nav) return;
    const w = active.offsetWidth;
    const h = nav.offsetHeight;
    ind.style.width = w + 'px';
    ind.style.left  = active.offsetLeft + 'px';
    // Keep canvas pixel dimensions in sync with full bar height
    const canvas = document.getElementById('navWaveCanvas');
    if (canvas) {
        canvas.width  = w; canvas.style.width  = w + 'px';
        canvas.height = h; canvas.style.height = h + 'px';
    }
}

/* ===========================================
   TOP BAR
   =========================================== */
function initTopBar() {
    document.getElementById('btnMinimize')?.addEventListener('click', () => bridge()?.MinimizeWindow());
    document.getElementById('btnClose')?.addEventListener('click', () => bridge()?.CloseWindow());
    // Drag whole window â€” exclude interactive elements
    document.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        if (e.target.closest('button, a, input, select, label, .sidebar__inner, .right-panel')) return;
        window.chrome?.webview?.postMessage('drag');
    });
}

/* ===========================================
   BOTTOM BAR
   =========================================== */
function initBottomBar() {
    document.getElementById('btnStart')?.addEventListener('click', handleStart);

    // Hamburger menu
    const menuBtn  = document.getElementById('btnMenu');
    const dropdown = document.getElementById('rpDropdown');
    menuBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const open = dropdown?.classList.toggle('open');
        menuBtn.classList.toggle('active', !!open);
    });
    document.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
    });

    // Dropdown items
    document.getElementById('menuGameDir')?.addEventListener('click', async () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        await browseFolder();
    });

    document.getElementById('menuCheckVH')?.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }
        if (S.installing) return;
        startInstall();
    });

    document.getElementById('menuCheckUpdate')?.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        checkLauncherUpdate(false);
    });

    document.getElementById('menuForceQuit')?.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        if (bridge()) {
            bridge().ForceQuitGame();
            toast('Đã buộc thoát game.', 'ok');
        } else {
            toast('Demo: Buộc thoát game...', 'info');
        }
    });

    document.getElementById('menuRestartAdmin')?.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        if (bridge()) {
            bridge().RestartAsAdmin();
        } else {
            toast('Demo: Khởi động lại với Admin...', 'info');
        }
    });

    document.getElementById('menuUninstall')?.addEventListener('click', async () => {
        dropdown?.classList.remove('open');
        document.getElementById('btnMenu')?.classList.remove('active');
        if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }
        const confirmed = await showConfirm('Bạn có chắc muốn gỡ bỏ bản Việt Hoá không?');
        if (!confirmed) return;
        if (bridge()) {
            const result = await bridge().Uninstall(S.gamePath);
            if (result === 'ok') {
                S.installed = false;
                const btn = document.getElementById('btnStart');
                const txt = document.getElementById('startBtnText');
                btn.classList.remove('installed');
                txt.textContent = 'Cài Việt Hoá';
                toast('Đã gỡ cài đặt Việt Hoá.', 'ok');
            } else {
                toast('Lỗi: ' + result, 'err');
            }
        } else {
            toast('Demo: Gỡ cài đặt...', 'info');
        }
    });
}

async function handleStart() {
    if (S.installing) return;
    if (!S.gamePath) {
        if (!await browseFolder()) return;
    }
    if (S.installed) { launchGame(); return; }
    startInstall();
}

function startInstall() {
    S.installing = true;
    const btn = document.getElementById('btnStart');
    const txt = document.getElementById('startBtnText');
    const prog = document.getElementById('progressSection');
    btn.classList.remove('installed');
    btn.classList.add('installing','disabled');
    txt.textContent = 'Đang cài đặt...';
    prog.style.display = '';

    if (bridge()) {
        bridge().StartInstallation(S.gamePath, S.cfg.vhMode, S.cfg.backup);
    } else {
        simulateInstall();
    }
}

function simulateInstall() {
    let p = 0;
    const total = 256;
    const iv = setInterval(() => {
        p += Math.random()*3+1;
        if (p>100) p = 100;
        setProgress(p, 'Đang tải xuống bản Việt Hoá...',
            (Math.random()*15+5).toFixed(1)+' MB/s',
            (total*p/100).toFixed(0)+' / '+total+' MB');
        if (p>=100) {
            clearInterval(iv);
            setTimeout(() => {
                setProgress(100, 'Đang cài đặt...', '', '');
                setTimeout(installDone, 1200);
            }, 400);
        }
    }, 150);
}

function setProgress(pct, text, speed, size) {
    const fill = document.getElementById('progressFill');
    const t = document.getElementById('progressText');
    const pc = document.getElementById('progressPct');
    const sp = document.getElementById('progressSpeed');
    const sz = document.getElementById('progressSize');
    if (fill) fill.style.width = pct+'%';
    if (t) t.textContent = text;
    if (pc) pc.textContent = Math.round(pct)+'%';
    if (sp) sp.textContent = speed;
    if (sz) sz.textContent = size;
}

function installDone() {
    S.installing = false;
    S.installed = true;
    loadVersions();
    const btn = document.getElementById('btnStart');
    const txt = document.getElementById('startBtnText');
    const prog = document.getElementById('progressSection');
    btn.classList.remove('installing','disabled');
    btn.classList.add('installed');
    txt.textContent = 'Chơi Game';
    prog.style.display = 'none';
    toast('Cài đặt Việt Hoá thành công!','ok');
}

function launchGame() {
    const dx11 = document.getElementById('chkDx11')?.checked ?? false;
    if (bridge()) {
        bridge().LaunchGame(S.gamePath, dx11);
    } else {
        toast('Demo: Đang khởi chạy game...','info');
    }
}

/* C# callbacks */
window.onProgressUpdate  = (p,t,sp,sz) => setProgress(p,t,sp,sz);
window.onInstallComplete = () => installDone();
window.onInstallError = msg => {
    S.installing = false;
    const btn  = document.getElementById('btnStart');
    const txt  = document.getElementById('startBtnText');
    const prog = document.getElementById('progressSection');
    btn.classList.remove('installing','disabled');
    txt.textContent = 'Thử lại';
    prog.style.display = 'none';
    toast('Lỗi: '+msg,'err');
};
window.onAdminRequired = () => {
    S.installing = false;
    const btn  = document.getElementById('btnStart');
    const txt  = document.getElementById('startBtnText');
    const prog = document.getElementById('progressSection');
    btn.classList.remove('installing','disabled');
    txt.textContent = 'Khởi động lại (Admin)';
    prog.style.display = 'none';
    
    // Change button behavior temporarily for restart
    const oldHandler = handleStart;
    btn.removeEventListener('click', oldHandler);
    
    const adminHandler = () => {
        if (bridge()) bridge().RestartAsAdmin();
    };
    btn.addEventListener('click', adminHandler);
    
    toast('Thư mục game đang bị khóa. Cần quyền Admin!', 'err');
};
window.onGamePathDetected = path => {
    S.gamePath = path;
    S.cfg.gamePath = path;
    // Auto check for update on startup once path is known
    if (!S.autoCheckDone && !S.installing) {
        S.autoCheckDone = true;
        setTimeout(() => { if (!S.installing) startInstall(); }, 800);
    }
};

/* Media streaming callbacks (called by C# background download) */
/* ===========================================
   UPDATE COUNTDOWN
   =========================================== */
(function() {
    let _targetDate = null;
    let _totalMs = 0;
    let _ticker = null;

    function pad(n) { return String(Math.max(0, n)).padStart(2, '0'); }

    function tick() {
        const el = document.getElementById('updateCountdown');
        if (!el || !_targetDate) return;

        const now = Date.now();
        const diff = _targetDate - now;

        if (diff <= 0) {
            // Countdown finished — show all zeros, mark done
            ['ucDays','ucHours','ucMins','ucSecs'].forEach(id => {
                const e = document.getElementById(id);
                if (e) e.textContent = '00';
            });
            const fill = document.getElementById('ucBarFill');
            if (fill) fill.style.width = '100%';
            el.classList.add('uc-done');
            clearInterval(_ticker);
            _ticker = null;
            return;
        }

        el.classList.remove('uc-done');
        const totalSec = Math.floor(diff / 1000);
        const days  = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const mins  = Math.floor((totalSec % 3600) / 60);
        const secs  = totalSec % 60;

        const dEl = document.getElementById('ucDays');
        const hEl = document.getElementById('ucHours');
        const mEl = document.getElementById('ucMins');
        const sEl = document.getElementById('ucSecs');
        if (dEl) dEl.textContent = pad(days);
        if (hEl) hEl.textContent = pad(hours);
        if (mEl) mEl.textContent = pad(mins);
        if (sEl) sEl.textContent = pad(secs);

        const fill = document.getElementById('ucBarFill');
        if (fill && _totalMs > 0) {
            const elapsed = _totalMs - diff;
            fill.style.width = Math.min(100, (elapsed / _totalMs) * 100).toFixed(2) + '%';
        }
    }

    function reposition() {
        const el  = document.getElementById('updateCountdown');
        const ap  = document.getElementById('audioPlayer');
        if (!el || !ap) return;
        const apH = ap.offsetHeight;
        const gap = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--edge-gap')) || 20;
        el.style.bottom = (gap + apH + 10) + 'px';
    }

    window.onUpdateDate = (dateStr) => {
        const el = document.getElementById('updateCountdown');
        if (!el) return;

        const target = new Date(dateStr);
        if (isNaN(target.getTime())) return;

        _targetDate = target.getTime();
        // Use 6-week cycle as total span for the progress bar
        _totalMs = 6 * 7 * 24 * 3600 * 1000;

        el.style.display = '';
        reposition();
        tick();
        if (_ticker) clearInterval(_ticker);
        _ticker = setInterval(tick, 1000);
    };
})();

window.onMediaStatus = (status, msg) => {
    const el   = document.getElementById('rpStatus');
    const txt  = document.getElementById('rpStatusText');
    const bar  = document.getElementById('mediaProgressBar');
    const pct  = document.getElementById('mediaProgressPct');
    const size = document.getElementById('mediaProgressSize');
    if (!el) return;
    if (status === 'ready' || status === 'offline') {
        el.style.display = 'none';
    } else if (status === 'checking') {
        el.style.display = '';
        if (bar)  bar.style.display  = 'none';
        if (pct)  pct.textContent    = '';
        if (size) size.textContent   = '';
        if (txt)  txt.textContent    = 'Đang kiểm tra cập nhật...';
    } else if (status === 'error') {
        el.style.display = '';
        if (bar) bar.style.display = 'none';
        if (txt) txt.textContent  = msg || 'Lỗi tải tài nguyên';
    }
};

window.onMediaProgress = (pct, text, speed, size) => {
    const el    = document.getElementById('rpStatus');
    const txt   = document.getElementById('rpStatusText');
    const bar   = document.getElementById('mediaProgressBar');
    const fill  = document.getElementById('mediaProgressFill');
    const pctEl = document.getElementById('mediaProgressPct');
    const sizeEl= document.getElementById('mediaProgressSize');
    if (el)    el.style.display    = '';
    if (bar)   bar.style.display   = '';
    if (txt)   txt.textContent     = text;
    if (fill)  fill.style.width    = pct + '%';
    if (pctEl) pctEl.textContent   = pct + '%';
    if (sizeEl)sizeEl.textContent  = size;
};

window.onMediaReady = (bgmUrl, videoUrl) => {
    // Load video â€” keep hidden until first frame is decoded to avoid flash
    if (videoUrl) {
        const vid = document.getElementById('bgVideo');
        if (vid) {
            vid.src = videoUrl;
            vid.load();
            const onReady = () => {
                vid.play().catch(()=>{});
                vid.classList.add('visible');
                vid.removeEventListener('canplay', onReady);
            };
            vid.addEventListener('canplay', onReady);
        }
    }
    // Load audio via exposed setter (from initAudioPlayer)
    if (bgmUrl && window.apSetAudioSource) window.apSetAudioSource(bgmUrl);
    window.onMediaStatus('ready');
};

/* ===========================================
   FOLDER POPUP
   =========================================== */
function initModal() {
    // Legacy name kept for loadSettings compatibility
}

function openModal() {}
function closeModal() {}

function populateModal() {}

function saveSettings() {
    if (bridge()) bridge().SaveSettings(JSON.stringify(S.cfg));
}

async function loadVersions() {
    if (!bridge()) return;
    try {
        const appVer = await bridge().GetAppVersion();
        const vhVer  = await bridge().GetVhVersion();
        const elApp = document.getElementById('verApp');
        const elVH  = document.getElementById('verVH');
        if (elApp) elApp.textContent = appVer ? `Launcher v${appVer}` : '';
        if (elVH)  elVH.textContent  = vhVer  ? `VH ${vhVer}` : '';
    } catch(e) {}
}

let _launcherUpdateUrl = '';
let _launcherUpdateVer = '';

function checkLauncherUpdate(silent = true) {
    if (!silent) toast('Đang kiểm tra cập nhật Launcher...', 'info');
    if (bridge()) bridge().CheckLauncherUpdate();
}

window.onLauncherUpdateAvailable = (latestVer, downloadUrl) => {
    _launcherUpdateUrl = downloadUrl;
    _launcherUpdateVer = latestVer;

    // Badge in dropdown
    const badge = document.getElementById('rpUpdateBadge');
    if (badge) badge.style.display = '';

    // Highlight version label
    document.querySelector('.rp-version')?.classList.add('has-update');

    // Show modal
    const overlay  = document.getElementById('luOverlay');
    const verEl    = document.getElementById('luModalVer');
    const pbar     = document.getElementById('luPbar');
    const btns     = document.getElementById('luModalBtns');
    const btnLater  = document.getElementById('luBtnLater');
    const btnUpdate = document.getElementById('luBtnUpdate');

    if (!overlay) return;
    if (verEl) verEl.textContent = latestVer;
    if (pbar)  pbar.style.display  = 'none';
    if (btns)  btns.style.display  = '';
    overlay.style.display = '';

    btnLater?.addEventListener('click', () => {
        overlay.style.display = 'none';
    }, { once: true });

    btnUpdate?.addEventListener('click', () => {
        if (!bridge()) return;
        // Hide buttons, show progress bar
        if (btns) btns.style.display = 'none';
        if (pbar) pbar.style.display = '';
        btnUpdate.disabled = true;
        bridge().PerformLauncherUpdate(_launcherUpdateVer, _launcherUpdateUrl);
    }, { once: true });
};

window.onLauncherUpdateProgress = (pct, text) => {
    const fill    = document.getElementById('luPbarFill');
    const textEl  = document.getElementById('luPbarText');
    const subEl   = document.getElementById('luPbarSub');
    const pbar    = document.getElementById('luPbar');
    if (pbar) pbar.style.display = '';
    if (fill)   fill.style.width   = pct + '%';
    if (textEl) textEl.textContent = pct + '%';
    if (subEl)  subEl.textContent  = text;
};

window.onLauncherUpdateError = (msg) => {
    const overlay = document.getElementById('luOverlay');
    if (overlay) overlay.style.display = 'none';
    toast('Cập nhật thất bại: ' + msg, 'err');
};

function loadSettings() {
    if (bridge()) {
        try {
            const j = bridge().LoadSettings();
            if (j) {
                Object.assign(S.cfg, JSON.parse(j));
                S.gamePath = S.cfg.gamePath || '';
            }
        } catch(e) {}
    }
    // If path already saved, auto-check on startup
    // (if path comes from DetectGamePath instead, onGamePathDetected handles it)
    if (S.gamePath && !S.autoCheckDone && !S.installing) {
        S.autoCheckDone = true;
        setTimeout(() => { if (!S.installing) startInstall(); }, 800);
    }
}

async function browseFolder() {
    if (bridge()) {
        const p = await bridge().BrowseGameFolder();
        if (p === "?INVALID") {
            toast('Không tìm thấy thư mục chứa Wuthering Waves!', 'err');
            return false;
        }
        if (p) {
            S.cfg.gamePath = p;
            S.gamePath = p;
            saveSettings();
            toast('Đã chọn thư mục: ' + p.split('\\').pop(), 'ok');
            return true;
        }
        return false;
    } else {
        S.gamePath = 'C:\\Wuthering Waves\\Wuthering Waves Game';
        S.cfg.gamePath = S.gamePath;
        saveSettings();
        toast('Demo: Đã chọn thư mục game', 'info');
        return true;
    }
}

/* ===========================================
   WATER RIPPLE
   =========================================== */
function initWaterRipple() {
    document.addEventListener('click', e => {
        const origin = document.createElement('div');
        origin.className = 'ripple-origin';
        origin.style.left = e.clientX + 'px';
        origin.style.top  = e.clientY + 'px';

        // Central splash dot
        const splash = document.createElement('div');
        splash.className = 'ripple-splash';
        origin.appendChild(splash);

        // 4 rings — each slightly larger delay & slower duration for natural decay
        const config = [
            { delay:   0, dur:  880 },
            { delay: 110, dur: 1050 },
            { delay: 230, dur: 1230 },
            { delay: 370, dur: 1450 },
        ];
        config.forEach(({ delay, dur }) => {
            const ring = document.createElement('div');
            ring.className = 'ripple-ring';
            ring.style.setProperty('--delay', delay + 'ms');
            ring.style.setProperty('--dur',   dur   + 'ms');
            origin.appendChild(ring);
        });

        document.body.appendChild(origin);
        setTimeout(() => origin.remove(), 2000);
    });
}

/* ===========================================
   AUDIO PLAYER
   =========================================== */
function initAudioPlayer() {
    const audio      = document.getElementById('bgMusic');
    const player     = document.getElementById('audioPlayer');
    const btnPlay    = document.getElementById('apPlay');
    const track      = document.getElementById('apTrack');
    const fill       = document.getElementById('apFill');
    const curEl      = document.getElementById('apCur');
    const durEl      = document.getElementById('apDur');
    const btnShuffle = document.getElementById('apShuffle');
    const btnPrev    = document.getElementById('apPrev');
    const btnNext    = document.getElementById('apNext');
    const btnRepeat  = document.getElementById('apRepeat');
    const btnVolBtn  = document.getElementById('apVolBtn');
    const volSlider  = document.getElementById('apVolSlider');
    const volFill    = document.getElementById('apVolFill');
    const volLabel   = document.getElementById('apVolLabel');
    if (!audio || !player) return;

    // --- Restore saved volume (default 35) ---
    const savedVol = parseInt(localStorage.getItem('apVolume') ?? '35', 10);
    const initVol  = Math.max(0, Math.min(100, isNaN(savedVol) ? 35 : savedVol));
    audio.volume   = initVol / 100;
    audio.loop     = true;
    if (volSlider) volSlider.value       = initVol;
    if (volFill)   volFill.style.width   = initVol + '%';
    if (volLabel)  volLabel.textContent  = initVol;
    updateVolIcon(initVol);

    function fmt(s) {
        if (!isFinite(s) || isNaN(s)) return '--:--';
        const m   = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    function setPlaying(on) {
        document.getElementById('apIconPlay') .style.display = on ? 'none' : '';
        document.getElementById('apIconPause').style.display = on ? ''     : 'none';
        player.classList.toggle('playing', on);
    }

    function updateProgress() {
        const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        fill.style.width  = pct + '%';
        curEl.textContent = fmt(audio.currentTime);
        if (audio.duration) durEl.textContent = fmt(audio.duration);
    }

    function updateVolIcon(vol) {
        const icon = document.getElementById('apVolIcon');
        if (!icon) return;
        if (vol === 0) {
            icon.innerHTML = '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (vol < 50) {
            icon.innerHTML = '<path fill="currentColor" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
        } else {
            icon.innerHTML = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }

    // Exposed for window.onMediaReady â€” called once audio src is available
    window.apSetAudioSource = (url) => {
        if (!url) return;
        audio.src = url;
        audio.load();
        audio.addEventListener('canplaythrough', () => {
            audio.play().then(() => setPlaying(true)).catch(()=>{});
        }, { once: true });
        // Fallback: first user click
        document.addEventListener('click', function onFirstClick() {
            if (audio.paused && audio.src) audio.play().then(()=>setPlaying(true)).catch(()=>{});
            document.removeEventListener('click', onFirstClick);
        });
    };

    // Play / Pause button
    btnPlay?.addEventListener('click', () => {
        if (audio.paused) { audio.play().then(() => setPlaying(true)).catch(() => {}); }
        else              { audio.pause(); setPlaying(false); }
    });

    // Seek
    track?.addEventListener('click', e => {
        const rect  = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (audio.duration) audio.currentTime = ratio * audio.duration;
    });

    btnPrev?.addEventListener('click', () => { audio.currentTime = 0; });
    btnNext?.addEventListener('click', () => { audio.currentTime = 0; });

    btnRepeat?.addEventListener('click', () => {
        audio.loop = !audio.loop;
        btnRepeat.classList.toggle('ap-btn--active', audio.loop);
    });

    let shuffleOn = false;
    btnShuffle?.addEventListener('click', () => {
        shuffleOn = !shuffleOn;
        btnShuffle.classList.toggle('ap-btn--active', shuffleOn);
    });

    // Volume slider
    volSlider?.addEventListener('input', () => {
        const v = parseInt(volSlider.value, 10);
        audio.volume = v / 100;
        if (audio.muted && v > 0) audio.muted = false;
        if (volFill)  volFill.style.width  = v + '%';
        if (volLabel) volLabel.textContent  = v;
        updateVolIcon(v);
        localStorage.setItem('apVolume', v);
    });

    // Volume icon = mute toggle
    btnVolBtn?.addEventListener('click', () => {
        audio.muted = !audio.muted;
        const displayVol = audio.muted ? 0 : parseInt(volSlider?.value ?? '35', 10);
        updateVolIcon(displayVol);
        if (volLabel) volLabel.textContent = audio.muted ? '0' : (volSlider?.value ?? '35');
    });

    // Sync events
    audio.addEventListener('timeupdate',     updateProgress);
    audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(audio.duration); });
    audio.addEventListener('play',  () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => { if (!audio.loop) setPlaying(false); });
}

function toggleBgm(on) {
    const a = document.getElementById('bgMusic');
    if (!a) return;
    if (on) { a.volume = 0.25; a.play().catch(() => {}); }
    else    { a.pause(); }
}

/* ===========================================
   TOAST
   =========================================== */
/* ===========================================
   CONFIRM MODAL
   =========================================== */
function showConfirm(message) {
    return new Promise(resolve => {
        const modal  = document.getElementById('confirmModal');
        const msgEl  = document.getElementById('modalMsg');
        const btnOk  = document.getElementById('modalOk');
        const btnCan = document.getElementById('modalCancel');
        msgEl.textContent = message;
        modal.style.display = 'flex';

        const cleanup = (result) => {
            modal.style.display = 'none';
            btnOk.removeEventListener('click', onOk);
            btnCan.removeEventListener('click', onCancel);
            resolve(result);
        };
        const onOk     = () => cleanup(true);
        const onCancel = () => cleanup(false);
        btnOk.addEventListener('click', onOk);
        btnCan.addEventListener('click', onCancel);
    });
}

function toast(msg, type='info') {
    const c = document.getElementById('toasts');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast toast--'+type;
    el.textContent = msg;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
    }, 3500);
}

/* ===========================================
   CÀI FONT TUỲ CHỈNH
   =========================================== */
const FC = {
    fontPath: '',
    building: false,
};

function initFontCreator() {
    document.getElementById('fcBrowseFont')?.addEventListener('click', fcBrowseFont);
    document.getElementById('fcBuildBtn')?.addEventListener('click', fcBuild);
    document.getElementById('fcRevertBtn')?.addEventListener('click', fcRevert);
}

// Called whenever the Font page becomes visible
function fcRefreshStatus() {
    if (!S.gamePath) {
        fcSetCurrentFont(null);
        return;
    }
    if (bridge()) {
        bridge().GetCustomFontName(S.gamePath).then(name => fcSetCurrentFont(name || null));
    }
}

function fcSetCurrentFont(name) {
    const nameEl   = document.getElementById('fcCurrentName');
    const revertBtn = document.getElementById('fcRevertBtn');
    if (!nameEl) return;
    if (name) {
        nameEl.textContent = name;
        nameEl.classList.add('fc-current__name--custom');
        if (revertBtn) revertBtn.style.display = '';
    } else {
        nameEl.textContent = 'Font gốc (UTMAlexander)';
        nameEl.classList.remove('fc-current__name--custom');
        if (revertBtn) revertBtn.style.display = 'none';
    }
}

async function fcBrowseFont() {
    if (!bridge()) {
        // Demo mode
        FC.fontPath = 'C:\\Fonts\\MyFont.ttf';
        document.getElementById('fcFontDisplay').textContent = 'MyFont.ttf';
        document.getElementById('fcOutputName').value = 'MyFont';
        document.getElementById('fcBuildBtn').disabled = false;
        return;
    }
    const path = await bridge().BrowseFontFile();
    if (!path) return;
    FC.fontPath = path;
    const fileName = path.split('\\').pop().split('/').pop();
    const baseName = fileName.replace(/\.[^.]+$/, ''); // strip extension
    document.getElementById('fcFontDisplay').textContent = fileName;
    document.getElementById('fcOutputName').value = baseName;
    document.getElementById('fcBuildBtn').disabled = false;
    fcSetStatus('', false);
}

async function fcBuild() {
    if (FC.building) return;
    if (!FC.fontPath) { toast('Vui lòng chọn file font trước!', 'err'); return; }
    if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }

    const baseName = (document.getElementById('fcOutputName')?.value.trim() || 'CustomFont');

    FC.building = true;
    const btn = document.getElementById('fcBuildBtn');
    if (btn) { btn.disabled = true; btn.classList.add('fc-btn--loading'); }
    fcSetStatus('Đang xử lý...', false);

    if (bridge()) {
        bridge().CreateFontPak(FC.fontPath, S.gamePath, baseName);
    } else {
        setTimeout(() => {
            window.onFontPakDone(`C:\\WW\\wuwaVietHoa\\${baseName}_100_P.pak`, '2.4 MB');
        }, 1200);
    }
}

async function fcRevert() {
    if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }
    const confirmed = await showConfirm('Xoá font tuỳ chỉnh và dùng lại font gốc UTMAlexander?');
    if (!confirmed) return;
    fcSetStatus('Đang xoá font tuỳ chỉnh...', false);
    if (bridge()) {
        bridge().RemoveCustomFont(S.gamePath);
    } else {
        setTimeout(() => window.onFontRevertDone(), 600);
    }
}

window.onFontPakProgress = (msg) => {
    fcSetStatus(msg, false);
};

window.onFontPakDone = (outputPath, sizeStr) => {
    FC.building = false;
    const btn = document.getElementById('fcBuildBtn');
    if (btn) { btn.disabled = false; btn.classList.remove('fc-btn--loading'); }

    const fileName = outputPath.split('\\').pop().split('/').pop();
    fcSetStatus(`✓ Đã cài: ${fileName} (${sizeStr})`, false, true);
    toast('Cài font thành công!', 'ok');
    fcRefreshStatus();
};

window.onFontPakError = (msg) => {
    FC.building = false;
    const btn = document.getElementById('fcBuildBtn');
    if (btn) { btn.disabled = false; btn.classList.remove('fc-btn--loading'); }
    fcSetStatus('Lỗi: ' + msg, true);
    toast('Lỗi: ' + msg, 'err');
};

window.onFontRevertDone = () => {
    fcSetStatus('✓ Đã xoá font tuỳ chỉnh. Font gốc sẽ được tải lại khi cập nhật.', false, true);
    toast('Đã dùng lại font gốc!', 'ok');
    fcRefreshStatus();
};

window.onFontRevertError = (msg) => {
    fcSetStatus('Lỗi: ' + msg, true);
    toast('Lỗi: ' + msg, 'err');
};

function fcSetStatus(msg, isError, isSuccess = false) {
    const el = document.getElementById('fcStatus');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.className = 'fc-status' + (isError ? ' fc-status--err' : isSuccess ? ' fc-status--ok' : '');
    el.textContent = msg;
}








