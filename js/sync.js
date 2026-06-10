// ================================================================
//  SYNC.JS — Pustaka Sinkronisasi Database Google Sheets
//  IOS — Informasi Obat dan Kesehatan
//  Klinik Pratama Kelas I Palembang / Klinik Lapas & Rutan
//
//  Arsitektur: Offline-First
//  Strategi  : Data selalu ditulis ke localStorage terlebih dahulu.
//              Sinkronisasi ke Google Sheets dilakukan di latar belakang
//              secara otomatis (auto-sync tiap 60 detik) atau manual.
//
//  Status    : ONLINE | OFFLINE | SYNCING | ERROR
// ================================================================

const SyncManager = (() => {

  // ── Konfigurasi ────────────────────────────────────────────────
  const CONFIG = {
    GAS_URL_KEY   : 'ios_gas_url',    // key localStorage untuk URL Apps Script
    QUEUE_KEY     : 'ios_sync_queue', // antrian perubahan lokal yang belum diupload
    LOG_KEY       : 'ios_sync_log',   // riwayat sinkronisasi
    META_KEY      : 'ios_sync_meta',  // metadata (last sync, version)
    AUTO_INTERVAL : 60_000,           // interval auto-sync (ms) — 60 detik
    MAX_RETRIES   : 3,                // maksimum percobaan ulang jika gagal
    MAX_LOG       : 50,               // maksimum entri log yang disimpan
    VERSION       : '1.0.0',
  };

  // ── State Internal ─────────────────────────────────────────────
  let _status    = 'OFFLINE';   // ONLINE | OFFLINE | SYNCING | ERROR
  let _timer     = null;        // referensi auto-sync timer
  let _listeners = [];          // callback status change

  // ── Helpers ────────────────────────────────────────────────────
  function _getGasUrl() {
    return localStorage.getItem(CONFIG.GAS_URL_KEY) || '';
  }

  function _getQueue() {
    try { return JSON.parse(localStorage.getItem(CONFIG.QUEUE_KEY) || '[]'); }
    catch { return []; }
  }

  function _saveQueue(q) {
    localStorage.setItem(CONFIG.QUEUE_KEY, JSON.stringify(q));
  }

  function _getMeta() {
    try { return JSON.parse(localStorage.getItem(CONFIG.META_KEY) || '{}'); }
    catch { return {}; }
  }

  function _saveMeta(meta) {
    localStorage.setItem(CONFIG.META_KEY, JSON.stringify(meta));
  }

  function _getSyncLog() {
    try { return JSON.parse(localStorage.getItem(CONFIG.LOG_KEY) || '[]'); }
    catch { return []; }
  }

  function _addLog(type, msg, detail = '') {
    const log = _getSyncLog();
    log.unshift({
      id: Date.now(),
      type,             // 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
      msg,
      detail,
      ts: new Date().toLocaleString('id-ID')
    });
    if (log.length > CONFIG.MAX_LOG) log.length = CONFIG.MAX_LOG;
    localStorage.setItem(CONFIG.LOG_KEY, JSON.stringify(log));
  }

  function _setStatus(s) {
    _status = s;
    _listeners.forEach(cb => { try { cb(s); } catch {} });
    _updateStatusUI(s);
  }

  // ── Update Indikator Status di UI ──────────────────────────────
  function _updateStatusUI(status) {
    const el = document.getElementById('syncStatusBtn');
    if (!el) return;

    const icons = {
      ONLINE  : 'ph-fill ph-cloud-check',
      OFFLINE : 'ph-fill ph-cloud-slash',
      SYNCING : 'ph ph-cloud-arrow-up sync-spin',
      ERROR   : 'ph-fill ph-cloud-warning',
    };
    const colors = {
      ONLINE  : 'var(--secondary)',
      OFFLINE : 'var(--text-muted)',
      SYNCING : 'var(--primary)',
      ERROR   : 'var(--danger)',
    };
    const labels = {
      ONLINE  : 'Tersinkronisasi',
      OFFLINE : 'Mode Offline',
      SYNCING : 'Menyinkronkan...',
      ERROR   : 'Gagal Sinkron',
    };

    const q = _getQueue();
    const qBadge = document.getElementById('syncQueueBadge');
    if (qBadge) {
      qBadge.textContent = q.length;
      qBadge.style.display = q.length > 0 ? 'flex' : 'none';
    }

    el.innerHTML = `
      <i class="${icons[status] || icons.OFFLINE}" style="color:${colors[status]};font-size:18px"></i>
      <span class="sync-label">${labels[status]}</span>
    `;
    el.title = `Status Sinkronisasi: ${labels[status]}${q.length > 0 ? ` (${q.length} antrian)` : ''}`;
  }

  // ── Tambah ke Antrian Sinkronisasi ─────────────────────────────
  /**
   * Panggil ini setiap kali ada perubahan data lokal.
   * @param {string} table   - 'obat' | 'pegawai' | 'log'
   * @param {string} action  - 'upsert' | 'delete'
   * @param {object} payload - data yang berubah
   */
  function enqueue(table, action, payload) {
    const q = _getQueue();
    // Jika sudah ada entri upsert untuk ID yang sama di antrian, timpa (de-dup)
    if (action === 'upsert') {
      const idx = q.findIndex(e => e.table === table && e.action === 'upsert' && String(e.payload.id) === String(payload.id));
      if (idx >= 0) {
        q[idx].payload = payload;
        q[idx].ts = Date.now();
        console.log(`[IOS Sync] ENQUEUE UPDATE: table=${table}, id=${payload.id} (deduplicated in queue)`);
      } else {
        q.push({ table, action, payload, ts: Date.now(), retries: 0 });
        console.log(`[IOS Sync] ENQUEUE ADD: table=${table}, action=${action}, id=${payload.id}, queue size=${q.length}`);
      }
    } else {
      q.push({ table, action, payload, ts: Date.now(), retries: 0 });
      console.log(`[IOS Sync] ENQUEUE DELETE: table=${table}, id=${payload.id}, queue size=${q.length}`);
    }
    _saveQueue(q);
    _updateStatusUI(_status === 'ONLINE' ? 'ONLINE' : 'OFFLINE');

    // Coba push segera jika online
    if (_status === 'ONLINE' || _getGasUrl()) {
      setTimeout(() => push(), 500);
    }
  }

  // ── Helper: Abstract API Call (Natif GAS atau JSONP) ──────────────
  function apiCall(action, payload = null) {
    return new Promise((resolve, reject) => {
      // 1. Jalur NATIVE Google Apps Script
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        if (action === 'ping') {
           resolve({ status: 'ok', ts: new Date().toISOString() });
        } else if (action === 'pull') {
           google.script.run.withSuccessHandler(res => resolve(res)).withFailureHandler(err => reject(err)).pullData();
        } else if (action === 'push') {
           google.script.run.withSuccessHandler(res => resolve({status:'ok', processed: payload.length})).withFailureHandler(err => reject(err)).processQueue(payload);
        }
        return;
      }

      // 2. Jalur JSONP (Localhost / Netlify)
      const url = _getGasUrl();
      if (!url) return reject(new Error('no_url'));

      const cbName = '_ios_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let timer;

      window[cbName] = (data) => {
        clearTimeout(timer);
        script.remove();
        delete window[cbName];
        resolve(data);
      };

      timer = setTimeout(() => {
        script.remove();
        delete window[cbName];
        reject(new Error('Request timeout'));
      }, 15000);

      const sep = url.includes('?') ? '&' : '?';
      let fullUrl = url + sep + 'callback=' + cbName + '&action=' + action;
      if (payload) fullUrl += '&payload=' + encodeURIComponent(JSON.stringify({action:'push', queue: payload}));

      script.src = fullUrl;
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        delete window[cbName];
        reject(new Error('Network error'));
      };
      document.body.appendChild(script);
    });
  }

  // ── PUSH — Unggah Antrian ke Google Sheets ─────────────────────
  async function push() {
    const isNative = (typeof google !== 'undefined' && google.script);
    if (!_getGasUrl() && !isNative) {
      _setStatus('OFFLINE');
      console.warn('[IOS Sync] PUSH SKIP: tidak ada URL GAS terdaftar.');
      return { ok: false, reason: 'no_url' };
    }

    const q = _getQueue();
    if (q.length === 0) {
      console.log('[IOS Sync] PUSH SKIP: antrian kosong, tidak ada yang di-push.');
      return { ok: true, synced: 0 };
    }

    console.log(`[IOS Sync] PUSH START: mengunggah ${q.length} item ke Google Sheets...`);
    _setStatus('SYNCING');
    _addLog('INFO', `Mulai push ${q.length} perubahan ke Google Sheets`);

    try {
      const data = await apiCall('push', q);

      if (data.status === 'ok') {
        _saveQueue([]); // kosongkan antrian setelah konfirmasi server
        const meta = _getMeta();
        meta.lastPush = new Date().toISOString();
        meta.pushCount = (meta.pushCount || 0) + 1;
        _saveMeta(meta);
        _setStatus('ONLINE');
        console.log(`[IOS Sync] PUSH SUCCESS: ${q.length} item berhasil diunggah ke Sheets.`, data);
        if (q.some(e => e.table === 'log')) {
          console.log('[DEBUG] Transaction Saved To Sheets');
        }
        console.log('[DEBUG] Transaction Sync Success');
        _addLog('SUCCESS', `Push berhasil — ${q.length} item tersinkronisasi`, JSON.stringify(data));
        return { ok: true, synced: q.length };
      } else {
        throw new Error(data.error || 'Response tidak valid dari server');
      }
    } catch (err) {
      // Tandai retries — buang yang sudah melebihi batas
      const q2 = _getQueue().map(e => ({ ...e, retries: (e.retries || 0) + 1 }));
      const failed = q2.filter(e => e.retries >= CONFIG.MAX_RETRIES);
      const pending = q2.filter(e => e.retries < CONFIG.MAX_RETRIES);
      _saveQueue(pending);
      _setStatus('ERROR');
      console.error(`[IOS Sync] PUSH FAILED: ${err.message}. ${failed.length} item dibuang, ${pending.length} item akan dicoba ulang.`);
      _addLog('ERROR', `Push gagal: ${err.message}`, `${failed.length} item dibuang setelah ${CONFIG.MAX_RETRIES}x retry`);
      return { ok: false, reason: err.message };
    }
  }

  // ── PULL — Ambil & MERGE Data dari Google Sheets ───────────────
  // PENTING: Pull TIDAK PERNAH menghapus data lokal secara langsung.
  // Strategi: merge remote (Sheets) dengan local (localStorage).
  // Data lokal yang lebih baru (ada di queue pending) dipertahankan.
  async function pull() {
    const isNative = (typeof google !== 'undefined' && google.script);
    if (!_getGasUrl() && !isNative) {
      _setStatus('OFFLINE');
      console.warn('[IOS Sync] PULL SKIP: tidak ada URL GAS terdaftar.');
      return { ok: false, reason: 'no_url' };
    }

    _setStatus('SYNCING');
    console.log('[IOS Sync] PULL START: mengambil data dari Google Sheets...');
    _addLog('INFO', 'Mengambil data terbaru dari Google Sheets...');

    try {
      const remote = await apiCall('pull');

      if (remote.status !== 'ok') throw new Error(remote.error || 'Pull gagal');

      // Ambil ID item yang ada di antrian pending (belum di-push)
      // Item ini JANGAN ditimpa oleh remote data
      const pendingQueue = _getQueue();
      const pendingIds = new Set(
        pendingQueue
          .filter(e => e.action === 'upsert')
          .map(e => String(e.payload.id))
      );
      const deletedIds = new Set(
        pendingQueue
          .filter(e => e.action === 'delete')
          .map(e => String(e.payload.id))
      );

      // Fungsi merge per tabel
      function mergeTable(key, remoteArr) {
        if (!remoteArr || !Array.isArray(remoteArr)) return;
        
        const localArr = (() => {
          try { return JSON.parse(localStorage.getItem('ios_' + key) || '[]'); }
          catch { return []; }
        })();

        const localMap = new Map(localArr.map(item => [String(item.id), item]));
        const remoteMap = new Map(remoteArr.map(item => [String(item.id), item]));

        const merged = [];
        const remoteCount = remoteArr.length;

        // Tambahkan semua item remote, kecuali yang ada di pending queue
        remoteArr.forEach(remoteItem => {
          const id = String(remoteItem.id);
          if (deletedIds.has(id)) {
            // Item ini sedang di-queue untuk dihapus → skip dari remote
            console.log(`[IOS Sync] MERGE [${key}]: item id=${id} SKIP (ada di delete queue)`);
            return;
          }
          if (pendingIds.has(id)) {
            // Item ini di-queue untuk di-update → pakai versi lokal yang lebih baru
            const localItem = localMap.get(id);
            console.log(`[IOS Sync] MERGE [${key}]: item id=${id} PAKAI LOKAL (ada di pending queue)`);
            merged.push(localItem || remoteItem);
          } else {
            merged.push(remoteItem);
          }
        });

        // Tambahkan item lokal yang TIDAK ada di remote (baru dibuat, belum di-push)
        localArr.forEach(localItem => {
          const id = String(localItem.id);
          // Cek apakah item tidak ada di remote dan tidak sedang dalam antrean hapus
          if (!remoteMap.has(id) && !deletedIds.has(id)) {
            // Jika item lokal tersebut ada di antrean "pending push", berarti ini data baru
            if (pendingIds.has(id)) {
              console.log(`[IOS Sync] MERGE [${key}]: item id=${id} DITAMBAHKAN dari lokal (pending push)`);
              merged.push(localItem);
            } else {
              // Jika tidak ada di pending push, berarti data ini adalah DUMMY atau sudah dihapus di Sheets
              console.log(`[IOS Sync] MERGE [${key}]: item id=${id} DIHAPUS dari lokal (tidak ada di Sheets)`);
            }
          }
        });

        console.log(`[IOS Sync] MERGE [${key}]: remote=${remoteCount}, lokal=${localArr.length}, hasil=${merged.length}`);
        localStorage.setItem('ios_' + key, JSON.stringify(merged));
      }

      // Jalankan merge untuk semua tabel
      mergeTable('obat',      remote.obat);
      mergeTable('pegawai',   remote.pegawai);
      mergeTable('log',       remote.log);
      mergeTable('kesehatan', remote.kesehatan);
      mergeTable('profil',    remote.profil);

      const meta = _getMeta();
      meta.lastPull = new Date().toISOString();
      meta.pullCount = (meta.pullCount || 0) + 1;
      _saveMeta(meta);

      _setStatus('ONLINE');
      console.log('[IOS Sync] PULL SUCCESS: data berhasil di-merge dari Google Sheets.');
      console.log('[DEBUG] Transaction Sync Success');
      _addLog('SUCCESS', 'Pull & merge berhasil — data lokal diperbarui dengan aman dari Google Sheets');
      return { ok: true, data: remote };
    } catch (err) {
      _setStatus('ERROR');
      console.error(`[IOS Sync] PULL FAILED: ${err.message}`);
      _addLog('ERROR', `Pull gagal: ${err.message}`);
      return { ok: false, reason: err.message };
    }
  }

  // ── Ping — Cek Koneksi ─────────────────────────────────────────
  async function ping() {
    const isNative = (typeof google !== 'undefined' && google.script);
    if (!_getGasUrl() && !isNative) { _setStatus('OFFLINE'); return false; }
    try {
      const data = await apiCall('ping');
      const ok   = data.status === 'ok';
      _setStatus(ok ? 'ONLINE' : 'ERROR');
      return ok;
    } catch {
      _setStatus('ERROR');
      return false;
    }
  }

  // ── Auto-Sync ──────────────────────────────────────────────────
  function startAutoSync() {
    stopAutoSync();
    _timer = setInterval(async () => {
      const isNative = (typeof google !== 'undefined' && google.script);
      if (!_getGasUrl() && !isNative) return;
      const q = _getQueue();
      if (q.length > 0) await push();
      else await ping();
    }, CONFIG.AUTO_INTERVAL);
    _addLog('INFO', `Auto-sync diaktifkan (interval: ${CONFIG.AUTO_INTERVAL / 1000}s)`);
  }

  function stopAutoSync() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  // ── Sync Penuh (Pull → Push) ───────────────────────────────────
  async function syncAll() {
    const pullResult = await pull();
    if (pullResult.ok) await push();
    return pullResult;
  }

  // ── Inisialisasi ───────────────────────────────────────────────
  function init() {
    const isNative = (typeof google !== 'undefined' && google.script);
    const url = _getGasUrl();
    _setStatus((url || isNative) ? 'OFFLINE' : 'OFFLINE'); // akan di-update setelah ping
    if (url || isNative) {
      setTimeout(async () => {
        await ping();
        startAutoSync();
      }, 2000);
    }
    _addLog('INFO', `SyncManager v${CONFIG.VERSION} diinisialisasi`, (isNative ? 'Mode NATIVE Apps Script' : (url ? 'URL: ' + url.substring(0, 40) + '...' : 'Belum ada URL terdaftar')));
  }

  // ── Subscribe Status ───────────────────────────────────────────
  function onStatusChange(cb) {
    _listeners.push(cb);
  }

  // ── Getter ─────────────────────────────────────────────────────
  function getStatus()   { return _status; }
  function getSyncLog()  { return _getSyncLog(); }
  function getMeta()     { return _getMeta(); }
  function getQueue()    { return _getQueue(); }

  // ── Google Apps Script Template ────────────────────────────────
  const GAS_TEMPLATE = `
// =============================================================
// Google Apps Script — IOS Database Bridge
// Salin seluruh kode ini ke Google Apps Script (script.google.com)
// Hubungkan ke Google Spreadsheet Anda, lalu Deploy sebagai Web App.
//
// Sheet yang diperlukan:
//   - Sheet bernama "Obat"
//   - Sheet bernama "Pegawai"
//   - Sheet bernama "Log"
//   - Sheet bernama "Kesehatan"
// =============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  const action   = e.parameter.action || '';
  const callback = e.parameter.callback || '';
  let result;

  // Jika dibuka langsung tanpa parameter (sebagai halaman web publik)
  if (!action && !callback) {
    try {
      return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('IOS Klinik Pratama Palembang')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch(err) {
      return ContentService.createTextOutput("File Index.html belum dibuat di project Apps Script Anda.");
    }
  }

  if (action === 'ping') {
    result = { status: 'ok', ts: new Date().toISOString() };
  } else if (action === 'pull') {
    result = pullData();
  } else if (action === 'push') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload || '{}'));
      processQueue(payload.queue || []);
      result = { status: 'ok', processed: (payload.queue || []).length };
    } catch (err) {
      result = { status: 'error', error: err.message };
    }
  } else {
    result = { status: 'error', error: 'Unknown action' };
  }

  // JSONP support
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'push') {
      processQueue(body.queue || []);
      return json({ status: 'ok', processed: (body.queue || []).length });
    }
    return json({ status: 'error', error: 'Unknown action' });
  } catch (err) {
    return json({ status: 'error', error: err.message });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pullData() {
  return {
    status  : 'ok',
    obat    : sheetToJson('Obat'),
    pegawai : sheetToJson('Pegawai'),
    log     : sheetToJson('Log'),
    kesehatan: sheetToJson('Kesehatan'),
  };
}

function sheetToJson(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  // Sheet kosong atau hanya ada header
  if (lastRow < 1 || lastCol < 1) return [];
  const allValues = sh.getDataRange().getValues();
  if (allValues.length < 2) return []; // tidak ada data row
  const headers = allValues[0];
  const rows = allValues.slice(1);
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function processQueue(queue) {
  queue.forEach(({ table, action, payload }) => {
    try {
      const name = capitalize(table);
      const sh   = SS.getSheetByName(name) || SS.insertSheet(name);
      if (action === 'upsert') upsertRow(sh, payload);
      if (action === 'delete') deleteRow(sh, payload.id);
    } catch (itemErr) {
      // Log error per-item tapi jangan hentikan item lain
      console.error('processQueue error on item:', JSON.stringify({ table, action, payload }), itemErr.message);
    }
  });
}

function upsertRow(sh, data) {
  let lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();

  // Sheet benar-benar kosong (belum ada baris satupun)
  if (lastCol < 1 || lastRow < 1) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    sh.getRange(1, 1, 1, keys.length).setValues([keys]);   // buat header
    sh.getRange(2, 1, 1, values.length).setValues([values]); // tulis data row
    return;
  }

  // Baca header dari baris 1
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // Cari apakah ada key baru di data yang belum ada di header
  let headerChanged = false;
  Object.keys(data).forEach(function(key) {
    if (headers.indexOf(key) < 0) {
      headers.push(key);
      headerChanged = true;
    }
  });

  if (headerChanged) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    lastCol = headers.length;
  }

  // Cek apakah kolom id ada di header
  const idCol = headers.indexOf('id');

  if (idCol < 0 || !headers[0]) {
    // Header belum ada field 'id' — tulis ulang header lalu append
    const keys   = Object.keys(data);
    const values = Object.values(data);
    sh.getRange(1, 1, 1, keys.length).setValues([keys]);
    sh.appendRow(values);
    return;
  }

  // Cari baris yang sudah ada dengan ID yang sama
  const allData = sh.getDataRange().getValues();
  const rowIdx  = allData.findIndex((r, i) => i > 0 && String(r[idCol]) === String(data.id));
  const values  = headers.map(h => data[h] !== undefined ? data[h] : '');

  if (rowIdx >= 0) {
    // Update baris yang ada
    sh.getRange(rowIdx + 1, 1, 1, values.length).setValues([values]);
  } else {
    // Tambah baris baru — pastikan kolom cocok dengan header
    const newRow = headers.map(h => data[h] !== undefined ? data[h] : '');
    sh.appendRow(newRow);
  }
}

function deleteRow(sh, id) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return; // sheet kosong

  const allData = sh.getDataRange().getValues();
  const headers = allData[0];
  const idCol   = headers.indexOf('id');
  if (idCol < 0) return;

  for (let i = allData.length - 1; i >= 1; i--) {
    if (String(allData[i][idCol]) === String(id)) {
      sh.deleteRow(i + 1);
      break;
    }
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
`;

  // ── Public API ─────────────────────────────────────────────────
  return {
    init,
    push,
    pull,
    ping,
    syncAll,
    enqueue,
    startAutoSync,
    stopAutoSync,
    onStatusChange,
    getStatus,
    getSyncLog,
    getMeta,
    getQueue,
    GAS_TEMPLATE,
    CONFIG,
  };
})();
