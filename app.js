// ============================================================
// APP.JS — Main Application Logic & Router
// IOS Informasi Obat dan Kesehatan
// ============================================================

let currentPage = 'dashboard';
let charts = {};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  initData();
  SyncManager.init();
  updateClock();
  setInterval(updateClock, 1000);
  navigate(location.hash.replace('#', '') || 'dashboard');
});

// Klik tombol sync — jika ada antrian push, jika tidak pull
async function handleSyncClick() {
  const q = SyncManager.getQueue();
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

// ---- ROUTER ----
function navigate(page) {
  currentPage = page || 'dashboard';
  location.hash = currentPage;

  // Destroy existing charts
  Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); });
  charts = {};

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + currentPage);
  if (navEl) navEl.classList.add('active');

  // Page titles
  const titles = {
    dashboard: 'Dashboard',
    obat: 'Manajemen Stok Obat',
    pegawai: 'Data Pegawai',
    kesehatan: 'Informasi Kesehatan',
    laporan: 'Laporan & Statistik',
    pengaturan: 'Pengaturan'
  };
  document.getElementById('page-title').textContent = titles[currentPage] || 'IOS';

  const container = document.getElementById('page-container');
  container.style.animation = 'none';
  container.offsetHeight;
  container.style.animation = '';

  const pages = {
    dashboard: renderDashboard,
    obat: renderObat,
    pegawai: renderPegawai,
    kesehatan: renderKesehatan,
    laporan: renderLaporan,
    pengaturan: renderPengaturan,
  };

  if (pages[currentPage]) pages[currentPage]();
  else container.innerHTML = '<div class="empty-state"><i class="ph ph-smiley-sad"></i><p>Halaman tidak ditemukan</p></div>';
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const m = document.getElementById('main-content');
  s.classList.toggle('collapsed');
  m.classList.toggle('expanded');
}

function toggleDark() {
  document.body.classList.toggle('light-mode');
  const icon = document.getElementById('darkIcon');
  icon.className = document.body.classList.contains('light-mode') ? 'ph-fill ph-sun' : 'ph-fill ph-moon';
}

function toggleNotif() {
  document.getElementById('notifDropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  const nb = document.querySelector('.notification-btn');
  const nd = document.getElementById('notifDropdown');
  if (nd && nb && !nb.contains(e.target) && !nd.contains(e.target)) {
    nd.classList.remove('open');
  }
});

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

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>👋 Selamat Datang, Admin!</h1>
        <p>Ringkasan aktivitas Klinik Pratama Kelas I Palembang hari ini</p>
      </div>
    </div>

    ${stokHabis > 0 ? `<div class="alert-strip danger"><i class="ph-fill ph-warning-circle"></i> <b>${stokHabis} obat</b> stok telah habis — segera lakukan pengadaan!</div>` : ''}
    ${stokMenipis > 0 ? `<div class="alert-strip warning"><i class="ph-fill ph-warning"></i> <b>${stokMenipis} obat</b> stok menipis — perlu perhatian segera</div>` : ''}

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

    <div class="dashboard-charts">
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-bar"></i> Stok Obat per Kategori</div>
        </div>
        <div class="chart-container">
          <canvas id="chartKategori"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="ph-fill ph-chart-pie"></i> Status Stok Obat</div>
        </div>
        <div class="chart-container">
          <canvas id="chartStatus"></canvas>
        </div>
      </div>
    </div>

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

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>💊 Manajemen Stok Obat</h1>
        <p>Kelola data stok obat harian — tambah, edit, dan catat transaksi masuk/keluar</p>
      </div>
      <button class="btn btn-primary" onclick="showFormTambahObat()"><i class="ph ph-plus"></i> Tambah Obat</button>
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
  `;
}

function renderTabelObat(obat) {
  if (!obat.length) return '<div class="empty-state"><i class="ph ph-pill"></i><p>Belum ada data obat</p></div>';
  return `
    <table>
      <thead>
        <tr>
          <th>No</th>
          <th>Nama Obat</th>
          <th>Kategori</th>
          <th>Satuan</th>
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
  const o = obatData || { nama:'', kategori:'', satuan:'', masuk:0, keluar:0, stok:0, minStok:20, expired:'', tanggal: new Date().toISOString().split('T')[0] };
  openModal(isEdit ? 'Edit Data Obat' : 'Tambah Obat Baru', `
    <div class="form-row">
      <div class="form-group">
        <label>Nama Obat</label>
        <input class="form-control" id="fNama" value="${o.nama}" placeholder="Contoh: Paracetamol 500mg" />
      </div>
      <div class="form-group">
        <label>Kategori</label>
        <select class="form-control" id="fKat">
          ${['Antibiotik','Analgesik','Vitamin','Antasida','Antidiabetik','Lambung','Antihistamin','Bronkodilator','Lainnya'].map(k =>
            `<option value="${k}" ${o.kategori===k?'selected':''}>${k}</option>`).join('')}
        </select>
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
    <div class="form-group">
      <label>Tanggal Expired</label>
      <input type="date" class="form-control" id="fExp" value="${o.expired}" />
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="simpanObat(${isEdit ? o.id : 'null'})">
      <i class="ph ph-floppy-disk"></i> ${isEdit ? 'Simpan Perubahan' : 'Tambah Obat'}
    </button>
  `);
}

