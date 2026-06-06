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
const DUMMY_OBAT = [
  // --- ANTIBIOTIK ---
  {
    id: 1, nama: 'Amoxicillin 500mg', kategori: 'Antibiotik',
    satuan: 'Strip', masuk: 200, keluar: 165, stok: 35,
    minStok: 30, tanggal: '2026-06-01', expired: '2027-06-01',
    controlled: false, keterangan: 'Infeksi saluran nafas & kulit ringan'
  },
  {
    id: 2, nama: 'Cefixime 100mg', kategori: 'Antibiotik',
    satuan: 'Box', masuk: 60, keluar: 38, stok: 22,
    minStok: 15, tanggal: '2026-06-01', expired: '2027-05-01',
    controlled: false, keterangan: 'Infeksi saluran kemih & ISK'
  },
  {
    id: 3, nama: 'Cotrimoxazole 480mg', kategori: 'Antibiotik',
    satuan: 'Strip', masuk: 150, keluar: 130, stok: 20,
    minStok: 25, tanggal: '2026-06-02', expired: '2027-09-01',
    controlled: false, keterangan: 'Profilaksis infeksi pada ODHA (HIV+)'
  },

  // --- ANALGESIK & ANTIPIRETIK ---
  {
    id: 4, nama: 'Paracetamol 500mg', kategori: 'Analgesik',
    satuan: 'Strip', masuk: 300, keluar: 278, stok: 22,
    minStok: 40, tanggal: '2026-06-01', expired: '2027-12-01',
    controlled: false, keterangan: 'Nyeri ringan & demam'
  },
  {
    id: 5, nama: 'Ibuprofen 400mg', kategori: 'Analgesik',
    satuan: 'Strip', masuk: 100, keluar: 60, stok: 40,
    minStok: 20, tanggal: '2026-06-03', expired: '2028-02-01',
    controlled: false, keterangan: 'Nyeri & inflamasi sedang'
  },

  // --- TERAPI OAT (OBAT ANTI TUBERKULOSIS) ---
  // TB Paru merupakan penyakit endemik di lingkungan Lapas/Rutan akibat kepadatan
  {
    id: 6, nama: 'Kombipak OAT Fase Intensif (2RHZE)', kategori: 'Terapi OAT',
    satuan: 'Paket', masuk: 30, keluar: 18, stok: 12,
    minStok: 10, tanggal: '2026-06-01', expired: '2027-04-01',
    controlled: true, keterangan: 'TB Paru — Fase Intensif 2 bulan. Wajib PMO (Pengawas Minum Obat)'
  },
  {
    id: 7, nama: 'Kombipak OAT Fase Lanjutan (4RH)', kategori: 'Terapi OAT',
    satuan: 'Paket', masuk: 25, keluar: 14, stok: 11,
    minStok: 8, tanggal: '2026-06-01', expired: '2027-04-01',
    controlled: true, keterangan: 'TB Paru — Fase Lanjutan 4 bulan. Verifikasi kartu TB wajib'
  },

  // --- DERMATOLOGI (PENYAKIT KULIT) ---
  // Scabies & penyakit kulit sangat umum di Lapas akibat sanitasi & kepadatan
  {
    id: 8, nama: 'Permethrin 5% Krim', kategori: 'Dermatologi',
    satuan: 'Tube', masuk: 80, keluar: 55, stok: 25,
    minStok: 20, tanggal: '2026-06-02', expired: '2028-01-01',
    controlled: false, keterangan: 'Scabies (kudis) — oleskan seluruh tubuh, diamkan 8 jam'
  },
  {
    id: 9, nama: 'Ketoconazole 2% Krim', kategori: 'Dermatologi',
    satuan: 'Tube', masuk: 50, keluar: 30, stok: 20,
    minStok: 15, tanggal: '2026-06-02', expired: '2027-11-01',
    controlled: false, keterangan: 'Infeksi jamur kulit (tinea, kandidiasis)'
  },
  {
    id: 10, nama: 'Salep 2-4 (Sulfur Presipitat)', kategori: 'Dermatologi',
    satuan: 'Pot', masuk: 60, keluar: 48, stok: 12,
    minStok: 15, tanggal: '2026-06-03', expired: '2027-08-01',
    controlled: false, keterangan: 'Scabies & penyakit kulit infeksi lainnya'
  },

  // --- PSIKOTROPIKA & KESEHATAN JIWA ---
  // KONTROL KETAT: Obat ini rawan disalahgunakan/diperjualbelikan di Lapas
  {
    id: 11, nama: 'Diazepam 5mg', kategori: 'Psikotropika',
    satuan: 'Strip', masuk: 40, keluar: 28, stok: 12,
    minStok: 10, tanggal: '2026-06-01', expired: '2027-06-01',
    controlled: true, keterangan: 'Ansietas & gejala putus alkohol. Resep dokter + tanda tangan Kepala Klinik WAJIB'
  },
  {
    id: 12, nama: 'Haloperidol 5mg', kategori: 'Psikotropika',
    satuan: 'Strip', masuk: 20, keluar: 12, stok: 8,
    minStok: 8, tanggal: '2026-06-01', expired: '2027-03-01',
    controlled: true, keterangan: 'Psikosis akut & gangguan jiwa berat. Kontrol ketat'
  },
  {
    id: 13, nama: 'Amitriptyline 25mg', kategori: 'Psikotropika',
    satuan: 'Strip', masuk: 30, keluar: 20, stok: 10,
    minStok: 10, tanggal: '2026-06-02', expired: '2027-10-01',
    controlled: true, keterangan: 'Depresi berat pada Warga Binaan Pemasyarakatan'
  },

  // --- VITAMIN & SUPLEMEN ---
  {
    id: 14, nama: 'Vitamin C 1000mg', kategori: 'Vitamin',
    satuan: 'Box', masuk: 100, keluar: 60, stok: 40,
    minStok: 20, tanggal: '2026-06-02', expired: '2028-03-01',
    controlled: false, keterangan: 'Imunitas & antioksidan'
  },
  {
    id: 15, nama: 'Multivitamin + Mineral (Tablet)', kategori: 'Vitamin',
    satuan: 'Box', masuk: 80, keluar: 45, stok: 35,
    minStok: 15, tanggal: '2026-06-02', expired: '2028-06-01',
    controlled: false, keterangan: 'Suplementasi gizi dasar untuk WBP dengan gizi kurang'
  },

  // --- LAMBUNG & PENCERNAAN ---
  {
    id: 16, nama: 'Omeprazole 20mg', kategori: 'Lambung',
    satuan: 'Strip', masuk: 90, keluar: 55, stok: 35,
    minStok: 15, tanggal: '2026-06-02', expired: '2027-08-01',
    controlled: false, keterangan: 'Tukak lambung & GERD'
  },
  {
    id: 17, nama: 'Antasida Tablet (Kombinasi)', kategori: 'Lambung',
    satuan: 'Box', masuk: 50, keluar: 50, stok: 0,
    minStok: 10, tanggal: '2026-06-01', expired: '2027-03-01',
    controlled: false, keterangan: 'Maag & hiperasiditas'
  },
  {
    id: 18, nama: 'Oralit Sachet', kategori: 'Lambung',
    satuan: 'Box', masuk: 120, keluar: 95, stok: 25,
    minStok: 20, tanggal: '2026-06-03', expired: '2028-01-01',
    controlled: false, keterangan: 'Rehidrasi oral — diare & muntah'
  },

  // --- RESPIRASI ---
  {
    id: 19, nama: 'Salbutamol 4mg', kategori: 'Bronkodilator',
    satuan: 'Strip', masuk: 40, keluar: 12, stok: 28,
    minStok: 10, tanggal: '2026-06-03', expired: '2027-10-01',
    controlled: false, keterangan: 'Asma & sesak nafas'
  },
  {
    id: 20, nama: 'Dexamethasone 0.5mg', kategori: 'Kortikosteroid',
    satuan: 'Strip', masuk: 60, keluar: 35, stok: 25,
    minStok: 10, tanggal: '2026-06-04', expired: '2027-07-01',
    controlled: false, keterangan: 'Anti-inflamasi & alergi berat'
  },
];

