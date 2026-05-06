/**
 * ============================================================
 * CACHE MODULE - Simple In-Memory Cache dengan TTL
 * ============================================================
 * Menyimpan hasil tracking sementara di memori selama durasi
 * tertentu (default 30 menit) agar tidak perlu memanggil API
 * berulang kali untuk resi yang sama dalam waktu singkat.
 *
 * Struktur entry cache:
 *   key   : string (courier:awb atau courier:awb:hp)
 *   value : { data: Object, expiresAt: timestamp }
 * ============================================================
 */

// Durasi cache dalam milidetik (30 menit)
const CACHE_TTL_MS = 30 * 60 * 1000;

// Penyimpanan cache utama (Map di memori)
const cacheStore = new Map();

/**
 * Membuat kunci cache yang unik dari parameter tracking
 * @param {string} courier - Kode kurir (jne, jnt, dll)
 * @param {string} awb     - Nomor resi
 * @param {string} hp      - Nomor HP (khusus JNE, opsional)
 * @returns {string} Kunci cache
 */
const buildKey = (courier, awb, hp = '') => {
    const base = `${courier.toLowerCase()}:${awb.toUpperCase()}`;
    return hp ? `${base}:${hp}` : base;
};

/**
 * Menyimpan data ke cache dengan TTL tertentu
 * @param {string} courier - Kode kurir
 * @param {string} awb     - Nomor resi
 * @param {string} hp      - Nomor HP (opsional)
 * @param {Object} data    - Data tracking dari API Binderbyte
 */
const set = (courier, awb, hp = '', data) => {
    const key = buildKey(courier, awb, hp);
    cacheStore.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
        cachedAt: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    });
    console.log(`[CACHE] Disimpan: ${key} (berlaku 30 menit)`);
};

/**
 * Mengambil data dari cache jika belum kadaluarsa
 * @param {string} courier - Kode kurir
 * @param {string} awb     - Nomor resi
 * @param {string} hp      - Nomor HP (opsional)
 * @returns {Object|null} Data tracking atau null jika tidak ada/kadaluarsa
 */
const get = (courier, awb, hp = '') => {
    const key = buildKey(courier, awb, hp);
    const entry = cacheStore.get(key);

    if (!entry) return null;

    // Cek apakah sudah kadaluarsa
    if (Date.now() > entry.expiresAt) {
        cacheStore.delete(key); // Bersihkan entry lama
        console.log(`[CACHE] Kadaluarsa & dihapus: ${key}`);
        return null;
    }

    console.log(`[CACHE] Hit! Menggunakan data cache untuk: ${key}`);
    return { data: entry.data, cachedAt: entry.cachedAt };
};

/**
 * Menghapus satu entry cache secara manual
 * @param {string} courier - Kode kurir
 * @param {string} awb     - Nomor resi
 * @param {string} hp      - Nomor HP (opsional)
 */
const remove = (courier, awb, hp = '') => {
    const key = buildKey(courier, awb, hp);
    cacheStore.delete(key);
};

/**
 * Membersihkan seluruh cache (untuk keperluan debugging)
 */
const clearAll = () => {
    cacheStore.clear();
    console.log('[CACHE] Semua cache telah dibersihkan.');
};

/**
 * Mengembalikan jumlah entry aktif dalam cache
 * @returns {number}
 */
const size = () => cacheStore.size;

module.exports = { set, get, remove, clearAll, size, CACHE_TTL_MS };
