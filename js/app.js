// ============================================================
// APP.JS — Main Application Logic & Router
// IOS Informasi Obat dan Kesehatan
// Routing: History API (clean URL, no hash, no ?admin=true)
// ============================================================

let currentPage = 'welcome';
let charts = {};
let currentRole = sessionStorage.getItem('ios_role') || 'publik'; // 'publik' | 'admin'
let isAdminRoute = location.pathname.startsWith('/admin');         // untuk backward compat
let currentAdminUser = null; // Stores logged-in account object

// ── Router Utilities ────────────────────────────────────────
/**
 * Ekstrak nama halaman dari URL path.
 * /           → 'welcome'
 * /obat       → 'obat'
 * /admin      → 'dashboard'
 * /admin/obat → 'obat'
 */
function _getPageFromPath(pathname) {
  const parts = pathname.replace(/^\//, '').split('/').filter(Boolean);
  if (!parts.length) return 'welcome';
  if (parts[0] === 'admin') return parts[1] || 'dashboard';
  if (parts[0] === 'login') return null; // handled by login.html
  return parts[0];
}

/**
 * Bangun URL bersih untuk halaman & role tertentu.
 * welcome + publik  → '/'
 * obat    + publik  → '/obat'
 * obat    + admin   → '/admin/obat'
 */
function _getUrlForPage(page, role) {
  if (page === 'welcome') return role === 'admin' ? '/admin/welcome' : '/';
  const prefix = role === 'admin' ? '/admin' : '';
  return `${prefix}/${page}`;
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // ① Pulihkan URL jika kita datang dari 404.html redirect trick
  const spaRedirect = sessionStorage.getItem('ios_spa_redirect');
  if (spaRedirect) {
    sessionStorage.removeItem('ios_spa_redirect');
    history.replaceState(null, '', spaRedirect);
    // Update isAdminRoute setelah URL dipulihkan
    isAdminRoute = location.pathname.startsWith('/admin');
  }

  initData();

  // ② Restore session login
  const savedUser = sessionStorage.getItem('ios_admin_user');
  if (savedUser) {
    try { currentAdminUser = JSON.parse(savedUser); } catch(e) { currentAdminUser = null; }
  }

  // ③ Pastikan currentRole sinkron dengan URL path
  // Jika sessionStorage bilang 'admin' tapi URL bukan /admin → tetap 'admin' (dual access OK)
  // Jika sessionStorage bilang 'publik' tapi URL /admin/* → kemungkinan sesi belum terbaca, cek ulang
  if (isAdminRoute && currentRole !== 'admin') {
    // Coba baca ulang dari sessionStorage (mungkin ada race condition)
    const retryRole = sessionStorage.getItem('ios_role');
    if (retryRole === 'admin') {
      currentRole = 'admin';
      console.log('[IOS Init] Role dipulihkan dari sessionStorage setelah URL diperbaiki.');
    } else {
      console.warn('[IOS Init] Tidak ada sesi admin — redirect ke /login');
      window.location.replace('/login');
      return;
    }
  }

  SyncManager.init();
  updateClock();
  setInterval(updateClock, 1000);

  // Render sidebar SETELAH role dipastikan benar
  renderSidebarNav();
  renderSidebarFooter();

  // ④ Navigasi awal berdasarkan path URL
  const startPage = _getPageFromPath(location.pathname);
  console.log(`[IOS Init] Role: ${currentRole}, isAdminRoute: ${isAdminRoute}, startPage: ${startPage}`);
  navigate(startPage, { replace: true });

  // ⑤ Handle Back/Forward browser
  window.addEventListener('popstate', (e) => {
    const page = (e.state && e.state.page) || _getPageFromPath(location.pathname);
    navigate(page, { skipPush: true });
  });

  // Render notifikasi stok obat real-time
  setTimeout(renderNotif, 800);
  setInterval(renderNotif, 60_000);

  // Auto-sync saat login: PUSH dulu (data lokal), baru PULL (data remote)
  // Urutan ini penting! Jika pull duluan, data lokal yang baru ditambah bisa hilang.
  if (currentRole === 'admin' && localStorage.getItem('ios_gas_url')) {
    setTimeout(async () => {
      try {
        const localPegawai = JSON.parse(localStorage.getItem('ios_pegawai') || '[]');
        console.log(`[IOS Init] Data lokal pegawai saat login: ${localPegawai.length} records`);
        
        const pendingQueue = SyncManager.getQueue();
        console.log(`[IOS Init] Antrian pending: ${pendingQueue.length} item`);
        
        // LANGKAH 1: Push dulu jika ada antrian
        if (pendingQueue.length > 0) {
          console.log('[IOS Init] AUTO-SYNC: Push data lokal ke Sheets terlebih dahulu...');
          const pushResult = await SyncManager.push();
          if (pushResult.ok) {
            console.log(`[IOS Init] AUTO-PUSH SUCCESS: ${pushResult.synced} item diunggah.`);
          } else {
            console.warn('[IOS Init] AUTO-PUSH FAILED:', pushResult.reason, '— data lokal dipertahankan, skip pull.');
            return; // Jangan pull jika push gagal, untuk menghindari overwrite data pending
          }
        }

        // LANGKAH 2: Pull setelah push selesai (atau tidak ada yang perlu di-push)
        console.log('[IOS Init] AUTO-SYNC: Mengambil data terbaru dari Sheets...');
        const pullResult = await SyncManager.pull();
        if (pullResult.ok) {
          const afterPegawai = JSON.parse(localStorage.getItem('ios_pegawai') || '[]');
          console.log(`[IOS Init] AUTO-PULL SUCCESS: data pegawai setelah merge = ${afterPegawai.length} records.`);
          showToast('☁️ Data berhasil disinkronkan dari Google Sheets!');
          navigate(currentPage, { skipPush: true });
          renderNotif();
        } else {
          console.warn('[IOS Init] AUTO-PULL FAILED:', pullResult.reason);
        }
      } catch(e) {
        console.error('[IOS Init] AUTO-SYNC ERROR:', e);
        /* silent fail — tetap pakai data lokal */
      }
    }, 2000); // delay 2 detik untuk pastikan app siap
  }

  // ──────────────────────────────────────────────────────────────────
  // FIX #1: AUTO-PULL PUBLIK — Publik mendapatkan data terbaru dari Sheets
  // ──────────────────────────────────────────────────────────────────
  if (currentRole === 'publik' && localStorage.getItem('ios_gas_url')) {
    // Pull pertama kali saat halaman dimuat (3 detik setelah ready)
    setTimeout(async () => {
      console.log('[PublicSync] AUTO-PULL START: mengambil data terbaru dari Sheets...');
      try {
        const r = await SyncManager.pull();
        if (r.ok) {
          console.log('[PublicSync] AUTO-PULL SUCCESS: data publik diperbarui dari Sheets.');
          navigate(currentPage, { skipPush: true });
        } else {
          console.warn('[PublicSync] AUTO-PULL FAILED:', r.reason, '— menggunakan data lokal.');
        }
      } catch (e) {
        console.warn('[PublicSync] AUTO-PULL ERROR:', e.message);
      }
    }, 3000);

    // Pull otomatis setiap 5 menit — pastikan publik selalu punya data terkini
    setInterval(async () => {
      if (currentRole !== 'publik') return; // stop jika sudah login admin
      console.log('[PublicSync] INTERVAL PULL: refresh data publik...');
      try {
        const r = await SyncManager.pull();
        if (r.ok) navigate(currentPage, { skipPush: true });
      } catch (e) { /* silent */ }
    }, 5 * 60 * 1000); // setiap 5 menit
  }

  // ──────────────────────────────────────────────────────────────────
  // FIX #2: CROSS-TAB SYNC — Admin update di Tab A → Tab B (publik) refresh otomatis
  // localStorage 'storage' event terpicu di tab LAIN saat ada perubahan.
  // ──────────────────────────────────────────────────────────────────
  window.addEventListener('storage', (e) => {
    if (e.key !== 'ios_last_update') return;
    console.log('[CrossTab] Perubahan data terdeteksi dari tab lain — refresh halaman...');
    // Re-render halaman saat ini dengan data terbaru dari localStorage
    navigate(currentPage, { skipPush: true });
    renderNotif();
  });
});

// =======================================================================
// FIX #3: BACKGROUND PUSH — push otomatis ke Sheets setelah setiap CRUD
// =======================================================================
/**
 * Fire-and-forget push ke Google Sheets setelah admin menyimpan data.
 * Juga set 'ios_last_update' di localStorage untuk trigger cross-tab sync
 * (tab publik yang terbuka di browser yang sama akan auto-refresh).
 */
function _bgPush() {
  if (currentRole !== 'admin') return;
  if (!localStorage.getItem('ios_gas_url')) return;

  // Set last_update — ini yang men-trigger 'storage' event di tab lain
  const now = Date.now().toString();
  localStorage.setItem('ios_last_update', now);
  console.log('[BgPush] Push To Sheets Started — timestamp:', now);

  SyncManager.push()
    .then(r => {
      if (r.ok) {
        console.log('[BgPush] Push To Sheets Success —', r.synced, 'item tersinkronisasi.');
      } else {
        console.warn('[BgPush] Push To Sheets gagal (data tetap di antrian):', r.reason);
      }
    })
    .catch(err => {
      console.warn('[BgPush] Push error (data tetap di antrian):', err.message);
    });
}

/// Klik tombol sync — jika ada antrian push, jika tidak pull
async function handleSyncClick() {
  const q = SyncManager.getQueue();
  
  if (currentRole === 'publik') {
    if (!localStorage.getItem('ios_gas_url')) {
      showToast('Aplikasi dalam mode Offline. Hubungi Admin untuk konfigurasi.', true);
      return;
    }
    showToast('🔄 Mengambil data terbaru dari Google Sheets...');
    const r = await SyncManager.pull();
    if (r.ok) { showToast('✅ Data berhasil diperbarui dari Google Sheets!'); navigate(currentPage); }
    else showToast('❌ Gagal mengambil data: ' + r.reason, true);
    return;
  }

  if (!localStorage.getItem('ios_gas_url')) {
    navigate('pengaturan');
    setTimeout(() => showToast('Masukkan URL Apps Script di Pengaturan terlebih dahulu!', true), 400);
    return;
  }
  if (q.length > 0) {
    showToast('🔄 Mengunggah ' + q.length + ' perubahan ke Google Sheets...');
    const r = await SyncManager.push();
    if (r.ok) showToast('✅ Sinkronisasi berhasil — ' + r.synced + ' item terunggah!');
    else showToast('❌ Sinkronisasi gagal: ' + r.reason, true);
  } else {
    showToast('🔄 Mengambil data terbaru dari Google Sheets...');
    const r = await SyncManager.pull();
    if (r.ok) { showToast('✅ Data berhasil diperbarui dari Google Sheets!'); navigate(currentPage); }
    else showToast('❌ Gagal mengambil data: ' + r.reason, true);
  }
}

function updateClock() {
  const now = new Date();
  const d = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const el = document.getElementById('clock');
  if (el) el.innerHTML = `<i class="ph ph-calendar-blank" style="margin-right:6px"></i>${d} &nbsp; <i class="ph ph-clock" style="margin-right:4px"></i>${t}`;
}

// ---- ROLE MANAGEMENT & DYNAMIC SIDEBAR ----
function renderSidebarNav() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  const items = [
    { id: 'welcome', label: 'Home', icon: 'ph-fill ph-house', roles: ['publik', 'admin'] },
    { id: 'dashboard', label: 'Dashboard', icon: 'ph-fill ph-squares-four', roles: ['admin'] },
    { id: 'obat', label: 'Stok Obat', icon: 'ph-fill ph-pill', roles: ['publik', 'admin'] },
    { id: 'pegawai', label: 'Data Pegawai', icon: 'ph-fill ph-users-three', roles: ['publik', 'admin'] },
    { id: 'kesehatan', label: 'Info Kesehatan', icon: 'ph-fill ph-heart-pulse', roles: ['publik', 'admin'] },
    { id: 'laporan', label: 'Laporan', icon: 'ph-fill ph-chart-bar', roles: ['admin'] },
    { id: 'pengaturan', label: 'Pengaturan', icon: 'ph-fill ph-gear-six', roles: ['admin'] }
  ];

  nav.innerHTML = items
    .filter(item => item.roles.includes(currentRole))
    .map(item => {
      const href = _getUrlForPage(item.id, currentRole);
      return `
        <a href="${href}" class="nav-item ${currentPage === item.id ? 'active' : ''}" id="nav-${item.id}"
           onclick="event.preventDefault(); navigate('${item.id}')">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      `;
    }).join('');
}

function renderSidebarFooter() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  if (currentRole === 'admin') {
    // Admin: tampilkan user card dengan opsi logout
    const user = currentAdminUser || { nama: 'Admin Klinik', role: 'Super Admin', username: 'admin' };
    const initials = user.nama.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    footer.innerHTML = `
      <div class="user-card" onclick="lockAdminMode()" style="cursor:pointer" title="Klik untuk keluar">
        <div class="user-avatar" style="background:var(--secondary)">${initials}</div>
        <div class="user-info">
          <span class="user-name">${user.nama}</span>
          <span class="user-role">${user.role} (Keluar)</span>
        </div>
        <i class="ph ph-sign-out" style="margin-left:auto;opacity:0.8;font-size:20px;color:var(--secondary)" title="Keluar Admin"></i>
      </div>
    `;
  } else {
    // Publik: tampilkan branding saja, TANPA link/tombol login
    footer.innerHTML = `
      <div class="user-card" style="opacity:0.55;cursor:default;pointer-events:none">
        <div class="user-avatar" style="background:linear-gradient(135deg,var(--primary),var(--secondary))">
          <i class="ph-fill ph-first-aid-kit"></i>
        </div>
        <div class="user-info">
          <span class="user-name" style="font-size:12px">Klinik Pratama Lapas Kelas I</span>
          <span class="user-role">Palembang</span>
        </div>
      </div>
    `;
  }
}

