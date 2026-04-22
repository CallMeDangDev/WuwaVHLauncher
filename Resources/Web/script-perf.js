

const PM_TOGGLES = [
    { id: 'pmShadows',         key: 'shadows'         },
    { id: 'pmSsr',             key: 'ssr'             },
    { id: 'pmAo',              key: 'ao'              },
    { id: 'pmBloom',           key: 'bloom'           },
    { id: 'pmLensFlare',       key: 'lensFlare'       },
    { id: 'pmDof',             key: 'dof'             },
    { id: 'pmMaterials',       key: 'materials'       },
    { id: 'pmSss',             key: 'sss'             },
    { id: 'pmViewDist',        key: 'viewDist'        },
    { id: 'pmFoliage',         key: 'foliage'         },
    { id: 'pmFoliageInteract', key: 'foliageInteract' },
    { id: 'pmParticles',       key: 'particles'       },
    { id: 'pmClouds',          key: 'clouds'          },
    { id: 'pmVolumetric',      key: 'volumetric'      },
];

function initPerformanceMode() {
    document.getElementById('pmApplyBtn')?.addEventListener('click', pmApply);
    document.getElementById('pmClearBtn')?.addEventListener('click', pmClear);
}

function pmLoadToggles() {
    const perf = S.cfg.perf || {};
    PM_TOGGLES.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!perf[key];
    });
}

async function pmRefreshStatus() {
    pmLoadToggles();
    if (!S.gamePath || !bridge()) {
        pmSetStatus('inactive', 'Chưa chọn thư mục game');
        return;
    }
    try {
        const active = await bridge().GetPerformanceConfigActive(S.gamePath);
        pmSetStatus(active ? 'active' : 'inactive', active ? 'Đang hoạt động' : 'Chưa áp dụng');
    } catch(e) {
        pmSetStatus('inactive', 'Chưa áp dụng');
    }
}

function pmSetStatus(state, text) {
    const dot = document.getElementById('pmStatusDot');
    const txt = document.getElementById('pmStatusText');
    if (dot) dot.className = 'pm-status__dot' + (state === 'active' ? ' pm-status__dot--active' : '');
    if (txt) txt.textContent = text;
}

async function pmApply() {
    if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }

    const settings = {};
    PM_TOGGLES.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        settings[key] = el ? el.checked : false;
    });

    const anyEnabled = Object.values(settings).some(Boolean);
    if (!anyEnabled) { toast('Chưa bật hiệu ứng nào để tối ưu.', 'info'); return; }

    S.cfg.perf = settings;
    saveSettings();

    if (!bridge()) { toast('Demo: Đã lưu cấu hình hiệu năng', 'ok'); return; }

    const btn = document.getElementById('pmApplyBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang ghi...'; }

    try {
        const result = await bridge().ApplyPerformanceConfig(S.gamePath, JSON.stringify(settings));
        if (result === 'ok') {
            toast('Đã áp dụng! Khởi động lại game để có hiệu lực.', 'ok');
            pmSetStatus('active', 'Đang hoạt động');
        } else {
            toast('Lỗi: ' + result, 'err');
        }
    } catch(e) {
        toast('Lỗi khi ghi config: ' + e, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Áp dụng & Lưu'; }
    }
}

async function pmClear() {
    if (!S.gamePath) { toast('Chưa chọn thư mục game!', 'err'); return; }

    if (!bridge()) { toast('Demo: Đã xoá cấu hình hiệu năng', 'info'); return; }

    const btn = document.getElementById('pmClearBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xoá...'; }

    try {
        const result = await bridge().ClearPerformanceConfig(S.gamePath);
        if (result === 'ok') {
            toast('Đã xoá config. Game sẽ dùng setting mặc định.', 'ok');
            pmSetStatus('inactive', 'Chưa áp dụng');
            S.cfg.perf = {};
            saveSettings();
            PM_TOGGLES.forEach(({ id }) => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });
        } else {
            toast('Lỗi: ' + result, 'err');
        }
    } catch(e) {
        toast('Lỗi: ' + e, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Xoá config'; }
    }
}
