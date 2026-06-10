// ================================================================
//  DATA.JS — Database Lokal IOS
//  Klinik Pratama Lapas Kelas I Palembang
//
//  Arsitektur  : Offline-First (localStorage + Google Sheets sync)
//  Konteks     : Kedokteran Pemasyarakatan
//                Data mencerminkan kebutuhan klinis nyata di
//                Lembaga Pemasyarakatan / Rumah Tahanan Negara.
// ================================================================

// ── Tabel Obat ────────────────────────────────────────────────────
// Kolom `controlled: true` → Obat Psikotropika/Narkotika/OAT yang
// memerlukan pencatatan ketat & tanda tangan petugas Lapas.
// Data rill obat dikelola melalui panel admin
const DUMMY_OBAT = [];

// ── Tabel Pegawai ─────────────────────────────────────────────────
// Data rill pegawai dikelola melalui panel admin
const DUMMY_PEGAWAI = [];

// ── Artikel Informasi Kesehatan Pemasyarakatan ────────────────────
// Topik disesuaikan dengan masalah kesehatan nyata di Lapas/Rutan:
// Scabies, TB, kesehatan jiwa, HIV/AIDS, sanitasi, dan NAPZA
const DUMMY_KESEHATAN = [
  {
    id: 1,
    judul: 'Penanggulangan Scabies (Kudis) di Blok Hunian',
    kategori: 'Dermatologi',
    emoji: '🔬',
    bg: 'linear-gradient(135deg, #1a2a3a, #0ea5e9)',
    excerpt: 'Scabies adalah infeksi kulit akibat tungau Sarcoptes scabiei yang sangat mudah menular melalui kontak fisik — penyakit paling umum di lingkungan Lapas/Rutan.',
    konten: 'GEJALA: Rasa gatal hebat (terutama malam hari), ruam merah/bintik-bintik, luka lecet di sela jari, pergelangan tangan, dan ketiak.\n\nPENATALAKSANAAN: 1) Oleskan Permethrin 5% krim ke seluruh permukaan kulit (kecuali wajah) sebelum tidur, diamkan 8–12 jam, lalu bilas. 2) Ulangi setelah 1 minggu. 3) SEMUA kontak serumah/seblok wajib diobati serentak. 4) Cuci dan jemur semua pakaian & alas tidur di bawah sinar matahari.\n\nPENCEGAHAN: Jaga kebersihan diri, ganti pakaian setiap hari, jangan berbagi handuk/pakaian, laporkan segera ke petugas klinik jika ada gejala.',
    tanggal: '04 Jun 2026'
  },
  {
    id: 2,
    judul: 'Protokol Penanganan TB Paru untuk Warga Binaan',
    kategori: 'Terapi OAT',
    emoji: '🫁',
    bg: 'linear-gradient(135deg, #2a1a1a, #ef4444)',
    excerpt: 'Tuberkulosis (TB) Paru adalah tantangan terbesar di fasilitas pemasyarakatan akibat kepadatan hunian, ventilasi terbatas, dan gizi buruk. Deteksi dini adalah kunci.',
    konten: 'DETEKSI DINI: Skrining TCM (Tes Cepat Molekuler) wajib untuk setiap WBP baru. Gejala curiga TB: batuk > 2 minggu, keringat malam, penurunan berat badan, demam ringan.\n\nPENGOBATAN (Kategori 1): Fase Intensif 2 bulan (RHZE) + Fase Lanjutan 4 bulan (RH). Total 6 bulan tidak boleh putus.\n\nPMO (Pengawas Minum Obat): Petugas klinik atau sesama WBP yang ditunjuk wajib menyaksikan langsung WBP menelan obat setiap hari.\n\nISOLASI: WBP TB Paru yang masih menular (BTA+) ditempatkan di sel isolasi berventilasi baik. Gunakan masker medis saat berinteraksi.',
    tanggal: '03 Jun 2026'
  },
  {
    id: 3,
    judul: 'Kesehatan Jiwa WBP — Mengatasi Depresi & Kecemasan',
    kategori: 'Kesehatan Jiwa',
    emoji: '🧠',
    bg: 'linear-gradient(135deg, #1a1a3a, #6366f1)',
    excerpt: 'Gangguan jiwa seperti depresi dan kecemasan sangat umum pada Warga Binaan Pemasyarakatan. Kenali tanda-tandanya dan jangan ragu meminta bantuan klinik.',
    konten: 'TANDA DEPRESI: Perasaan sedih berkepanjangan (>2 minggu), kehilangan minat pada aktivitas, sulit tidur atau tidur terlalu banyak, makan berlebihan atau tidak mau makan, sulit berkonsentrasi, pikiran tentang menyakiti diri sendiri.\n\nAPA YANG HARUS DILAKUKAN: 1) Ceritakan perasaan Anda kepada petugas klinik atau konselor. 2) Ikuti kegiatan rehabilitasi dan olahraga rutin. 3) Tetap terhubung dengan keluarga melalui kunjungan/telepon. 4) Jangan konsumsi alkohol ilegal atau NAPZA — ini memperburuk gangguan jiwa.\n\nPELAYANAN: Klinik menyediakan konsultasi dengan Dokter Spesialis Jiwa. Semua informasi dijaga kerahasiaannya.',
    tanggal: '02 Jun 2026'
  },
  {
    id: 4,
    judul: 'HIV/AIDS di Lapas — Hak Layanan Kesehatan WBP',
    kategori: 'Penyakit Menular',
    emoji: '🎗️',
    bg: 'linear-gradient(135deg, #2a1a2a, #ec4899)',
    excerpt: 'Prevalensi HIV di Lapas/Rutan jauh lebih tinggi dari populasi umum. Setiap WBP berhak mendapatkan tes VCT dan layanan ARV secara gratis dan rahasia.',
    konten: 'HAK WBP: 1) Tes HIV bersifat sukarela, rahasia, dan gratis (VCT). 2) WBP yang positif HIV berhak mendapatkan terapi ARV tanpa diskriminasi. 3) Tidak ada kewajiban mengungkap status HIV kepada sesama WBP.\n\nTRANSMISI DI LAPAS: Penggunaan jarum suntik bersama (NAPZA), tato sembarangan, dan hubungan seksual tanpa pengaman.\n\nKEWASPADAAN: Laporkan jika ada fasilitas jarum suntik ilegal. Tato hanya boleh dilakukan oleh petugas medis berlisensi dengan peralatan steril.\n\nCOTRIMOXAZOLE: WBP ODHA akan diberikan Cotrimoxazole sebagai profilaksis infeksi oportunistik.',
    tanggal: '01 Jun 2026'
  },
  {
    id: 5,
    judul: 'Sanitasi & Kebersihan Blok Hunian',
    kategori: 'Kesehatan Lingkungan',
    emoji: '🧼',
    bg: 'linear-gradient(135deg, #1a3a2a, #10b981)',
    excerpt: 'Lingkungan yang bersih adalah pertahanan pertama dari penyakit menular. Standar sanitasi minimal wajib dijaga di setiap blok hunian.',
    konten: 'STANDAR KEBERSIHAN HARIAN: 1) Cuci tangan pakai sabun minimal 5 kali sehari (sebelum makan, setelah BAB, setelah menyentuh sampah). 2) Buang sampah pada tempat yang disediakan — jangan timbun di kamar. 3) Bersihkan lantai dan dinding sel setiap hari. 4) Pastikan ventilasi dan cahaya matahari masuk ke sel.\n\nKAPUR SIRIH & DESINFEKTAN: Lantai kamar mandi dibersihkan dengan larutan disinfektan seminggu 2 kali. Jadwal kebersihan dikoordinir oleh Sanitarian Lapas.\n\nMATRAS & TEMPAT TIDUR: Jemur matras di bawah sinar matahari minimal seminggu sekali untuk mencegah pertumbuhan jamur dan tungau.',
    tanggal: '31 Mei 2026'
  },
  {
    id: 6,
    judul: 'Rehabilitasi Medis NAPZA — Menuju Pemulihan',
    kategori: 'Rehabilitasi NAPZA',
    emoji: '🌱',
    bg: 'linear-gradient(135deg, #3a2a1a, #f59e0b)',
    excerpt: 'Ketergantungan NAPZA adalah penyakit yang bisa disembuhkan. Lapas menyediakan program rehabilitasi medis dan sosial bagi WBP pengguna NAPZA.',
    konten: 'DETOKSIFIKASI MEDIS: Proses menghilangkan racun NAPZA dari tubuh dilakukan di bawah pengawasan dokter. Gejala putus zat (withdrawal) dapat ditangani dengan obat-obatan medis yang aman.\n\nGEJALA PUTUS ZAT: Berkeringat, menggigil, nyeri otot, mual, insomnia, kecemasan hebat → segera lapor ke klinik.\n\nPROGRAM REHABILITASI: Setelah detoksifikasi, WBP mengikuti program Therapeutic Community (TC) atau rehabilitasi berbasis modul Kemensos. Konseling individu dan kelompok tersedia.\n\nMETADON: Bagi pengguna heroin/putaw berat, tersedia Terapi Rumatan Metadon (TRM) di bawah pengawasan dokter untuk mencegah relaps dan penularan HIV.',
    tanggal: '29 Mei 2026'
  },
];