// ── Tabel Pegawai ─────────────────────────────────────────────────
// Mencerminkan struktur SDM Klinik Lapas / Rutan
const DUMMY_PEGAWAI = [
  {
    id: 1, nama: 'dr. Siti Rahayu, Sp.PD', jabatan: 'Dokter Spesialis',
    spesialisasi: 'Penyakit Dalam & Infeksi', hp: '0812-3456-7890',
    email: 'siti.rahayu@lapas-palembang.id',
    jadwal: 'Senin, Rabu, Jumat', status: 'Aktif', inisial: 'SR'
  },
  {
    id: 2, nama: 'dr. Budi Santoso', jabatan: 'Dokter Umum',
    spesialisasi: 'Umum / Kesehatan Penjara', hp: '0813-2345-6789',
    email: 'budi.santoso@lapas-palembang.id',
    jadwal: 'Setiap hari (on call)', status: 'Aktif', inisial: 'BS'
  },
  {
    id: 3, nama: 'dr. Maya Indah, Sp.KJ', jabatan: 'Dokter Spesialis',
    spesialisasi: 'Kesehatan Jiwa / Psikiatri', hp: '0817-8901-2345',
    email: 'maya.indah@lapas-palembang.id',
    jadwal: 'Senin, Rabu, Sabtu', status: 'Aktif', inisial: 'MI'
  },
  {
    id: 4, nama: 'Ns. Dewi Lestari, S.Kep', jabatan: 'Perawat',
    spesialisasi: 'Keperawatan Umum & Luka', hp: '0814-5678-9012',
    email: 'dewi.lestari@lapas-palembang.id',
    jadwal: 'Shift Pagi (06.00–14.00)', status: 'Aktif', inisial: 'DL'
  },
  {
    id: 5, nama: 'Ns. Hendra Wijaya', jabatan: 'Perawat',
    spesialisasi: 'Keperawatan Jiwa & Adiksi', hp: '0818-9012-3456',
    email: 'hendra.w@lapas-palembang.id',
    jadwal: 'Shift Sore (14.00–21.00)', status: 'Aktif', inisial: 'HW'
  },
  {
    id: 6, nama: 'Rini Maharani, S.Farm., Apt.', jabatan: 'Apoteker',
    spesialisasi: 'Farmasi Klinik & Psikotropika', hp: '0815-6789-0123',
    email: 'rini.maharani@lapas-palembang.id',
    jadwal: 'Senin s/d Sabtu', status: 'Aktif', inisial: 'RM'
  },
  {
    id: 7, nama: 'Ahmad Fauzi, SKM', jabatan: 'Sanitarian',
    spesialisasi: 'Kesehatan Lingkungan Blok Hunian', hp: '0816-7890-1234',
    email: 'ahmad.fauzi@lapas-palembang.id',
    jadwal: 'Senin s/d Jumat', status: 'Aktif', inisial: 'AF'
  },
  {
    id: 8, nama: 'Lina Oktavia, A.Md.RMIK', jabatan: 'Admin',
    spesialisasi: 'Rekam Medis & Pelaporan', hp: '0819-0123-4567',
    email: 'lina.oktavia@lapas-palembang.id',
    jadwal: 'Senin s/d Sabtu', status: 'Aktif', inisial: 'LO'
  },
  {
    id: 9, nama: 'Sgt. Rudi Hartono', jabatan: 'Petugas Lapas',
    spesialisasi: 'Pengawas Keamanan Klinik', hp: '0821-5678-0001',
    email: 'rudi.h@kemenimipas.go.id',
    jadwal: 'Shift Malam (21.00–06.00)', status: 'Aktif', inisial: 'RH'
  },
  {
    id: 10, nama: 'dr. Andi Pramono', jabatan: 'Dokter Umum',
    spesialisasi: 'Dokter Muda — Program Kedokteran Pemasyarakatan', hp: '0822-1234-5678',
    email: 'andi.pramono@lapas-palembang.id',
    jadwal: 'Selasa, Kamis, Sabtu', status: 'Izin', inisial: 'AP'
  },
];

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
const DUMMY_LOG = [
  { id: 1, obat: 'Paracetamol 500mg',            jenis: 'keluar', jumlah: 30,  keterangan: 'Resep dr. Budi — demam 15 WBP',         timestamp: '2026-06-04 07:30' },
  { id: 2, obat: 'Permethrin 5% Krim',            jenis: 'keluar', jumlah: 20,  keterangan: 'Pengobatan massal Scabies Blok B',        timestamp: '2026-06-04 08:00' },
  { id: 3, obat: 'Kombipak OAT Fase Intensif',    jenis: 'keluar', jumlah: 3,   keterangan: 'PMO: Ns. Dewi — 3 WBP baru TB+',          timestamp: '2026-06-04 08:30' },
  { id: 4, obat: 'Cotrimoxazole 480mg',            jenis: 'keluar', jumlah: 15,  keterangan: 'Profilaksis HIV+ — acc dr. Siti',         timestamp: '2026-06-04 09:00' },
  { id: 5, obat: 'Diazepam 5mg',                  jenis: 'keluar', jumlah: 5,   keterangan: '⚠ PSIKOTROPIKA — Resep dr. Maya, TTD Kepala Klinik', timestamp: '2026-06-04 09:45' },
  { id: 6, obat: 'Vitamin C 1000mg',              jenis: 'masuk',  jumlah: 50,  keterangan: 'Pengadaan rutin bulanan',                 timestamp: '2026-06-04 10:00' },
  { id: 7, obat: 'Oralit Sachet',                 jenis: 'keluar', jumlah: 40,  keterangan: 'KLB Diare Blok A — 8 WBP',               timestamp: '2026-06-04 11:00' },
  { id: 8, obat: 'Amoxicillin 500mg',             jenis: 'masuk',  jumlah: 100, keterangan: 'Pengadaan darurat — stok menipis',        timestamp: '2026-06-04 13:00' },
];

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
  try { return JSON.parse(localStorage.getItem('ios_' + key) || '[]'); }
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