function showLoginPage() {
  // Remove existing login page if any
  const existing = document.getElementById('ios-login-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ios-login-overlay';
  overlay.innerHTML = `
    <div class="login-bg-icons" aria-hidden="true">
      <i class="ph-fill ph-first-aid-kit"></i>
      <i class="ph-fill ph-pill"></i>
      <i class="ph-fill ph-heart-pulse"></i>
      <i class="ph-fill ph-stethoscope"></i>
      <i class="ph-fill ph-syringe"></i>
      <i class="ph-fill ph-prescription"></i>
      <i class="ph-fill ph-microscope"></i>
      <i class="ph-fill ph-hospital"></i>
      <i class="ph-fill ph-dna"></i>
      <i class="ph-fill ph-pill"></i>
      <i class="ph-fill ph-heart-pulse"></i>
      <i class="ph-fill ph-first-aid-kit"></i>
    </div>

    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <div class="login-logo-icon">
          <i class="ph-fill ph-first-aid-kit"></i>
        </div>
        <div>
          <div class="login-logo-title">IOS</div>
          <div class="login-logo-sub">Sistem Informasi Klinik</div>
        </div>
      </div>

      <!-- Header -->
      <div class="login-header">
        <h2>Selamat Datang</h2>
        <p>Masuk dengan akun admin Anda untuk mengelola sistem klinik</p>
      </div>

      <!-- Form -->
      <div class="login-form">
        <div class="login-field">
          <label for="loginUsername"><i class="ph ph-user"></i> ID / Username</label>
          <input type="text" id="loginUsername" class="login-input" placeholder="Masukkan username..." autocomplete="username" />
        </div>
        <div class="login-field">
          <label for="loginPassword"><i class="ph ph-lock"></i> Password</label>
          <div style="position:relative">
            <input type="password" id="loginPassword" class="login-input" placeholder="Masukkan password..." autocomplete="current-password" />
            <button onclick="toggleLoginPasswordVisibility()" class="login-eye-btn" id="loginEyeBtn" type="button" tabindex="-1">
              <i class="ph ph-eye" id="loginEyeIcon"></i>
            </button>
          </div>
        </div>
        <div id="loginError" class="login-error" style="display:none">
          <i class="ph ph-warning-circle"></i> <span id="loginErrorMsg">Username atau password salah.</span>
        </div>
        <button class="login-btn" onclick="submitLogin()" id="loginBtn">
          <i class="ph ph-sign-in"></i> Masuk ke Sistem
        </button>
      </div>

      <!-- Footer -->
      <div class="login-card-footer">
        <i class="ph-fill ph-shield-check"></i>
        Klinik Pratama Lapas Kelas I Palembang &middot; Kemenimipas
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.add('login-visible');
    const u = document.getElementById('loginUsername');
    if (u) u.focus();
  }, 50);

  // Enter key support
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLogin();
  });
}

function toggleLoginPasswordVisibility() {
  const input = document.getElementById('loginPassword');
  const icon = document.getElementById('loginEyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'ph ph-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'ph ph-eye';
  }
}

function submitLogin() {
  const username = (document.getElementById('loginUsername').value || '').trim();
  const password = (document.getElementById('loginPassword').value || '').trim();
  const errorDiv = document.getElementById('loginError');
  const errorMsg = document.getElementById('loginErrorMsg');
  const btn = document.getElementById('loginBtn');

  if (!username || !password) {
    errorMsg.textContent = 'Username dan password wajib diisi.';
    errorDiv.style.display = 'flex';
    return;
  }

  // Shake animation on button
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite"></i> Memverifikasi...';

  setTimeout(() => {
    try {
      const accounts = JSON.parse(localStorage.getItem('ios_accounts') || '[]');
      const account = accounts.find(a => a.username === username && a.password === password);

      if (account) {
        currentRole = 'admin';
        currentAdminUser = account;
        sessionStorage.setItem('ios_role', 'admin');
        sessionStorage.setItem('ios_admin_user', JSON.stringify(account));

        // Remove login overlay with animation
        const overlay = document.getElementById('ios-login-overlay');
        if (overlay) {
          overlay.style.opacity = '0';
          overlay.style.transform = 'scale(1.05)';
          overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          setTimeout(() => overlay.remove(), 400);
        }

        renderSidebarNav();
        renderSidebarFooter();
        navigate('dashboard');
        showToast(`🔓 Selamat datang, ${account.nama}!`);
      } else {
        errorMsg.textContent = 'Username atau password salah. Periksa kembali.';
        errorDiv.style.display = 'flex';
        const card = document.querySelector('.login-card');
        if (card) {
          card.style.animation = 'none';
          card.offsetHeight;
          card.style.animation = 'loginShake 0.4s ease';
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-sign-in"></i> Masuk ke Sistem';
        const pwInput = document.getElementById('loginPassword');
        if (pwInput) { pwInput.value = ''; pwInput.focus(); }
      }
    } catch(e) {
      errorMsg.textContent = 'Terjadi kesalahan sistem. Coba lagi.';
      errorDiv.style.display = 'flex';
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-sign-in"></i> Masuk ke Sistem';
    }
  }, 600);
}

function lockAdminMode() {
  currentRole = 'publik';
  currentAdminUser = null;
  isAdminRoute = false;
  sessionStorage.setItem('ios_role', 'publik');
  sessionStorage.removeItem('ios_admin_user');
  showToast('🔒 Berhasil keluar dari mode Admin.');
  // Redirect ke halaman login dengan clean URL
  setTimeout(() => { window.location.replace('/login'); }, 600);
}

// ============================================================
// ROUTER — History API (Clean URL, no hash)
// ============================================================

/**
 * Navigasi ke halaman tertentu.
 * @param {string} page       - ID halaman: 'welcome'|'obat'|'pegawai'|...
 * @param {object} [opts]
 * @param {boolean} [opts.replace]  - pakai replaceState (tidak tambah history)
 * @param {boolean} [opts.skipPush] - skip pushState (misal dipanggil dari popstate)
 */
function navigate(page, opts = {}) {
  currentPage = page || (currentRole === 'admin' ? 'dashboard' : 'welcome');

  // Guard: halaman khusus admin
  const adminPages = ['dashboard', 'laporan', 'pengaturan'];
  if (currentRole === 'publik' && adminPages.includes(currentPage)) {
    currentPage = 'welcome';
    showToast('⚠️ Akses dibatasi! Silakan login Admin terlebih dahulu.', true);
    history.replaceState({ page: 'welcome' }, '', '/');
    return _renderPage('welcome');
  }

  // ── Update URL dengan History API ──────────────────────────
  if (!opts.skipPush) {
    const url = _getUrlForPage(currentPage, currentRole);
    if (opts.replace) {
      history.replaceState({ page: currentPage }, '', url);
    } else if (location.pathname !== url) {
      history.pushState({ page: currentPage }, '', url);
    }
  }

  _renderPage(currentPage);
}

/** Render konten halaman tanpa mengubah URL */
function _renderPage(page) {
  // Hancurkan chart sebelumnya
  Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); });
  charts = {};

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  // Update judul topbar
  const titles = {
    welcome:     'Home',
    dashboard:   'Dashboard',
    obat:        currentRole === 'admin' ? 'Manajemen Stok Obat' : 'Informasi Stok Obat',
    pegawai:     currentRole === 'admin' ? 'Data Pegawai' : 'Staf Medis Klinik',
    kesehatan:   'Informasi Kesehatan',
    laporan:     'Laporan & Statistik',
    pengaturan:  'Pengaturan',
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[page] || 'IOS';

  // Page transition
  const container = document.getElementById('page-container');
  if (container) {
    container.style.animation = 'none';
    container.offsetHeight; // reflow
    container.style.animation = '';
  }

  // Render page yang sesuai
  const pages = {
    welcome:    renderWelcome,
    dashboard:  renderDashboard,
    obat:       renderObat,
    pegawai:    renderPegawai,
    kesehatan:  renderKesehatan,
    laporan:    renderLaporan,
    pengaturan: renderPengaturan,
  };

  if (pages[page]) {
    pages[page]();
  } else {
    if (container) container.innerHTML = '<div class="empty-state"><i class="ph ph-smiley-sad"></i><p>Halaman tidak ditemukan</p></div>';
  }

  // Mobile/Tablet: tutup sidebar setelah navigasi
  if (window.innerWidth < 1024) {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('sidebar-open', 'collapsed');
    _closeSidebarBackdrop();
    document.body.style.overflow = '';
  }
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const m = document.getElementById('main-content');
  if (!s) return;

  if (window.innerWidth >= 1024) {
    // Desktop: collapse sidebar ke icon-only
    s.classList.toggle('collapsed');
    if (m) m.classList.toggle('expanded');
    // Pastikan tidak ada mobile state
    s.classList.remove('sidebar-open');
    _closeSidebarBackdrop();
  } else {
    // Mobile / Tablet: slide-in overlay sidebar
    const isOpen = s.classList.toggle('sidebar-open');
    _toggleSidebarBackdrop(isOpen);
    // Pastikan tidak ada desktop state
    s.classList.remove('collapsed');
    if (m) m.classList.remove('expanded');
  }
}

function _toggleSidebarBackdrop(show) {
  let bd = document.getElementById('sidebar-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'sidebar-backdrop';
    bd.className = 'sidebar-backdrop';
    bd.addEventListener('click', _closeSidebarByBackdrop);
    document.body.appendChild(bd);
  }
  if (show) {
    bd.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    bd.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function _closeSidebarBackdrop() {
  _toggleSidebarBackdrop(false);
}

function _closeSidebarByBackdrop() {
  const s = document.getElementById('sidebar');
  if (s) s.classList.remove('sidebar-open');
  _closeSidebarBackdrop();
}

// Handle browser resize: reset sidebar state
window.addEventListener('resize', () => {
  const s = document.getElementById('sidebar');
  const m = document.getElementById('main-content');
  if (!s) return;
  if (window.innerWidth >= 1024) {
    // Pindah ke desktop mode: hapus mobile state
    s.classList.remove('sidebar-open');
    _closeSidebarBackdrop();
  } else {
    // Pindah ke mobile/tablet: hapus desktop state
    s.classList.remove('collapsed');
    if (m) m.classList.remove('expanded');
    _closeSidebarBackdrop();
    s.classList.remove('sidebar-open');
  }
});

document.addEventListener('click', e => {
  // Mobile click-outside: tidak perlu karena sudah ditangani backdrop
  // Tablet: jika sidebar-open dan klik di luar sidebar, tutup
  const s = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  if (s && s.classList.contains('sidebar-open') &&
      !s.contains(e.target) &&
      (!toggleBtn || !toggleBtn.contains(e.target))) {
    s.classList.remove('sidebar-open');
    _closeSidebarBackdrop();
  }
});


function toggleDark() {
  document.body.classList.toggle('light-mode');
  const icon = document.getElementById('darkIcon');
  icon.className = document.body.classList.contains('light-mode') ? 'ph-fill ph-sun' : 'ph-fill ph-moon';
}

function toggleNotif() {
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  // Refresh notif setiap kali dibuka
  if (!isOpen) renderNotif();
}
document.addEventListener('click', e => {
  const nb = document.querySelector('.notification-btn');
  const nd = document.getElementById('notifDropdown');
  if (nd && nb && !nb.contains(e.target) && !nd.contains(e.target)) {
    nd.classList.remove('open');
  }
});

// ── REAL-TIME NOTIFICATION ENGINE ──────────────────────────────
function renderNotif() {
  const listEl  = document.getElementById('notifList');
  const badgeEl = document.getElementById('notifBadge');
  if (!listEl) return;

  const obat = getData('obat');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon  = new Date(today); soon.setDate(soon.getDate() + 30);

  const items = [];

  obat.forEach(o => {
    const stok    = Number(o.stok) || 0;
    const minStok = Number(o.minStok) || 20;
    const nama    = o.nama || 'Obat Tidak Dikenal';
    const satuan  = o.satuan || 'unit';

    // 🔴 Stok habis
    if (stok === 0) {
      items.push({
        level: 'danger',
        icon: 'ph-fill ph-x-circle',
        title: nama,
        msg: `Stok <strong>HABIS</strong>! Segera lakukan pengadaan.`,
        sort: 1
      });
    }
    // 🟡 Stok menipis (di bawah minimum)
    else if (stok < minStok) {
      items.push({
        level: 'warning',
        icon: 'ph-fill ph-warning',
        title: nama,
        msg: `Stok menipis — sisa <strong>${stok} ${satuan}</strong> (min: ${minStok})`,
        sort: 2
      });
    }

    // 🟠 Akan/Sudah Expired
    if (o.expired) {
      const exp = new Date(o.expired);
      exp.setHours(0, 0, 0, 0);
      if (!isNaN(exp)) {
        if (exp < today) {
          items.push({
            level: 'danger',
            icon: 'ph-fill ph-skull',
            title: nama,
            msg: `Sudah <strong>EXPIRED</strong> sejak ${exp.toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'})}!`,
            sort: 0
          });
        } else if (exp <= soon) {
          const diffDays = Math.ceil((exp - today) / 86400000);
          items.push({
            level: 'warning',
            icon: 'ph-fill ph-clock-countdown',
            title: nama,
            msg: `Akan expired dalam <strong>${diffDays} hari</strong> (${exp.toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'})})`,
            sort: 1
          });
        }
      }
    }
  });

  // Urutkan: expired dulu, lalu habis, lalu menipis
  items.sort((a, b) => a.sort - b.sort);

  // Update badge
  const count = items.length;
  if (badgeEl) {
    badgeEl.textContent = count > 99 ? '99+' : count;
    badgeEl.style.display = count > 0 ? 'flex' : 'none';
    badgeEl.style.background = items.some(i => i.sort === 0) ? 'var(--danger)' :
                               items.some(i => i.level === 'danger') ? 'var(--danger)' :
                               count > 0 ? '#f59e0b' : 'var(--danger)';
  }

  // Render list
  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <i class="ph-fill ph-check-circle" style="color:var(--secondary);font-size:28px"></i>
        <div style="font-weight:600;margin-top:6px">Semua Stok Aman</div>
        <div style="color:var(--text-muted);font-size:12px">Tidak ada peringatan saat ini</div>
      </div>`;
    return;
  }

  listEl.innerHTML = items.map(it => `
    <div class="notif-item ${it.level}" onclick="navigate('obat');document.getElementById('notifDropdown').classList.remove('open')">
      <i class="${it.icon}"></i>
      <div>
        <strong>${it.title}</strong>
        <span>${it.msg}</span>
      </div>
    </div>
  `).join('');
}



function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 3000);
}

function openModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ============================================================
// WELCOME PAGE
// ============================================================
function renderWelcome() {
  document.getElementById('page-container').innerHTML = `
    <div class="welcome-container" style="display:flex;flex-direction:column;gap:30px;max-width:1000px;margin:0 auto;padding-bottom:40px">
      
      <!-- HERO BANNER -->
      <div class="welcome-hero" style="background: linear-gradient(135deg, rgba(14,165,233,0.8), rgba(16,185,129,0.8)), url('./assets/images/bg-klinik.jpeg') center/cover; padding: 50px 40px; border-radius: var(--radius); color: white; position: relative; overflow: hidden; box-shadow: var(--shadow-lg);">
        <div style="position:relative; z-index:2">
          <span style="background:rgba(255,255,255,0.2); padding:6px 12px; border-radius:99px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; border:1px solid rgba(255,255,255,0.3)">Inovasi Digital Klinik</span>
          <h1 style="font-size:36px; font-weight:800; margin:16px 0 8px 0; font-family:'Poppins', sans-serif">Selamat Datang di IOS</h1>
          <p style="font-size:15px; opacity:0.95; max-width:650px; line-height:1.6; font-weight:400">
            Sistem Informasi Obat dan Kesehatan — persembahan inovasi digital dari <b>peserta MagangHub Divisi Klinik</b> untuk optimalisasi pelayanan medis di Klinik Pratama Lapas Kelas I Palembang / Lapas & Rutan.
          </p>
          <button class="btn btn-primary" onclick="navigate('${currentRole === 'admin' ? 'dashboard' : 'obat'}')" style="margin-top:24px; padding:12px 28px; background:white; color:#0f172a; font-weight:700; border-radius:var(--radius-sm); border:none; box-shadow:0 10px 20px rgba(0,0,0,0.15)">
            Mulai Jelajahi <i class="ph ph-arrow-right" style="margin-left:6px;font-weight:700"></i>
          </button>
        </div>
        <!-- Decorative blurred glow -->
        <div style="position:absolute; width:300px; height:300px; background:rgba(255,255,255,0.1); border-radius:50%; filter:blur(80px); top:-50px; right:-50px; z-index:1"></div>
      </div>

      <!-- GRID INFO -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:24px">
        
        <!-- APA ITU IOS -->
        <div class="card welcome-info-card" style="display:flex; flex-direction:column; gap:12px">
          <div style="width:48px; height:48px; border-radius:12px; background:rgba(14,165,233,0.15); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:24px">
            <i class="ph-fill ph-info"></i>
          </div>
          <h3 style="font-size:18px; font-weight:700; margin-top:8px">Apa itu IOS?</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.7">
            <b>IOS (Informasi Obat & Kesehatan)</b> adalah platform digital terintegrasi yang dirancang dengan arsitektur <i>Offline-First</i>. Sistem ini bertindak sebagai jembatan basis data real-time antara aplikasi klinik lokal dengan cloud database Google Sheets.
          </p>
        </div>

        <!-- MANFAAT UTAMA -->
        <div class="card welcome-info-card" style="display:flex; flex-direction:column; gap:12px">
          <div style="width:48px; height:48px; border-radius:12px; background:rgba(16,185,129,0.15); color:var(--secondary); display:flex; align-items:center; justify-content:center; font-size:24px">
            <i class="ph-fill ph-shield-check"></i>
          </div>
          <h3 style="font-size:18px; font-weight:700; margin-top:8px">Manfaat Sistem</h3>
          <p style="font-size:13px; color:var(--text-muted); line-height:1.7">
            Memudahkan pemantauan ketersediaan obat secara instan bagi staf medis, mencegah penimbunan atau kehabisan stok obat kritis, serta menyajikan edukasi tips kesehatan preventif secara terpusat untuk warga binaan dan staf.
          </p>
        </div>

      </div>

      <!-- DETAIL TUJUAN (FULL WIDTH CARD) -->
      <div class="card" style="padding:30px">
        <h3 style="font-size:20px; font-weight:700; margin-bottom:20px; display:flex; align-items:center; gap:10px">
          <i class="ph-fill ph-target" style="color:var(--primary)"></i> Tujuan Pengembangan Aplikasi
        </h3>
        
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:20px">
          
          <div style="display:flex; gap:12px">
            <i class="ph ph-check-circle" style="color:var(--secondary); font-size:22px; flex-shrink:0; margin-top:2px"></i>
            <div>
              <h4 style="font-size:14px; font-weight:600; margin-bottom:4px">Digitalisasi Data Medis</h4>
              <p style="font-size:12px; color:var(--text-muted); line-height:1.6">Mengeliminasi pencatatan manual berbasis kertas (paperless) untuk mengurangi risiko data hilang/rusak.</p>
            </div>
          </div>

          <div style="display:flex; gap:12px">
            <i class="ph ph-check-circle" style="color:var(--secondary); font-size:22px; flex-shrink:0; margin-top:2px"></i>
            <div>
              <h4 style="font-size:14px; font-weight:600; margin-bottom:4px">Pengendalian Stok Ketat</h4>
              <p style="font-size:12px; color:var(--text-muted); line-height:1.6">Melacak peredaran obat-obatan terkontrol secara akurat (seperti OAT dan Psikotropika) dengan otorisasi admin.</p>
            </div>
          </div>

          <div style="display:flex; gap:12px">
            <i class="ph ph-check-circle" style="color:var(--secondary); font-size:22px; flex-shrink:0; margin-top:2px"></i>
            <div>
              <h4 style="font-size:14px; font-weight:600; margin-bottom:4px">Offline-First Service</h4>
              <p style="font-size:12px; color:var(--text-muted); line-height:1.6">Memastikan aplikasi tetap bekerja 100% lancar walau koneksi internet terputus di dalam area klinik lapas.</p>
            </div>
          </div>

        </div>
      </div>

      <!-- TIM MAGANGHUB -->
      <div class="card welcome-info-card" style="display:flex; flex-direction:column; gap:16px; overflow:hidden; padding:0; border-radius:var(--radius); border:1px solid var(--border)">
        <img src="./assets/images/tim-magang.jpg" alt="Tim MagangHub" style="width:100%; height:380px; object-fit:cover; object-position:center 20%; border-bottom:1px solid var(--border)">
        <div style="padding:24px; padding-top:8px">
          <h3 style="font-size:20px; font-weight:700; margin-bottom:8px">Dipersembahkan oleh Tim MagangHub</h3>
          <p style="font-size:14px; color:var(--text-muted); line-height:1.6">
            Aplikasi IOS ini adalah wujud dedikasi dan inovasi digital dari peserta program MagangHub Divisi Klinik Palembang untuk meningkatkan kualitas pelayanan kesehatan di lingkungan Lapas & Rutan.
          </p>
        </div>
      </div>

      <!-- FOOTER KREDIT -->
      <div style="text-align:center; color:var(--text-dim); font-size:11px; margin-top:10px">
        © 2026 IOS App · MagangHub Divisi Klinik Pratama Lapas Kelas I Palembang · Kemenimipas
      </div>

    </div>
  `;
}

// ============================================================
// DASHBOARD PAGE
// ============================================================
function renderDashboard() {
  const obat = getData('obat');
  const pegawai = getData('pegawai');
  const stokMenipis = obat.filter(o => o.stok > 0 && o.stok < o.minStok).length;
  const stokHabis = obat.filter(o => o.stok === 0).length;
  const totalMasuk = obat.reduce((a, b) => a + b.masuk, 0);
  const totalKeluar = obat.reduce((a, b) => a + b.keluar, 0);
  const aktifPegawai = pegawai.filter(p => p.status === 'Aktif').length;

  const isHtmlAdmin = currentRole === 'admin';

  let alertStrip = '';
  if (isHtmlAdmin) {
    if (stokHabis > 0) alertStrip += `<div class="alert-strip danger"><i class="ph-fill ph-warning-circle"></i> <b>${stokHabis} obat</b> stok telah habis — segera lakukan pengadaan!</div>`;
    if (stokMenipis > 0) alertStrip += `<div class="alert-strip warning"><i class="ph-fill ph-warning"></i> <b>${stokMenipis} obat</b> stok menipis — perlu perhatian segera</div>`;
  }

  let statsGrid = '';
  if (isHtmlAdmin) {
    statsGrid = `
      <div class="stat-grid">
        <div class="stat-card" style="--card-color: #0EA5E9">
          <div class="stat-icon" style="background:rgba(14,165,233,0.15); color:#0EA5E9">
            <i class="ph-fill ph-pill"></i>
          </div>
          <div class="stat-info">
            <div class="value">${obat.length}</div>
            <div class="label">Total Jenis Obat</div>
            <div class="change up"><i class="ph ph-trend-up"></i> Aktif terdaftar</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #10B981">
          <div class="stat-icon" style="background:rgba(16,185,129,0.15); color:#10B981">
            <i class="ph-fill ph-arrow-circle-down"></i>
          </div>
          <div class="stat-info">
            <div class="value">${totalMasuk}</div>
            <div class="label">Total Stok Masuk</div>
            <div class="change up"><i class="ph ph-trend-up"></i> Pengadaan bulan ini</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #F59E0B">
          <div class="stat-icon" style="background:rgba(245,158,11,0.15); color:#F59E0B">
            <i class="ph-fill ph-arrow-circle-up"></i>
          </div>
          <div class="stat-info">
            <div class="value">${totalKeluar}</div>
            <div class="label">Total Stok Keluar</div>
            <div class="change down"><i class="ph ph-trend-down"></i> Distribusi bulan ini</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #6366F1">
          <div class="stat-icon" style="background:rgba(99,102,241,0.15); color:#6366F1">
            <i class="ph-fill ph-users-three"></i>
          </div>
          <div class="stat-info">
            <div class="value">${aktifPegawai}</div>
            <div class="label">Pegawai Aktif</div>
            <div class="change up"><i class="ph ph-check-circle"></i> dari ${pegawai.length} total</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #EF4444">
          <div class="stat-icon" style="background:rgba(239,68,68,0.15); color:#EF4444">
            <i class="ph-fill ph-warning-circle"></i>
          </div>
          <div class="stat-info">
            <div class="value">${stokHabis}</div>
            <div class="label">Stok Habis</div>
            <div class="change down" style="color:var(--danger)"><i class="ph ph-x-circle"></i> Perlu pengadaan</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #F59E0B">
          <div class="stat-icon" style="background:rgba(245,158,11,0.15); color:#F59E0B">
            <i class="ph-fill ph-warning"></i>
          </div>
          <div class="stat-info">
            <div class="value">${stokMenipis}</div>
            <div class="label">Stok Menipis</div>
            <div class="change" style="color:var(--warning)"><i class="ph ph-arrows-down-up"></i> Perlu perhatian</div>
          </div>
        </div>
      </div>
    `;
  } else {
    statsGrid = `
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))">
        <div class="stat-card" style="--card-color: #0EA5E9">
          <div class="stat-icon" style="background:rgba(14,165,233,0.15); color:#0EA5E9">
            <i class="ph-fill ph-pill"></i>
          </div>
          <div class="stat-info">
            <div class="value">${obat.length}</div>
            <div class="label">Jenis Obat Tersedia</div>
            <div class="change up"><i class="ph ph-check-circle"></i> Siap didistribusikan</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #6366F1">
          <div class="stat-icon" style="background:rgba(99,102,241,0.15); color:#6366F1">
            <i class="ph-fill ph-users-three"></i>
          </div>
          <div class="stat-info">
            <div class="value">${aktifPegawai}</div>
            <div class="label">Staf Medis Aktif</div>
            <div class="change up"><i class="ph ph-clock"></i> Jadwal pelayanan aktif</div>
          </div>
        </div>
        <div class="stat-card" style="--card-color: #10B981">
          <div class="stat-icon" style="background:rgba(16,185,129,0.15); color:#10B981">
            <i class="ph-fill ph-heart-pulse"></i>
          </div>
          <div class="stat-info">
            <div class="value">${getData('kesehatan').length}</div>
            <div class="label">Artikel Kesehatan</div>
            <div class="change up"><i class="ph ph-read-cv-logo"></i> Tips & info medis</div>
          </div>
        </div>
      </div>
    `;
  }

  const quickActionsHtml = isHtmlAdmin ? `
    <p style="font-weight:700;font-size:15px;margin-bottom:16px;color:var(--text-muted)">⚡ Akses Cepat</p>
    <div class="quick-actions">
      <div class="quick-action-card" onclick="navigate('obat')">
        <div class="qa-icon" style="background:rgba(14,165,233,0.15); color:#0EA5E9"><i class="ph-fill ph-pill"></i></div>
        <span>Stok Obat</span>
      </div>
      <div class="quick-action-card" onclick="navigate('pegawai')">
        <div class="qa-icon" style="background:rgba(99,102,241,0.15); color:#6366F1"><i class="ph-fill ph-users-three"></i></div>
        <span>Data Pegawai</span>
      </div>
      <div class="quick-action-card" onclick="navigate('kesehatan')">
        <div class="qa-icon" style="background:rgba(16,185,129,0.15); color:#10B981"><i class="ph-fill ph-heart-pulse"></i></div>
        <span>Info Kesehatan</span>
      </div>
      <div class="quick-action-card" onclick="navigate('laporan')">
        <div class="qa-icon" style="background:rgba(245,158,11,0.15); color:#F59E0B"><i class="ph-fill ph-chart-bar"></i></div>
        <span>Laporan</span>
      </div>
      <div class="quick-action-card" onclick="showFormTambahObat()">
        <div class="qa-icon" style="background:rgba(16,185,129,0.15); color:#10B981"><i class="ph-fill ph-plus-circle"></i></div>
        <span>Tambah Obat</span>
      </div>
      <div class="quick-action-card" onclick="showFormTambahPegawai()">
        <div class="qa-icon" style="background:rgba(239,68,68,0.15); color:#EF4444"><i class="ph-fill ph-user-plus"></i></div>
        <span>Tambah Pegawai</span>
      </div>
    </div>
  ` : `
    <p style="font-weight:700;font-size:15px;margin-bottom:16px;color:var(--text-muted)">⚡ Akses Cepat</p>
    <div class="quick-actions">
      <div class="quick-action-card" onclick="navigate('obat')">
        <div class="qa-icon" style="background:rgba(14,165,233,0.15); color:#0EA5E9"><i class="ph-fill ph-pill"></i></div>
        <span>Cek Stok Obat</span>
      </div>
      <div class="quick-action-card" onclick="navigate('pegawai')">
        <div class="qa-icon" style="background:rgba(99,102,241,0.15); color:#6366F1"><i class="ph-fill ph-users-three"></i></div>
        <span>Jadwal Dokter / Staf</span>
      </div>
      <div class="quick-action-card" onclick="navigate('kesehatan')">
        <div class="qa-icon" style="background:rgba(16,185,129,0.15); color:#10B981"><i class="ph-fill ph-heart-pulse"></i></div>
        <span>Tips Info Kesehatan</span>
      </div>
    </div>
  `;

  const recentLogsHtml = isHtmlAdmin ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title"><i class="ph-fill ph-clock-countdown"></i> Transaksi Obat Terbaru</div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('obat')">Lihat Semua</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama Obat</th>
              <th>Jenis</th>
              <th>Jumlah</th>
              <th>Keterangan</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            ${getData('log').slice(-5).reverse().map(l => `
              <tr>
                <td><b>${l.obat}</b></td>
                <td><span class="badge ${l.jenis === 'masuk' ? 'badge-success' : 'badge-warning'}">${l.jenis === 'masuk' ? '↓ Masuk' : '↑ Keluar'}</span></td>
                <td>${l.jumlah}</td>
                <td>${l.keterangan}</td>
                <td style="color:var(--text-muted);font-size:13px">${l.timestamp}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>👋 ${isHtmlAdmin ? 'Selamat Datang, Admin!' : 'Selamat Datang di IOS!'}</h1>
        <p>${isHtmlAdmin ? 'Ringkasan aktivitas Klinik Pratama Lapas Kelas I Palembang hari ini' : 'Sistem Informasi Digital Obat & Kesehatan Klinik Pratama Lapas Kelas I Palembang'}</p>
      </div>
    </div>

    ${alertStrip}
    ${statsGrid}
    ${quickActionsHtml}

    <div class="dashboard-charts">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-bar"></i> Kategori Obat</div>
        </div>
        <div class="chart-container">
          <canvas id="chartKategori"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-pie"></i> Ketersediaan Stok</div>
        </div>
        <div class="chart-container">
          <canvas id="chartStatus"></canvas>
        </div>
      </div>
    </div>

    ${recentLogsHtml}
  `;

  setTimeout(() => renderDashboardCharts(obat), 100);
}

function renderDashboardCharts(obat) {
  const kategoriCount = {};
  obat.forEach(o => { kategoriCount[o.kategori] = (kategoriCount[o.kategori] || 0) + 1; });

  const ctx1 = document.getElementById('chartKategori');
  if (ctx1) {
    charts.kategori = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: Object.keys(kategoriCount),
        datasets: [{
          label: 'Jumlah Obat',
          data: Object.values(kategoriCount),
          backgroundColor: ['#0EA5E9','#10B981','#F59E0B','#EF4444','#6366F1','#EC4899','#8B5CF6'],
          borderRadius: 8, borderSkipped: false
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } } } }
    });
  }

  const aman = obat.filter(o => o.stok >= o.minStok).length;
  const menipis = obat.filter(o => o.stok > 0 && o.stok < o.minStok).length;
  const habis = obat.filter(o => o.stok === 0).length;
  const ctx2 = document.getElementById('chartStatus');
  if (ctx2) {
    charts.status = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Stok Aman', 'Stok Menipis', 'Stok Habis'],
        datasets: [{ data: [aman, menipis, habis], backgroundColor: ['#10B981','#F59E0B','#EF4444'], borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 16, usePointStyle: true } } },
        cutout: '70%'
      }
    });
  }
}

// ============================================================
// OBAT PAGE
// ============================================================
function renderObat() {
  const obat = getData('obat');
  const kategoriSet = [...new Set(obat.map(o => o.kategori))];

  const isHtmlAdmin = currentRole === 'admin';
  const addObatBtn = isHtmlAdmin ? `<button class="btn btn-primary" onclick="showFormTambahObat()"><i class="ph ph-plus"></i> Tambah Obat</button>` : '';
  const headerTitle = isHtmlAdmin ? 'Manajemen Stok Obat' : 'Informasi Stok Obat';
  const headerDesc = isHtmlAdmin ? 'Kelola data stok obat harian — tambah, edit, dan catat transaksi masuk/keluar' : 'Cari dan pantau ketersediaan stok obat secara real-time';

  const transactionForm = isHtmlAdmin ? `
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <div class="card-title"><i class="ph-fill ph-arrows-down-up"></i> Catat Transaksi Obat</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nama Obat</label>
          <select class="form-control" id="txObat">
            ${obat.map(o => `<option value="${o.id}">${o.nama}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Jenis Transaksi</label>
          <select class="form-control" id="txJenis">
            <option value="masuk">Obat Masuk (Pengadaan)</option>
            <option value="keluar">Obat Keluar (Distribusi)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jumlah</label>
          <input type="number" class="form-control" id="txJumlah" placeholder="Masukkan jumlah" min="1" />
        </div>
        <div class="form-group">
          <label>Keterangan</label>
          <input type="text" class="form-control" id="txKet" placeholder="Keterangan transaksi..." />
        </div>
      </div>
      <button class="btn btn-primary" onclick="simpanTransaksi()"><i class="ph ph-paper-plane-right"></i> Simpan Transaksi</button>
    </div>
  ` : '';

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>💊 ${headerTitle}</h1>
        <p>${headerDesc}</p>
      </div>
      ${addObatBtn}
    </div>

    <div class="filters">
      <div class="search-bar">
        <i class="ph ph-magnifying-glass"></i>
        <input type="text" id="searchObat" placeholder="Cari nama obat..." oninput="filterObat()" />
      </div>
      <select class="form-control" id="filterKategori" onchange="filterObat()" style="width:auto">
        <option value="">Semua Kategori</option>
        ${kategoriSet.map(k => `<option value="${k}">${k}</option>`).join('')}
      </select>
      <select class="form-control" id="filterStatus" onchange="filterObat()" style="width:auto">
        <option value="">Semua Status</option>
        <option value="aman">Stok Aman</option>
        <option value="menipis">Stok Menipis</option>
        <option value="habis">Stok Habis</option>
      </select>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ph-fill ph-list-bullets"></i> Daftar Obat</div>
        <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="ph ph-printer"></i> Print</button>
      </div>
      <div class="table-wrap" id="tabelObatWrap">
        ${renderTabelObat(obat)}
      </div>
    </div>

    ${transactionForm}
  `;
}

function renderTabelObat(obat) {
  if (!obat.length) return '<div class="empty-state"><i class="ph ph-pill"></i><p>Belum ada data obat</p></div>';

  if (currentRole === 'admin') {
    return `
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nama Obat</th>
            <th>Kategori</th>
            <th>Satuan</th>
            <th>Tgl Masuk</th>
            <th>Stok Masuk</th>
            <th>Stok Keluar</th>
            <th>Sisa Stok</th>
            <th>Min. Stok</th>
            <th>Expired</th>
            <th>Kontrol</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${obat.map((o, i) => {
            let statusBadge = '';
            if (o.stok === 0) statusBadge = '<span class="badge badge-danger">🔴 Habis</span>';
            else if (o.stok < o.minStok) statusBadge = '<span class="badge badge-warning">🟡 Menipis</span>';
            else statusBadge = '<span class="badge badge-success">🟢 Aman</span>';

            let kontrolBadge = '<span style="color:var(--text-dim);font-size:12px">—</span>';
            if (o.controlled && o.kategori === 'Terapi OAT') {
              kontrolBadge = '<span class="badge-oat">OAT / PMO</span>';
            } else if (o.controlled) {
              kontrolBadge = '<span class="badge-controlled">⚠ Psikotropika</span>';
            }

            return `
              <tr class="${o.controlled ? 'row-controlled' : ''}">
                <td style="color:var(--text-muted)">${i+1}</td>
                <td>
                  <b>${o.nama}</b>
                  ${o.keterangan ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">${o.keterangan}</div>` : ''}
                </td>
                <td><span class="badge badge-info">${o.kategori}</span></td>
                <td>${o.satuan}</td>
                <td style="color:var(--text-muted);font-size:12px">${o.tanggalMasuk || o.tanggal || '—'}</td>
                <td style="color:#10B981;font-weight:600">${o.masuk}</td>
                <td style="color:#F59E0B;font-weight:600">${o.keluar}</td>
                <td style="font-weight:700;font-size:16px">${o.stok}</td>
                <td style="color:var(--text-muted)">${o.minStok}</td>
                <td style="color:var(--text-muted);font-size:13px">${o.expired}</td>
                <td>${kontrolBadge}</td>
                <td>${statusBadge}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="editObat(${o.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="hapusObat(${o.id})" title="Hapus"><i class="ph ph-trash"></i></button>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    // Tampilan Publik
    return `
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nama Obat</th>
            <th>Kategori</th>
            <th>Satuan</th>
            <th>Ketersediaan</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${obat.map((o, i) => {
            let statusBadge = '';
            if (o.stok === 0) statusBadge = '<span class="badge badge-danger">🔴 Habis</span>';
            else if (o.stok < o.minStok) statusBadge = '<span class="badge badge-warning">🟡 Menipis</span>';
            else statusBadge = '<span class="badge badge-success">🟢 Tersedia</span>';

            return `
              <tr>
                <td style="color:var(--text-muted)">${i+1}</td>
                <td>
                  <b>${o.nama}</b>
                </td>
                <td><span class="badge badge-info">${o.kategori}</span></td>
                <td>${o.satuan}</td>
                <td style="font-weight:700;font-size:15px">${o.stok > 0 ? o.stok : 'Kosong'}</td>
                <td>${statusBadge}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }
}

function filterObat() {
  const q = document.getElementById('searchObat').value.toLowerCase();
  const kat = document.getElementById('filterKategori').value;
  const st = document.getElementById('filterStatus').value;
  let obat = getData('obat');
  if (q) obat = obat.filter(o => o.nama.toLowerCase().includes(q));
  if (kat) obat = obat.filter(o => o.kategori === kat);
  if (st === 'aman') obat = obat.filter(o => o.stok >= o.minStok);
  else if (st === 'menipis') obat = obat.filter(o => o.stok > 0 && o.stok < o.minStok);
  else if (st === 'habis') obat = obat.filter(o => o.stok === 0);
  document.getElementById('tabelObatWrap').innerHTML = renderTabelObat(obat);
}

function showFormTambahObat(obatData = null) {
  const isEdit = !!obatData;
  const today  = new Date().toISOString().split('T')[0];
  const o = obatData || { nama:'', kategori:'', satuan:'', masuk:0, keluar:0, stok:0, minStok:20, expired:'', tanggalMasuk: today, tanggal: today };
  // Pastikan tanggalMasuk ada (data lama mungkin tidak punya field ini)
  if (!o.tanggalMasuk) o.tanggalMasuk = o.tanggal || today;
  const defaultKategori = ['Antibiotik','Analgesik','Vitamin','Antasida','Antidiabetik','Lambung','Antihistamin','Bronkodilator','Psikotropika','OAT'];
  const isCustomKat = o.kategori && !defaultKategori.includes(o.kategori);
  const selectedKat = isCustomKat ? 'Lainnya' : (o.kategori || 'Analgesik');

  openModal(isEdit ? 'Edit Data Obat' : 'Tambah Obat Baru', `
    <div class="form-row">
      <div class="form-group">
        <label>Nama Obat</label>
        <input class="form-control" id="fNama" value="${o.nama}" placeholder="Contoh: Paracetamol 500mg" />
      </div>
      <div class="form-group">
        <label>Kategori</label>
        <select class="form-control" id="fKat" onchange="toggleKatCustom()">
          ${[...defaultKategori, 'Lainnya'].map(k =>
            `<option value="${k}" ${selectedKat===k?'selected':''}>${k}</option>`).join('')}
        </select>
        <input class="form-control" id="fKatCustom"
          placeholder="Ketik nama kategori baru..."
          value="${isCustomKat ? o.kategori : ''}"
          style="margin-top:8px;display:${isCustomKat ? 'block' : 'none'}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Satuan</label>
        <select class="form-control" id="fSat">
          ${['Strip','Box','Botol','Tablet','Kapsul','Ampul','Vial'].map(s =>
            `<option value="${s}" ${o.satuan===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Stok Minimum</label>
        <input type="number" class="form-control" id="fMinStok" value="${o.minStok}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Stok Masuk</label>
        <input type="number" class="form-control" id="fMasuk" value="${o.masuk}" />
      </div>
      <div class="form-group">
        <label>Stok Keluar</label>
        <input type="number" class="form-control" id="fKeluar" value="${o.keluar}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label><i class="ph ph-calendar-plus" style="color:var(--primary)"></i> Tanggal Masuk</label>
        <input type="date" class="form-control" id="fTanggalMasuk" value="${o.tanggalMasuk}" />
      </div>
      <div class="form-group">
        <label><i class="ph ph-calendar-x" style="color:var(--danger)"></i> Tanggal Expired</label>
        <input type="date" class="form-control" id="fExp" value="${o.expired}" />
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="simpanObat(${isEdit ? o.id : 'null'})">
      <i class="ph ph-floppy-disk"></i> ${isEdit ? 'Simpan Perubahan' : 'Tambah Obat'}
    </button>
  `);
}

// Tampilkan / sembunyikan field kategori custom saat pilih 'Lainnya'
window.toggleKatCustom = function() {
  const sel    = document.getElementById('fKat');
  const custom = document.getElementById('fKatCustom');
  if (!sel || !custom) return;
  if (sel.value === 'Lainnya') {
    custom.style.display = 'block';
    custom.focus();
  } else {
    custom.style.display = 'none';
    custom.value = '';
  }
};

function simpanObat(editId) {
  const nama         = document.getElementById('fNama').value.trim();
  const katSel       = document.getElementById('fKat').value;
  const katCustom    = (document.getElementById('fKatCustom')?.value || '').trim();
  const kat          = katSel === 'Lainnya' ? (katCustom || 'Lainnya') : katSel;
  const sat          = document.getElementById('fSat').value;
  const minStok      = parseInt(document.getElementById('fMinStok').value) || 0;
  const masuk        = parseInt(document.getElementById('fMasuk').value) || 0;
  const keluar       = parseInt(document.getElementById('fKeluar').value) || 0;
  const exp          = document.getElementById('fExp').value;
  const tanggalMasuk = document.getElementById('fTanggalMasuk').value || new Date().toISOString().split('T')[0];

  if (!nama) { showToast('Nama obat wajib diisi!', true); return; }

  // Peringatan psikotropika
  const psikotropikaKat = ['Psikotropika'];
  if (psikotropikaKat.includes(kat) && !editId) {
    showToast('⚠️ Obat Psikotropika ditambahkan — pastikan ada persetujuan Kepala Klinik!', false);
  }

  let obat = getData('obat');
  const stok = masuk - keluar;
  let savedObat;

  if (editId) {
    obat = obat.map(o => o.id === editId ? {...o, nama, kategori:kat, satuan:sat, minStok, masuk, keluar, stok, expired:exp, tanggalMasuk} : o);
    savedObat = obat.find(o => o.id === editId);
    showToast('✅ Data obat berhasil diperbarui!');
  } else {
    savedObat = { id: getNextId(obat), nama, kategori:kat, satuan:sat, masuk, keluar, stok, minStok, expired:exp, tanggalMasuk, tanggal: tanggalMasuk };
    obat.push(savedObat);
    showToast('✅ Obat baru berhasil ditambahkan!');
  }
  saveData('obat', obat);
  SyncManager.enqueue('obat', 'upsert', savedObat);
  _bgPush();
  closeModal();
  renderObat();
}

function editObat(id) {
  const o = getData('obat').find(x => x.id === id);
  if (o) showFormTambahObat(o);
}

function hapusObat(id) {
  if (!confirm('Yakin ingin menghapus data obat ini?')) return;
  let obat = getData('obat').filter(o => o.id !== id);
  saveData('obat', obat);
  SyncManager.enqueue('obat', 'delete', { id });
  _bgPush();
  showToast('🗑️ Data obat berhasil dihapus!');
  renderObat();
}

function simpanTransaksi() {
  const obatId = parseInt(document.getElementById('txObat').value);
  const jenis = document.getElementById('txJenis').value;
  const jumlah = parseInt(document.getElementById('txJumlah').value) || 0;
  const ket = document.getElementById('txKet').value || '-';

  if (!jumlah || jumlah <= 0) { showToast('Jumlah transaksi harus lebih dari 0!', true); return; }

  let obat = getData('obat');
  const idx = obat.findIndex(o => o.id === obatId);
  if (idx < 0) { showToast('Obat tidak ditemukan!', true); return; }

  if (jenis === 'keluar' && obat[idx].stok < jumlah) {
    showToast('Stok tidak mencukupi!', true); return;
  }

  // Peringatan pengeluaran obat terkontrol
  if (jenis === 'keluar' && obat[idx].controlled) {
    showToast('⚠️ Obat terkontrol dikeluarkan — pastikan resep & TTD Kepala Klinik tersedia!', false);
  }

  if (jenis === 'masuk') { obat[idx].masuk += jumlah; obat[idx].stok += jumlah; }
  else { obat[idx].keluar += jumlah; obat[idx].stok -= jumlah; }
  saveData('obat', obat);
  SyncManager.enqueue('obat', 'upsert', obat[idx]);

  let log = getData('log');
  const now = new Date();
  const newLog = {
    id: getNextId(log),
    obat: obat[idx].nama, jenis, jumlah,
    keterangan: obat[idx].controlled ? `⚠ TERKONTROL — ${ket}` : ket,
    timestamp: now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})
  };
  log.push(newLog);
  saveData('log', log);
  SyncManager.enqueue('log', 'upsert', newLog);
  _bgPush();
  showToast(`✅ Transaksi ${jenis} berhasil dicatat!`);
  renderObat();
}

// ============================================================
// PEGAWAI PAGE
// ============================================================
function renderPegawai() {
  const pegawai = getData('pegawai');
  const jabatanSet = [...new Set(pegawai.map(p => p.jabatan))];

  const isHtmlAdmin = currentRole === 'admin';
  const addPegawaiBtn = isHtmlAdmin ? `<button class="btn btn-primary" onclick="showFormTambahPegawai()"><i class="ph ph-user-plus"></i> Tambah Pegawai</button>` : '';
  const headerTitle = isHtmlAdmin ? 'Data Pegawai Klinik' : 'Staf Medis Klinik';
  const headerDesc = isHtmlAdmin ? 'Kelola informasi dokter, perawat, apoteker, dan admin klinik' : 'Informasi jadwal tugas dokter, perawat, dan staf medis klinik';

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>👨‍⚕️ ${headerTitle}</h1>
        <p>${headerDesc}</p>
      </div>
      ${addPegawaiBtn}
    </div>

    <div class="filters">
      <div class="search-bar">
        <i class="ph ph-magnifying-glass"></i>
        <input type="text" id="searchPegawai" placeholder="Cari nama pegawai..." oninput="filterPegawai()" />
      </div>
      <select class="form-control" id="filterJabatan" onchange="filterPegawai()" style="width:auto">
        <option value="">Semua Jabatan</option>
        ${jabatanSet.map(j => `<option value="${j}">${j}</option>`).join('')}
      </select>
      <select class="form-control" id="filterStatusPeg" onchange="filterPegawai()" style="width:auto">
        <option value="">Semua Status</option>
        <option value="Aktif">Aktif</option>
        <option value="Izin">Izin</option>
      </select>
    </div>

    <div class="pegawai-grid" id="pegawaiGrid">
      ${renderKartuPegawai(pegawai)}
    </div>
  `;
}

function renderKartuPegawai(pegawai) {
  if (!pegawai.length) return '<div class="empty-state" style="grid-column:1/-1"><i class="ph ph-users"></i><p>Belum ada data pegawai</p></div>';
  const jabatanColors = { 'Dokter Spesialis': '#818CF8', 'Dokter Umum': '#0EA5E9', 'Perawat': '#10B981', 'Apoteker': '#F59E0B', 'Admin': '#EC4899' };

  // Sembunyikan staf Admin dari publik demi privasi & keamanan IT
  const list = currentRole === 'admin' ? pegawai : pegawai.filter(p => p.jabatan !== 'Admin');

  return list.map(p => {
    const color = jabatanColors[p.jabatan] || '#94A3B8';
    const phoneHtml = currentRole === 'admin' ? `<div class="pegawai-detail"><i class="ph ph-phone"></i> ${p.hp}</div>` : '';
    const actionsHtml = currentRole === 'admin' ? `
      <div class="pegawai-actions">
        <button class="btn btn-secondary btn-sm btn-icon" onclick="editPegawai(${p.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="hapusPegawai(${p.id})" title="Hapus"><i class="ph ph-trash"></i></button>
      </div>
    ` : '';

    return `
      <div class="pegawai-card">
        ${p.foto ? `<img src="${p.foto}" class="pegawai-avatar" style="padding:0; object-fit:cover;">` : `<div class="pegawai-avatar" style="background: linear-gradient(135deg, ${color}, ${color}99)">${p.inisial}</div>`}
        <div class="pegawai-name">${p.nama}</div>
        <div class="pegawai-jabatan" style="color:${color}">${p.jabatan}</div>
        <div class="pegawai-detail"><i class="ph ph-stethoscope"></i> ${p.spesialisasi}</div>
        <div class="pegawai-detail"><i class="ph ph-calendar-blank"></i> ${p.jadwal}</div>
        ${phoneHtml}
        <span class="badge ${p.status === 'Aktif' ? 'badge-success' : 'badge-warning'}">${p.status === 'Aktif' ? '● Aktif' : '○ Izin'}</span>
        ${actionsHtml}
      </div>
    `;
  }).join('');
}

function filterPegawai() {
  const q = document.getElementById('searchPegawai').value.toLowerCase();
  const jab = document.getElementById('filterJabatan').value;
  const st = document.getElementById('filterStatusPeg').value;
  let pegawai = getData('pegawai');
  if (q) pegawai = pegawai.filter(p => p.nama.toLowerCase().includes(q));
  if (jab) pegawai = pegawai.filter(p => p.jabatan === jab);
  if (st) pegawai = pegawai.filter(p => p.status === st);
  document.getElementById('pegawaiGrid').innerHTML = renderKartuPegawai(pegawai);
}

function showFormTambahPegawai(pegawaiData = null) {
  const isEdit = !!pegawaiData;
  const p = pegawaiData || { nama:'', jabatan:'Dokter Umum', spesialisasi:'', hp:'', email:'', jadwal:'', status:'Aktif', inisial:'', foto:'' };
  openModal(isEdit ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru', `
    <div style="display:flex; justify-content:center; margin-bottom:20px; flex-direction:column; align-items:center; gap:10px">
      <input type="hidden" id="pFotoBase64" value="${p.foto || ''}">
      
      <label style="cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:10px;">
        <!-- Preview Foto -->
        <img id="pFotoPreview" src="${p.foto || ''}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;display:${p.foto ? 'block' : 'none'};border:2px solid var(--primary)">
        
        <!-- Placeholder Kamera -->
        <div id="pFotoPlaceholder" style="width:80px;height:80px;border-radius:50%;background:var(--surface);display:${p.foto ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:24px;color:var(--text-muted);border:2px dashed var(--border); transition:0.2s">
          <i class="ph ph-camera"></i>
        </div>
        
        <!-- Tombol Upload -->
        <div class="btn btn-secondary btn-sm">
          <i class="ph ph-upload-simple"></i> Upload Foto
        </div>
        
        <input type="file" accept="image/*" style="display:none" onchange="handlePegawaiFotoUpload(event)">
      </label>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nama Lengkap</label>
        <input class="form-control" id="pNama" value="${p.nama}" placeholder="Masukkan nama lengkap" />
      </div>
      <div class="form-group">
        <label>Inisial (2-3 huruf)</label>
        <input class="form-control" id="pInisial" value="${p.inisial}" maxlength="3" placeholder="mis: SR" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Jabatan</label>
        <select class="form-control" id="pJabatan">
          ${['Dokter Spesialis','Dokter Umum','Perawat','Apoteker','Admin'].map(j =>
            `<option value="${j}" ${p.jabatan===j?'selected':''}>${j}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Spesialisasi / Bidang</label>
        <input class="form-control" id="pSpesialis" value="${p.spesialisasi}" placeholder="mis: Penyakit Dalam" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>No. HP</label>
        <input class="form-control" id="pHp" value="${p.hp}" placeholder="08xx-xxxx-xxxx" />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input class="form-control" id="pEmail" value="${p.email}" placeholder="email@klinik.id" />
      </div>
    </div>
    <div class="form-group">
      <label>Jadwal Jaga</label>
      <input class="form-control" id="pJadwal" value="${p.jadwal}" placeholder="mis: Senin, Rabu, Jumat" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-control" id="pStatus">
        <option value="Aktif" ${p.status==='Aktif'?'selected':''}>Aktif</option>
        <option value="Izin" ${p.status==='Izin'?'selected':''}>Izin</option>
      </select>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="simpanPegawai(${isEdit ? p.id : 'null'})">
      <i class="ph ph-floppy-disk"></i> ${isEdit ? 'Simpan Perubahan' : 'Tambah Pegawai'}
    </button>
  `);
}

function handlePegawaiFotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 150;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      document.getElementById('pFotoBase64').value = dataUrl;
      document.getElementById('pFotoPreview').src = dataUrl;
      document.getElementById('pFotoPreview').style.display = 'block';
      document.getElementById('pFotoPlaceholder').style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function simpanPegawai(editId) {
  const nama = document.getElementById('pNama').value.trim();
  const inisial = document.getElementById('pInisial').value.trim().toUpperCase();
  const jabatan = document.getElementById('pJabatan').value;
  const spesialisasi = document.getElementById('pSpesialis').value.trim();
  const hp = document.getElementById('pHp').value.trim();
  const email = document.getElementById('pEmail').value.trim();
  const jadwal = document.getElementById('pJadwal').value.trim();
  const status = document.getElementById('pStatus').value;
  const foto = document.getElementById('pFotoBase64').value;

  if (!nama || !inisial) { showToast('Nama dan inisial wajib diisi!', true); return; }

  let pegawai = getData('pegawai');
  let savedPegawai;
  if (editId) {
    pegawai = pegawai.map(p => p.id === editId ? {...p, nama, inisial, jabatan, spesialisasi, hp, email, jadwal, status, foto} : p);
    savedPegawai = pegawai.find(p => p.id === editId);
    showToast('✅ Data pegawai berhasil diperbarui!');
  } else {
    savedPegawai = { id: getNextId(pegawai), nama, inisial, jabatan, spesialisasi, hp, email, jadwal, status, foto };
    pegawai.push(savedPegawai);
    showToast('✅ Pegawai baru berhasil ditambahkan!');
  }
  saveData('pegawai', pegawai);
  SyncManager.enqueue('pegawai', 'upsert', savedPegawai);
  _bgPush();
  closeModal();
  renderPegawai();
}

function editPegawai(id) {
  const p = getData('pegawai').find(x => x.id === id);
  if (p) showFormTambahPegawai(p);
}

function hapusPegawai(id) {
  if (!confirm('Yakin ingin menghapus data pegawai ini?')) return;
  saveData('pegawai', getData('pegawai').filter(p => p.id !== id));
  SyncManager.enqueue('pegawai', 'delete', { id });
  _bgPush();
  showToast('🗑️ Data pegawai berhasil dihapus!');
  renderPegawai();
}

// ============================================================
// KESEHATAN PAGE
// ============================================================
function renderKesehatan() {
  const kesehatan = getData('kesehatan');
  const kategoriSet = [...new Set(kesehatan.map(a => a.kategori))];
  const isHtmlAdmin = currentRole === 'admin';
  
  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>❤️ Informasi Kesehatan</h1>
        <p>Artikel tips kesehatan, panduan penyakit, dan informasi medis terkini</p>
      </div>
      ${isHtmlAdmin ? `<button class="btn btn-primary" onclick="showFormArtikel()"><i class="ph ph-plus"></i> Tambah Artikel</button>` : ''}
    </div>

    <div class="filters">
      <div class="search-bar">
        <i class="ph ph-magnifying-glass"></i>
        <input type="text" id="searchArtikel" placeholder="Cari artikel..." oninput="filterArtikel()" />
      </div>
      <select class="form-control" id="filterKatArtikel" onchange="filterArtikel()" style="width:auto">
        <option value="">Semua Kategori</option>
        ${kategoriSet.map(k => `<option value="${k}">${k}</option>`).join('')}
      </select>
    </div>

    <div class="artikel-grid" id="artikelGrid">
      ${renderKartuArtikel(kesehatan)}
    </div>
  `;
}

function renderKartuArtikel(data) {
  return data.map(a => {
    const isHtmlAdmin = currentRole === 'admin';
    const hasImage = a.image ? true : false;
    const imgStyle = hasImage ? `background: url('${a.image}') center/cover;` : `background: ${a.bg};`;
    const emojiHtml = hasImage ? '' : a.emoji;
    
    const adminActions = isHtmlAdmin ? `
      <div class="artikel-card-actions" style="position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:10" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="showFormArtikel(${a.id})" style="background:rgba(15,23,42,0.85);backdrop-filter:blur(4px);color:white;border:none;border-radius:6px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Edit"><i class="ph ph-pencil-simple" style="font-size:16px"></i></button>
        <button class="btn-icon" onclick="hapusArtikel(${a.id})" style="background:rgba(239,68,68,0.9);backdrop-filter:blur(4px);color:white;border:none;border-radius:6px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Hapus"><i class="ph ph-trash" style="font-size:16px"></i></button>
      </div>
    ` : '';

    return `
      <div class="artikel-card" onclick="showArtikel(${a.id})" style="position:relative">
        ${adminActions}
        <div class="artikel-img" style="${imgStyle}">${emojiHtml}</div>
        <div class="artikel-body">
          <div class="artikel-category">${a.kategori}</div>
          <div class="artikel-title">${a.judul}</div>
          <div class="artikel-excerpt">${a.excerpt}</div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">${a.tanggal}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterArtikel() {
  const q = document.getElementById('searchArtikel').value.toLowerCase();
  const kat = document.getElementById('filterKatArtikel').value;
  const kesehatan = getData('kesehatan');
  let data = kesehatan;
  if (q) data = data.filter(a => a.judul.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q));
  if (kat) data = data.filter(a => a.kategori === kat);
  document.getElementById('artikelGrid').innerHTML = renderKartuArtikel(data);
}

function showArtikel(id) {
  const kesehatan = getData('kesehatan');
  const a = kesehatan.find(x => x.id === id);
  if (!a) return;
  
  const headerHtml = a.image ? 
    `<div style="width:100%;height:240px;border-radius:12px;background:url('${a.image}') center/cover;margin-bottom:16px;box-shadow:var(--shadow)"></div>` :
    `<div style="background:${a.bg};border-radius:12px;padding:35px;text-align:center;font-size:48px;margin-bottom:16px">${a.emoji}</div>`;

  const isHtmlAdmin = currentRole === 'admin';
  const adminFooterHtml = isHtmlAdmin ? `
    <div style="margin-top:20px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:end;gap:10px">
      <button class="btn btn-secondary" onclick="closeModal(); showFormArtikel(${a.id})"><i class="ph ph-pencil-simple"></i> Edit Artikel</button>
      <button class="btn btn-danger" onclick="closeModal(); hapusArtikel(${a.id})"><i class="ph ph-trash"></i> Hapus</button>
    </div>
  ` : '';

  openModal(a.judul, `
    ${headerHtml}
    <span class="badge badge-info" style="margin-bottom:12px">${a.kategori}</span>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">📅 ${a.tanggal}</p>
    <div style="line-height:1.8;font-size:14px;white-space:pre-wrap;color:var(--text)">${a.konten}</div>
    ${adminFooterHtml}
  `);
}

function showFormArtikel(id) {
  const kesehatan = getData('kesehatan');
  const a = id ? kesehatan.find(x => x.id === id) : null;
  const isEdit = !!a;
  const categories = [...new Set(kesehatan.map(x => x.kategori))];

  openModal(isEdit ? 'Edit Artikel Kesehatan' : 'Tambah Artikel Baru', `
    <div class="form-container" style="display:flex;flex-direction:column;gap:14px;max-width:100%;box-sizing:border-box">
      <input type="hidden" id="artBase64Data" value="${isEdit && a.image ? a.image : ''}" />
      
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Judul Artikel</label>
          <input type="text" class="form-control" id="artJudul" value="${isEdit ? a.judul : ''}" placeholder="Masukkan judul..." required />
        </div>
        <div class="form-group" style="flex:1">
          <label>Kategori</label>
          <input type="text" class="form-control" id="artKategori" value="${isEdit ? a.kategori : ''}" placeholder="Misal: Dermatologi..." list="artKatList" required />
          <datalist id="artKatList">
            ${categories.map(c => `<option value="${c}">`).join('')}
          </datalist>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Emoji (Ikon Fallback)</label>
          <input type="text" class="form-control" id="artEmoji" value="${isEdit ? a.emoji : '🔬'}" placeholder="🔬" style="text-align:center" />
        </div>
        <div class="form-group" style="flex:3">
          <label>Cover Artikel (Upload Gambar)</label>
          <div style="display:flex;gap:10px;align-items:center">
            <input type="file" id="artImageInput" accept="image/*" style="display:none" onchange="prosesUploadGambarArtikel(this)" />
            <button class="btn btn-secondary" onclick="document.getElementById('artImageInput').click()"><i class="ph ph-upload-simple"></i> Pilih File Gambar</button>
            <button class="btn btn-danger" onclick="hapusGambarArtikelUploaded()" style="padding:10px"><i class="ph ph-trash"></i> Hapus Gambar</button>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Preview Media Cover</label>
        <div style="width:100%;height:150px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img id="artImagePreview" src="${isEdit && a.image ? a.image : ''}" style="width:100%;height:100%;object-fit:cover;display:${isEdit && a.image ? 'block' : 'none'}" />
          <div id="artFallbackPreview" style="display:${isEdit && a.image ? 'none' : 'flex'};align-items:center;justify-content:center;font-size:36px;width:100%;height:100%;background:${isEdit ? a.bg : 'linear-gradient(135deg, #1a2a3a, #0ea5e9)'}">
            <span id="artFallbackEmoji">${isEdit ? a.emoji : '🔬'}</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Ringkasan Pendek (Excerpt)</label>
        <input type="text" class="form-control" id="artExcerpt" value="${isEdit ? a.excerpt : ''}" placeholder="Tuliskan ringkasan singkat artikel..." required />
      </div>

      <div class="form-group">
        <label>Isi Konten Artikel</label>
        <textarea class="form-control" id="artKonten" rows="8" placeholder="Tuliskan isi konten kesehatan secara mendalam..." style="resize:vertical" required>${isEdit ? a.konten : ''}</textarea>
      </div>

      <button class="btn btn-primary" onclick="simpanArtikel(${isEdit ? a.id : 'null'})" style="width:100%;margin-top:10px">
        <i class="ph ph-floppy-disk"></i> Simpan Artikel
      </button>
    </div>
  `);

  document.getElementById('artEmoji').addEventListener('input', (e) => {
    const fallbackEmoji = document.getElementById('artFallbackEmoji');
    if (fallbackEmoji) fallbackEmoji.innerText = e.target.value || '🔬';
  });
}

function simpanArtikel(id) {
  const judul = document.getElementById('artJudul').value.trim();
  const kategori = document.getElementById('artKategori').value.trim();
  const emoji = document.getElementById('artEmoji').value.trim() || '🔬';
  const image = document.getElementById('artBase64Data').value;
  const excerpt = document.getElementById('artExcerpt').value.trim();
  const konten = document.getElementById('artKonten').value;

  if (!judul || !kategori || !excerpt || !konten) {
    showToast('❌ Mohon lengkapi seluruh field wajib!', true);
    return;
  }

  const kesehatan = getData('kesehatan');
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  const formatter = new Intl.DateTimeFormat('id-ID', options);
  const parts = formatter.formatToParts(new Date());
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const year = parts.find(p => p.type === 'year').value;
  const paddedDay = day.padStart(2, '0');
  const tanggal = `${paddedDay} ${month} ${year}`;

  const GRADIENTS = [
    'linear-gradient(135deg, #1a2a3a, #0ea5e9)',
    'linear-gradient(135deg, #2a1a1a, #ef4444)',
    'linear-gradient(135deg, #1a1a3a, #6366f1)',
    'linear-gradient(135deg, #2a1a2a, #ec4899)',
    'linear-gradient(135deg, #1a3a2a, #10b981)',
    'linear-gradient(135deg, #3a2a1a, #f59e0b)'
  ];

  if (id === null) {
    const newId = getNextId(kesehatan);
    const bg = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const newArticle = {
      id: newId,
      judul,
      kategori,
      emoji,
      bg,
      excerpt,
      konten,
      tanggal,
      image: image || undefined
    };
    kesehatan.push(newArticle);
    saveData('kesehatan', kesehatan);
    SyncManager.enqueue('kesehatan', 'upsert', newArticle);
    _bgPush();
    showToast('✅ Artikel baru berhasil ditambahkan!');
  } else {
    const idx = kesehatan.findIndex(x => x.id === id);
    if (idx >= 0) {
      kesehatan[idx].judul = judul;
      kesehatan[idx].kategori = kategori;
      kesehatan[idx].emoji = emoji;
      kesehatan[idx].excerpt = excerpt;
      kesehatan[idx].konten = konten;
      kesehatan[idx].image = image || undefined;
      saveData('kesehatan', kesehatan);
      SyncManager.enqueue('kesehatan', 'upsert', kesehatan[idx]);
      _bgPush();
      showToast('✅ Artikel berhasil diperbarui!');
    }
  }

  closeModal();
  renderKesehatan();
}

function hapusArtikel(id) {
  if (!confirm('Yakin ingin menghapus artikel kesehatan ini?')) return;

  const kesehatan = getData('kesehatan');
  const idx = kesehatan.findIndex(x => x.id === id);
  if (idx >= 0) {
    const removed = kesehatan.splice(idx, 1)[0];
    saveData('kesehatan', kesehatan);
    SyncManager.enqueue('kesehatan', 'delete', { id });
    _bgPush();
    showToast('🗑️ Artikel berhasil dihapus!');
    renderKesehatan();
  }
}

window.prosesUploadGambarArtikel = function(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 450;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      
      const preview = document.getElementById('artImagePreview');
      if (preview) {
        preview.src = base64;
        preview.style.display = 'block';
        
        const fallbackPrev = document.getElementById('artFallbackPreview');
        if (fallbackPrev) fallbackPrev.style.display = 'none';
      }
      document.getElementById('artBase64Data').value = base64;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

window.hapusGambarArtikelUploaded = function() {
  const preview = document.getElementById('artImagePreview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  const fallbackPrev = document.getElementById('artFallbackPreview');
  if (fallbackPrev) fallbackPrev.style.display = 'flex';
  
  document.getElementById('artBase64Data').value = '';
  document.getElementById('artImageInput').value = '';
};

// ============================================================
// LAPORAN PAGE
// ============================================================
function renderLaporan() {
  const obat = getData('obat');
  const log = getData('log');

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>📊 Laporan & Statistik</h1>
        <p>Analisis data stok obat dan aktivitas klinik secara visual</p>
      </div>
      <button class="btn btn-secondary" onclick="window.print()"><i class="ph ph-printer"></i> Cetak Laporan</button>
    </div>

    <div class="laporan-chart-grid">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-bar"></i> Stok Obat Saat Ini</div>
        </div>
        <div class="chart-container"><canvas id="lChartStok"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-line"></i> Transaksi Masuk vs Keluar</div>
        </div>
        <div class="chart-container"><canvas id="lChartTx"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title"><i class="ph-fill ph-table"></i> Laporan Stok Bulanan — Juni 2026</div>
        <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="ph ph-printer"></i> Print</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Nama Obat</th><th>Kategori</th><th>Stok Masuk</th><th>Stok Keluar</th><th>Sisa Stok</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${obat.map(o => `
              <tr>
                <td><b>${o.nama}</b></td>
                <td><span class="badge badge-info">${o.kategori}</span></td>
                <td style="color:#10B981;font-weight:600">+${o.masuk}</td>
                <td style="color:#F59E0B;font-weight:600">-${o.keluar}</td>
                <td><b>${o.stok}</b></td>
                <td>${o.stok === 0 ? '<span class="badge badge-danger">Habis</span>' : o.stok < o.minStok ? '<span class="badge badge-warning">Menipis</span>' : '<span class="badge badge-success">Aman</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ph-fill ph-clock-clockwise"></i> Riwayat Transaksi</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Obat</th><th>Jenis</th><th>Jumlah</th><th>Keterangan</th><th>Waktu</th></tr></thead>
          <tbody>
            ${[...log].reverse().map(l => `
              <tr>
                <td><b>${l.obat}</b></td>
                <td><span class="badge ${l.jenis==='masuk'?'badge-success':'badge-warning'}">${l.jenis==='masuk'?'↓ Masuk':'↑ Keluar'}</span></td>
                <td>${l.jumlah}</td>
                <td>${l.keterangan}</td>
                <td style="color:var(--text-muted);font-size:13px">${l.timestamp}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(() => renderLaporanCharts(obat), 100);
}

function renderLaporanCharts(obat) {
  const top8 = [...obat].sort((a,b) => b.stok - a.stok).slice(0, 8);
  const ctx1 = document.getElementById('lChartStok');
  if (ctx1) {
    charts.lStok = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: top8.map(o => o.nama.length > 18 ? o.nama.substring(0,15)+'...' : o.nama),
        datasets: [{
          label: 'Sisa Stok', data: top8.map(o => o.stok),
          backgroundColor: top8.map(o => o.stok === 0 ? '#EF4444' : o.stok < o.minStok ? '#F59E0B' : '#10B981'),
          borderRadius: 8, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } }
        }
      }
    });
  }

  const ctx2 = document.getElementById('lChartTx');
  if (ctx2) {
    charts.lTx = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: obat.slice(0,6).map(o => o.nama.length > 14 ? o.nama.substring(0,11)+'...' : o.nama),
        datasets: [
          { label: 'Masuk', data: obat.slice(0,6).map(o => o.masuk), backgroundColor: '#10B981', borderRadius: 6, borderSkipped: false },
          { label: 'Keluar', data: obat.slice(0,6).map(o => o.keluar), backgroundColor: '#F59E0B', borderRadius: 6, borderSkipped: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: '#94A3B8', usePointStyle: true } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } }
        }
      }
    });
  }
}