// ── Log Transaksi Obat ─────────────────────────────────────────────
const DUMMY_LOG = [];

// ── Inisialisasi Data ke localStorage ─────────────────────────────
function initData() {
  if (!localStorage.getItem('ios_obat'))    localStorage.setItem('ios_obat',    JSON.stringify(DUMMY_OBAT));
  if (!localStorage.getItem('ios_pegawai')) localStorage.setItem('ios_pegawai', JSON.stringify(DUMMY_PEGAWAI));
  if (!localStorage.getItem('ios_log'))     localStorage.setItem('ios_log',     JSON.stringify(DUMMY_LOG));
  if (!localStorage.getItem('ios_kesehatan')) localStorage.setItem('ios_kesehatan', JSON.stringify(DUMMY_KESEHATAN));
  if (!localStorage.getItem('ios_gas_url')) localStorage.setItem('ios_gas_url', 'https://script.google.com/macros/s/AKfycbz_0dRpLd2Uvc3UOx0dczXmwnFZZSg4euWgG7BEiF5UQSpzxIzKFNF9kw65HgJT5rws/exec');
  if (!localStorage.getItem('ios_accounts')) {
    localStorage.setItem('ios_accounts', JSON.stringify([
      { id: 1, username: 'admin', password: 'admin1234', nama: 'Admin Klinik', role: 'Super Admin', createdAt: '2026-06-01' }
    ]));
  }
  if (!localStorage.getItem('ios_profil')) {
    localStorage.setItem('ios_profil', JSON.stringify([
      { id: 1, nama: 'Klinik Pratama Lapas Kelas I Palembang', telepon: '(0711) 123-4567', alamat: 'Jl. Merdeka No. 123, Palembang, Sumatera Selatan', upt: 'Lapas Kelas I Palembang — Ditjenpas Kemenimipas' }
    ]));
  }
}

// ── CRUD Helpers (Offline-First) ───────────────────────────────────
function getData(key) {
  try {
    const data = JSON.parse(localStorage.getItem('ios_' + key) || '[]');
    if (key === 'log') {
      console.log('[DEBUG] Transaction Loaded — Count:', data.length);
    }
    return data;
  }
  catch { return []; }
}

function saveData(key, data) {
  localStorage.setItem('ios_' + key, JSON.stringify(data));
}

/**
 * Generate ID unik yang aman dari collision.
 * Menggunakan max(ID lokal) + timestamp suffix untuk menghindari
 * bentrok dengan ID di Google Sheets yang mungkin lebih besar.
 *
 * Format: <max_id + 1> jika sederhana, atau timestamp-based jika kosong.
 * @param {Array} arr - Array data yang sudah ada
 * @returns {number} ID baru yang unik
 */
function getNextId(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    // Gunakan timestamp-based ID untuk menghindari collision dengan data Sheets
    return Date.now();
  }
  const maxId = Math.max(...arr.map(x => Number(x.id) || 0));
  // Jika ID sudah besar (timestamp-based), tambahkan 1
  // Jika ID kecil (sequential), tetap tambahkan 1
  return maxId + 1;
}