function simpanObat(editId) {
  const nama = document.getElementById('fNama').value.trim();
  const kat = document.getElementById('fKat').value;
  const sat = document.getElementById('fSat').value;
  const minStok = parseInt(document.getElementById('fMinStok').value) || 0;
  const masuk = parseInt(document.getElementById('fMasuk').value) || 0;
  const keluar = parseInt(document.getElementById('fKeluar').value) || 0;
  const exp = document.getElementById('fExp').value;

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
    obat = obat.map(o => o.id === editId ? {...o, nama, kategori:kat, satuan:sat, minStok, masuk, keluar, stok, expired:exp} : o);
    savedObat = obat.find(o => o.id === editId);
    showToast('✅ Data obat berhasil diperbarui!');
  } else {
    savedObat = { id: getNextId(obat), nama, kategori:kat, satuan:sat, masuk, keluar, stok, minStok, expired:exp, tanggal: new Date().toISOString().split('T')[0] };
    obat.push(savedObat);
    showToast('✅ Obat baru berhasil ditambahkan!');
  }
  saveData('obat', obat);
  SyncManager.enqueue('obat', 'upsert', savedObat);
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
  showToast(`✅ Transaksi ${jenis} berhasil dicatat!`);
  renderObat();
}

// ============================================================
// PEGAWAI PAGE
// ============================================================
function renderPegawai() {
  const pegawai = getData('pegawai');
  const jabatanSet = [...new Set(pegawai.map(p => p.jabatan))];

  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>👨‍⚕️ Data Pegawai Klinik</h1>
        <p>Kelola informasi dokter, perawat, apoteker, dan admin klinik</p>
      </div>
      <button class="btn btn-primary" onclick="showFormTambahPegawai()"><i class="ph ph-user-plus"></i> Tambah Pegawai</button>
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
  return pegawai.map(p => {
    const color = jabatanColors[p.jabatan] || '#94A3B8';
    return `
      <div class="pegawai-card">
        <div class="pegawai-avatar" style="background: linear-gradient(135deg, ${color}, ${color}99)">${p.inisial}</div>
        <div class="pegawai-name">${p.nama}</div>
        <div class="pegawai-jabatan" style="color:${color}">${p.jabatan}</div>
        <div class="pegawai-detail"><i class="ph ph-stethoscope"></i> ${p.spesialisasi}</div>
        <div class="pegawai-detail"><i class="ph ph-calendar-blank"></i> ${p.jadwal}</div>
        <div class="pegawai-detail"><i class="ph ph-phone"></i> ${p.hp}</div>
        <span class="badge ${p.status === 'Aktif' ? 'badge-success' : 'badge-warning'}">${p.status === 'Aktif' ? '● Aktif' : '○ Izin'}</span>
        <div class="pegawai-actions">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="editPegawai(${p.id})" title="Edit"><i class="ph ph-pencil-simple"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="hapusPegawai(${p.id})" title="Hapus"><i class="ph ph-trash"></i></button>
        </div>
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
  const p = pegawaiData || { nama:'', jabatan:'Dokter Umum', spesialisasi:'', hp:'', email:'', jadwal:'', status:'Aktif', inisial:'' };
  openModal(isEdit ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru', `
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

function simpanPegawai(editId) {
  const nama = document.getElementById('pNama').value.trim();
  const inisial = document.getElementById('pInisial').value.trim().toUpperCase();
  const jabatan = document.getElementById('pJabatan').value;
  const spesialisasi = document.getElementById('pSpesialis').value.trim();
  const hp = document.getElementById('pHp').value.trim();
  const email = document.getElementById('pEmail').value.trim();
  const jadwal = document.getElementById('pJadwal').value.trim();
  const status = document.getElementById('pStatus').value;

  if (!nama || !inisial) { showToast('Nama dan inisial wajib diisi!', true); return; }

  let pegawai = getData('pegawai');
  let savedPegawai;
  if (editId) {
    pegawai = pegawai.map(p => p.id === editId ? {...p, nama, inisial, jabatan, spesialisasi, hp, email, jadwal, status} : p);
    savedPegawai = pegawai.find(p => p.id === editId);
    showToast('✅ Data pegawai berhasil diperbarui!');
  } else {
    savedPegawai = { id: getNextId(pegawai), nama, inisial, jabatan, spesialisasi, hp, email, jadwal, status };
    pegawai.push(savedPegawai);
    showToast('✅ Pegawai baru berhasil ditambahkan!');
  }
  saveData('pegawai', pegawai);
  SyncManager.enqueue('pegawai', 'upsert', savedPegawai);
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
  showToast('🗑️ Data pegawai berhasil dihapus!');
  renderPegawai();
}

// ============================================================
// KESEHATAN PAGE
// ============================================================
function renderKesehatan() {
  const kategoriSet = [...new Set(DUMMY_KESEHATAN.map(a => a.kategori))];
  document.getElementById('page-container').innerHTML = `
    <div class="page-header">
      <div>
        <h1>❤️ Informasi Kesehatan</h1>
        <p>Artikel tips kesehatan, panduan penyakit, dan informasi medis terkini</p>
      </div>
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
      ${renderKartuArtikel(DUMMY_KESEHATAN)}
    </div>
  `;
}

function renderKartuArtikel(data) {
  return data.map(a => `
    <div class="artikel-card" onclick="showArtikel(${a.id})">
      <div class="artikel-img" style="background:${a.bg}">${a.emoji}</div>
      <div class="artikel-body">
        <div class="artikel-category">${a.kategori}</div>
        <div class="artikel-title">${a.judul}</div>
        <div class="artikel-excerpt">${a.excerpt}</div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">${a.tanggal}</div>
      </div>
    </div>
  `).join('');
}

function filterArtikel() {
  const q = document.getElementById('searchArtikel').value.toLowerCase();
  const kat = document.getElementById('filterKatArtikel').value;
  let data = DUMMY_KESEHATAN;
  if (q) data = data.filter(a => a.judul.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q));
  if (kat) data = data.filter(a => a.kategori === kat);
  document.getElementById('artikelGrid').innerHTML = renderKartuArtikel(data);
}

function showArtikel(id) {
  const a = DUMMY_KESEHATAN.find(x => x.id === id);
  if (!a) return;
  openModal(a.judul, `
    <div style="background:${a.bg};border-radius:12px;padding:30px;text-align:center;font-size:48px;margin-bottom:16px">${a.emoji}</div>
    <span class="badge badge-info" style="margin-bottom:12px">${a.kategori}</span>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">📅 ${a.tanggal}</p>
    <p style="line-height:1.8;font-size:14px">${a.konten}</p>
  `);
}

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
          <input class="form-control" id="kNama" value="Klinik Pratama Kelas I Lapas Palembang" />
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
          <input class="form-control" id="kUPT" value="Lapas Kelas I Palembang — Ditjenpas Kemenkumham" />
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
        <button class="btn btn-secondary" onclick="exportData()"><i class="ph ph-export"></i> Export Data JSON</button>
        <button class="btn btn-danger" onclick="resetData()"><i class="ph ph-trash"></i> Reset ke Data Awal</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:12px">⚠️ Reset akan menghapus semua perubahan dan mengembalikan data ke kondisi data dummy awal. Antrian sinkronisasi juga akan dibersihkan.</p>
    </div>

    <!-- TENTANG -->
    <div class="settings-section">
      <h3><i class="ph-fill ph-info"></i> Tentang Aplikasi</h3>
      <p style="font-size:14px;color:var(--text-muted);line-height:2">
        <b style="color:var(--primary);font-size:22px">IOS</b> — Informasi Obat dan Kesehatan Pemasyarakatan<br>
        Sistem Informasi Digital Klinik Lapas / Rutan<br>
        Kementerian Hukum dan Hak Asasi Manusia — Ditjenpas<br><br>
        <span style="color:var(--secondary)">Versi 2.0.0</span> &nbsp;|&nbsp; Juni 2026 &nbsp;|&nbsp;
        HTML · CSS · JavaScript · Google Sheets API<br>
        <span style="font-size:12px;color:var(--text-dim)">
          Pustaka: SyncManager v${SyncManager.CONFIG.VERSION} (Offline-First · Auto-Sync)
        </span>
      </p>
    </div>
  `;
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

function resetData() {
  if (!confirm('Yakin ingin mereset semua data ke data awal? Semua perubahan & antrian sinkronisasi akan hilang!')) return;
  localStorage.removeItem('ios_obat');
  localStorage.removeItem('ios_pegawai');
  localStorage.removeItem('ios_log');
  localStorage.removeItem('ios_sync_queue');
  localStorage.removeItem('ios_sync_log');
  localStorage.removeItem('ios_sync_meta');
  initData();
  showToast('✅ Data & antrian sinkronisasi berhasil direset!');
  if (currentPage === 'pengaturan') renderPengaturan();
}