// ============================================================
// PENGATURAN PAGE
// ============================================================
function renderPengaturan() {
  const isDark = !document.body.classList.contains('light-mode');
  const meta = SyncManager.getMeta();
  const queue = SyncManager.getQueue();
  const syncStatus = SyncManager.getStatus();
  const statusColor = { ONLINE:'var(--secondary)', OFFLINE:'var(--text-muted)', SYNCING:'var(--primary)', ERROR:'var(--danger)' };
  const statusLabel = { ONLINE:'Tersinkronisasi ✅', OFFLINE:'Mode Lokal (Offline)', SYNCING:'Sedang Sinkronisasi...', ERROR:'Koneksi Gagal ❌' };

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>⚙️ Pengaturan Sistem</h1>
        <p>Konfigurasi klinik, sinkronisasi database Google Sheets, dan manajemen data</p>
      </div>
    </div>

    <!-- PROFIL KLINIK -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-hospital"></i> Profil Klinik / Lapas</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Nama Fasilitas Kesehatan</label>
          <input class="form-control" id="kNama" value="Klinik Pratama Lapas Kelas I Palembang" />
        </div>
        <div class="form-group">
          <label>No. Telepon</label>
          <input class="form-control" id="kTelp" value="(0711) 123-4567" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Alamat Lengkap</label>
          <input class="form-control" id="kAlamat" value="Jl. Merdeka No. 123, Palembang, Sumatera Selatan" />
        </div>
        <div class="form-group">
          <label>Unit Pelaksana Teknis (UPT)</label>
          <input class="form-control" id="kUPT" value="Lapas Kelas I Palembang — Ditjenpas Kemenimipas" />
        </div>
      </div>
      <button class="btn btn-primary" onclick="showToast('✅ Profil klinik berhasil disimpan!')"><i class="ph ph-floppy-disk"></i> Simpan Profil</button>
    </div>

    <!-- INTEGRASI GOOGLE SHEETS -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-google-logo"></i> Database — Integrasi Google Sheets</h3>

      <!-- Status sinkronisasi ringkas -->
      <div class="sync-meta-grid">
        <div class="sync-meta-card">
          <div class="smv" style="color:${statusColor[syncStatus]}">${statusLabel[syncStatus]}</div>
          <div class="sml">Status Koneksi</div>
        </div>
        <div class="sync-meta-card">
          <div class="smv">${queue.length}</div>
          <div class="sml">Perubahan dalam Antrian</div>
        </div>
        <div class="sync-meta-card">
          <div class="smv">${meta.lastPush ? new Date(meta.lastPush).toLocaleString('id-ID') : '—'}</div>
          <div class="sml">Terakhir Push ke Sheets</div>
        </div>
        <div class="sync-meta-card">
          <div class="smv">${meta.lastPull ? new Date(meta.lastPull).toLocaleString('id-ID') : '—'}</div>
          <div class="sml">Terakhir Pull dari Sheets</div>
        </div>
      </div>

      <div class="form-group">
        <label>URL Google Apps Script (Web App Deployment)</label>
        <input class="form-control" id="gasUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${localStorage.getItem('ios_gas_url') || ''}" />
        <p style="font-size:12px;color:var(--text-muted);margin-top:6px">Paste URL dari hasil deployment Google Apps Script Anda. Lihat template di bawah.</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-primary" onclick="simpanGasUrl()"><i class="ph ph-floppy-disk"></i> Simpan URL</button>
        <button class="btn btn-secondary" onclick="testKoneksi()"><i class="ph ph-wifi-high"></i> Test Koneksi</button>
        <button class="btn btn-success" onclick="handleSyncPull()"><i class="ph ph-cloud-arrow-down"></i> Pull dari Sheets</button>
        <button class="btn btn-primary" onclick="handleSyncPush()" style="background:linear-gradient(135deg,#10B981,#0EA5E9)"><i class="ph ph-cloud-arrow-up"></i> Push ke Sheets ${queue.length > 0 ? '('+queue.length+' antrian)' : ''}</button>
      </div>

      <!-- Log Sinkronisasi -->
      <label style="font-size:13px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:8px">
        <i class="ph ph-clock-clockwise"></i> Riwayat Sinkronisasi
      </label>
      <div class="sync-log-panel" id="syncLogPanel">
        ${renderSyncLog()}
      </div>
    </div>

    <!-- APPS SCRIPT TEMPLATE -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-code"></i> Google Apps Script — Template Instalasi</h3>
      <div class="alert-strip info" style="margin-bottom:14px">
        <i class="ph-fill ph-info"></i>
        Salin kode di bawah, buka <b>script.google.com</b>, tempel ke editor, hubungkan ke Spreadsheet Anda (Sheet: Obat, Pegawai, Log), lalu <b>Deploy &rarr; Web App</b>.
      </div>
      <div class="gas-template-box" id="gasTemplateBox">${SyncManager.GAS_TEMPLATE.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <button class="btn btn-secondary" style="margin-top:12px" onclick="salinGasTemplate()">
        <i class="ph ph-copy"></i> Salin Kode Apps Script
      </button>
    </div>

    <!-- TAMPILAN -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-palette"></i> Tampilan</h3>
      <div class="toggle-switch">
        <div>
          <div class="toggle-label">Mode Gelap</div>
          <div class="toggle-desc">Tema gelap lebih nyaman untuk penggunaan malam hari</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="darkCheck" ${isDark ? 'checked' : ''} onchange="toggleDark()" />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>

    <!-- MANAJEMEN DATA -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-database"></i> Manajemen Data Lokal</h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="pushSemuaData()" style="background:linear-gradient(135deg,#10B981,#0ea5e9)"><i class="ph ph-cloud-arrow-up"></i> Upload Semua Data ke Sheets</button>
        <button class="btn btn-secondary" onclick="exportData()"><i class="ph ph-export"></i> Export Data JSON</button>
        <button class="btn btn-danger" onclick="resetData()"><i class="ph ph-trash"></i> Reset ke Data Awal</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:12px">⚠️ Reset akan menghapus semua perubahan dan mengembalikan data ke kondisi data dummy awal. Antrian sinkronisasi juga akan dibersihkan.</p>
    </div>

    <!-- MANAJEMEN AKUN ADMIN -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-users"></i> Manajemen Akun Admin</h3>
      <div id="accountList">${renderAccountList()}</div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" onclick="showFormAkun(null)"><i class="ph ph-user-plus"></i> Tambah Akun Baru</button>
      </div>
    </div>

    <!-- TENTANG -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-info"></i> Tentang Aplikasi</h3>
      <p style="font-size:14px;color:var(--text-muted);line-height:2">
        <b style="color:var(--primary);font-size:22px">IOS</b> — Informasi Obat dan Kesehatan Pemasyarakatan<br>
        Sistem Informasi Digital Klinik Lapas / Rutan<br>
        Kementerian Imigrasi dan Pemasyarakatan — Ditjenpas<br><br>
        <span style="color:var(--secondary)">Versi 2.0.0</span> &nbsp;|&nbsp; Juni 2026 &nbsp;|&nbsp;
        HTML · CSS · JavaScript · Google Sheets API<br>
        <span style="font-size:12px;color:var(--text-dim)">
          Pustaka: SyncManager v${SyncManager.CONFIG.VERSION} (Offline-First · Auto-Sync)
        </span>
      </p>
    </div>
  `;
}

function renderAccountList() {
  const accounts = JSON.parse(localStorage.getItem('ios_accounts') || '[]');
  if (accounts.length === 0) return '<p style="color:var(--text-muted);font-size:13px">Belum ada akun.</p>';

  return `
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
      ${accounts.map(a => `
        <div style="display:flex;align-items:center;gap:14px;background:var(--bg-3);border:1px solid var(--border);border-radius:10px;padding:12px 16px">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:16px;flex-shrink:0">
            ${a.nama.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${a.nama}</div>
            <div style="font-size:12px;color:var(--text-muted)">@${a.username} &middot; ${a.role}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" style="padding:8px 12px;font-size:12px" onclick="showFormAkun(${a.id})"><i class="ph ph-pencil-simple"></i> Edit</button>
            ${accounts.length > 1 ? `<button class="btn btn-danger" style="padding:8px 12px;font-size:12px" onclick="hapusAkun(${a.id})"><i class="ph ph-trash"></i></button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function showFormAkun(id) {
  const accounts = JSON.parse(localStorage.getItem('ios_accounts') || '[]');
  const a = id ? accounts.find(x => x.id === id) : null;
  const isEdit = !!a;

  openModal(isEdit ? 'Edit Akun Admin' : 'Tambah Akun Admin Baru', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Nama Lengkap</label>
        <input type="text" class="form-control" id="akNama" value="${isEdit ? a.nama : ''}" placeholder="Nama tampilan..." required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Username / ID Login</label>
          <input type="text" class="form-control" id="akUsername" value="${isEdit ? a.username : ''}" placeholder="username..." autocomplete="off" required />
        </div>
        <div class="form-group">
          <label>Role / Jabatan</label>
          <input type="text" class="form-control" id="akRole" value="${isEdit ? a.role : 'Admin'}" placeholder="Super Admin / Admin..." />
        </div>
      </div>
      <div class="form-group">
        <label>${isEdit ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}</label>
        <div style="position:relative">
          <input type="password" class="form-control" id="akPassword" placeholder="${isEdit ? 'Isi untuk mengganti password...' : 'Minimal 6 karakter...'}" autocomplete="new-password" style="padding-right:44px" />
          <button type="button" onclick="toggleAkunPasswordVis()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px">
            <i class="ph ph-eye" id="akPwEyeIcon"></i>
          </button>
        </div>
      </div>
      <button class="btn btn-primary" onclick="simpanAkun(${isEdit ? a.id : 'null'})" style="width:100%;margin-top:4px">
        <i class="ph ph-floppy-disk"></i> ${isEdit ? 'Simpan Perubahan' : 'Buat Akun'}
      </button>
    </div>
  `);
}

function toggleAkunPasswordVis() {
  const input = document.getElementById('akPassword');
  const icon = document.getElementById('akPwEyeIcon');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  icon.className = input.type === 'password' ? 'ph ph-eye' : 'ph ph-eye-slash';
}

function simpanAkun(id) {
  console.log('[Account] simpanAkun called — id:', id, '| type:', typeof id);

  const nama     = (document.getElementById('akNama')?.value     || '').trim();
  const username = (document.getElementById('akUsername')?.value || '').trim();
  const role     = (document.getElementById('akRole')?.value     || 'Admin').trim();
  const password = (document.getElementById('akPassword')?.value || '').trim();

  // ── Validasi wajib ──
  if (!nama)              { showToast('❌ Nama lengkap wajib diisi!', true); return; }
  if (!username)          { showToast('❌ Username wajib diisi!', true); return; }
  if (username.length < 3){ showToast('❌ Username minimal 3 karakter!', true); return; }
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
    showToast('❌ Username hanya boleh huruf, angka, titik, dan underscore!', true);
    return;
  }

  try {
    // Gunakan getData helper dari data.js → konsisten dengan seluruh sistem
    let accounts = getData('accounts');
    if (!Array.isArray(accounts)) accounts = [];

    console.log('[Account] Local Account Count sebelum save:', accounts.length);

    // ── Cek username duplikat (case-insensitive, abaikan diri sendiri saat edit) ──
    const duplicate = accounts.find(a =>
      a.username.toLowerCase() === username.toLowerCase() &&
      String(a.id) !== String(id)
    );
    if (duplicate) {
      showToast('❌ Username sudah digunakan akun lain!', true);
      return;
    }

    // ── FIX: gunakan == null (menangkap null DAN undefined) ──
    const isNew = (id == null);
    console.log('[Account] Mode:', isNew ? 'TAMBAH BARU' : 'EDIT id=' + id);

    if (isNew) {
      // ── Tambah akun baru ──
      if (!password || password.length < 6) {
        showToast('❌ Password minimal 6 karakter!', true);
        return;
      }
      // FIX: gunakan getNextId() dari data.js untuk ID yang aman
      const newId   = getNextId(accounts);
      const today   = new Date().toISOString().slice(0, 10);
      const newAcc  = { id: newId, username, password, nama, role, createdAt: today };

      accounts.push(newAcc);
      saveData('accounts', accounts); // FIX: gunakan saveData helper

      console.log('[Account] Account Saved Successfully:', newAcc);
      console.log('[Account] Local Account Count sesudah save:', accounts.length);
      showToast('✅ Akun baru berhasil dibuat!');

    } else {
      // ── Edit akun ──
      // FIX: gunakan String() untuk bandingkan ID (hindari '1' !== 1 bug)
      const idx = accounts.findIndex(a => String(a.id) === String(id));
      if (idx < 0) {
        showToast('❌ Akun tidak ditemukan!', true);
        console.error('[Account] Edit gagal: tidak ada akun dengan id:', id);
        return;
      }

      accounts[idx].nama     = nama;
      accounts[idx].username = username;
      accounts[idx].role     = role;

      if (password) {
        if (password.length < 6) {
          showToast('❌ Password minimal 6 karakter!', true);
          return;
        }
        accounts[idx].password = password;
        // Update sesi jika mengedit akun sendiri
        if (currentAdminUser && String(currentAdminUser.id) === String(id)) {
          currentAdminUser = accounts[idx];
          sessionStorage.setItem('ios_admin_user', JSON.stringify(accounts[idx]));
        }
      }

      saveData('accounts', accounts);
      console.log('[Account] Account Updated Successfully:', accounts[idx]);
      showToast('✅ Akun berhasil diperbarui!');
    }

    closeModal();

    // ── Refresh daftar akun ──
    const listEl = document.getElementById('accountList');
    if (listEl) {
      listEl.innerHTML = renderAccountList();
    } else {
      // Fallback: re-render halaman pengaturan penuh jika element tidak ditemukan
      console.warn('[Account] accountList element tidak ditemukan — re-render pengaturan');
      renderPengaturan();
    }
    renderSidebarFooter();

  } catch (err) {
    console.error('[Account] Save Error:', err);
    showToast('❌ Gagal menyimpan akun: ' + err.message, true);
  }
}

function hapusAkun(id) {
  let accounts = getData('accounts');
  if (!Array.isArray(accounts)) accounts = [];

  if (accounts.length <= 1) {
    showToast('❌ Minimal harus ada 1 akun admin!', true);
    return;
  }
  if (!confirm('Yakin ingin menghapus akun ini?')) return;

  // FIX: gunakan String() untuk perbandingan ID
  const filtered = accounts.filter(a => String(a.id) !== String(id));
  saveData('accounts', filtered);
  console.log('[Account] Account deleted, remaining:', filtered.length);
  showToast('🗑️ Akun berhasil dihapus!');

  const listEl = document.getElementById('accountList');
  if (listEl) listEl.innerHTML = renderAccountList();
}


function renderSyncLog() {
  const log = SyncManager.getSyncLog();
  if (!log.length) return '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Belum ada riwayat sinkronisasi</div>';
  return log.map(l => `
    <div class="sync-log-item">
      <span class="sync-log-type ${l.type}">${l.type}</span>
      <span class="sync-log-ts">${l.ts}</span>
      <span class="sync-log-msg">${l.msg}</span>
    </div>
  `).join('');
}

async function handleSyncPull() {
  showToast('🔄 Mengambil data dari Google Sheets...');
  const r = await SyncManager.pull();
  if (r.ok) { showToast('✅ Data berhasil diperbarui dari Google Sheets!'); renderPengaturan(); navigate(currentPage); }
  else showToast('❌ Pull gagal: ' + r.reason, true);
}

async function handleSyncPush() {
  const q = SyncManager.getQueue();
  if (q.length === 0) { showToast('Tidak ada perubahan dalam antrian.'); return; }
  showToast('🔄 Mengunggah ' + q.length + ' perubahan ke Google Sheets...');
  const r = await SyncManager.push();
  if (r.ok) { showToast('✅ Push berhasil — ' + r.synced + ' item tersinkronisasi!'); renderPengaturan(); }
  else showToast('❌ Push gagal: ' + r.reason, true);
}

function salinGasTemplate() {
  navigator.clipboard.writeText(SyncManager.GAS_TEMPLATE.trim())
    .then(() => showToast('✅ Kode Apps Script disalin ke clipboard!'))
    .catch(() => showToast('Salin manual dari kotak kode di atas.', true));
}

function simpanGasUrl() {
  const url = document.getElementById('gasUrl').value.trim();
  localStorage.setItem('ios_gas_url', url);
  showToast('✅ URL Apps Script berhasil disimpan!');
}

function testKoneksi() {
  const url = localStorage.getItem('ios_gas_url');
  if (!url) { showToast('Masukkan URL Apps Script terlebih dahulu!', true); return; }
  showToast('🔄 Menguji koneksi...');
  fetch(url + '?action=ping')
    .then(r => r.json())
    .then(d => showToast('✅ Koneksi berhasil!'))
    .catch(() => showToast('Koneksi gagal — periksa URL atau CORS setting', true));
}

function exportData() {
  const data = { obat: getData('obat'), pegawai: getData('pegawai'), log: getData('log') };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ios-data-export-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  showToast('✅ Data berhasil diekspor!');
}

async function pushSemuaData() {
  if (!confirm('Apakah Anda ingin mengunggah seluruh data lokal saat ini ke Google Sheets? Ini akan menimpa/memperbarui data di Google Sheets dengan data dari aplikasi Anda.')) return;
  
  const obat = getData('obat');
  const pegawai = getData('pegawai');
  const log = getData('log');
  
  showToast('🔄 Mempersiapkan data untuk diunggah...');
  
  // Enqueue all
  obat.forEach(o => SyncManager.enqueue('obat', 'upsert', o));
  pegawai.forEach(p => SyncManager.enqueue('pegawai', 'upsert', p));
  log.forEach(l => SyncManager.enqueue('log', 'upsert', l));
  
  showToast('🔄 Mengunggah data ke Google Sheets...');
  const r = await SyncManager.push();
  if (r.ok) {
    showToast('✅ Semua data berhasil diunggah ke Google Sheets!');
    renderPengaturan();
  } else {
    showToast('❌ Gagal mengunggah data: ' + r.reason, true);
  }
}

function resetData() {
  if (!confirm('Yakin ingin mereset semua data ke data awal? Semua perubahan & antrian sinkronisasi akan hilang!')) return;
  localStorage.removeItem('ios_obat');
  localStorage.removeItem('ios_pegawai');
  localStorage.removeItem('ios_log');
  localStorage.removeItem('ios_kesehatan');
  localStorage.removeItem('ios_sync_queue');
  localStorage.removeItem('ios_sync_log');
  localStorage.removeItem('ios_sync_meta');
  initData();
  showToast('✅ Data & antrian sinkronisasi berhasil direset!');
  if (currentPage === 'pengaturan') renderPengaturan();
}

// Upload SEMUA data lokal ke Google Sheets (override cloud dengan data lokal)
async function pushSemuaData() {
  const url = localStorage.getItem('ios_gas_url');
  if (!url) {
    showToast('❌ URL Google Apps Script belum diatur di Pengaturan!', true);
    return;
  }

  if (!confirm('Upload semua data lokal ke Google Sheets?\nData di Sheets akan digantikan dengan data lokal saat ini.')) return;

  showToast('🔄 Mengupload semua data ke Google Sheets...');

  // Buat antrian dari semua data lokal
  const obat      = JSON.parse(localStorage.getItem('ios_obat')      || '[]');
  const pegawai   = JSON.parse(localStorage.getItem('ios_pegawai')   || '[]');
  const log       = JSON.parse(localStorage.getItem('ios_log')       || '[]');
  const kesehatan = JSON.parse(localStorage.getItem('ios_kesehatan') || '[]');

  const queue = [
    ...obat.map(d      => ({ table: 'obat',      action: 'upsert', payload: d })),
    ...pegawai.map(d   => ({ table: 'pegawai',   action: 'upsert', payload: d })),
    ...log.map(d       => ({ table: 'log',       action: 'upsert', payload: d })),
    ...kesehatan.map(d => ({ table: 'kesehatan', action: 'upsert', payload: d }))
  ];

  if (queue.length === 0) {
    showToast('⚠️ Tidak ada data untuk diupload.', true);
    return;
  }

  // Simpan antrian dan push
  localStorage.setItem('ios_sync_queue', JSON.stringify(queue));
  const r = await SyncManager.push();
  if (r.ok) {
    showToast(`✅ Berhasil! ${r.synced} data terupload ke Google Sheets!`);
    if (currentPage === 'pengaturan') renderPengaturan();
  } else {
    showToast('❌ Upload gagal: ' + r.reason, true);
  }
}
