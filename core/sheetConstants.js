/**
 * ============================================================
 * SHEET CONSTANTS — Single Source of Truth
 * ============================================================
 * Semua nama tab sheet dan definisi header terpusat di sini.
 * Import dari file ini, jangan hardcode di tempat lain.
 * ============================================================
 */

// ── Nama Tab Sheet ─────────────────────────────────────────────────────────────
const SHEETS = {
    // === Existing Sheets (TIDAK DIUBAH) ===
    HISTORY:       'History',
    ACTIVE_TRACKS: 'ActiveTracks',
    USERS:         'Users',
    STOCKS:        'Stocks',
    STOCK_TRACKS:  'StockTracks',

    // === New Sheets ===
    CATALOG:            'Catalog',           // Data produk & harga
    MARKETPLACE_PRICES: 'MarketplacePrices', // Hasil scraping harga kompetitor
    TRANSACTIONS:       'Transactions',      // History penjualan
};

// ── Header Per Sheet ───────────────────────────────────────────────────────────
const HEADERS = {
    // === Existing (TIDAK DIUBAH) ===
    [SHEETS.HISTORY]:       ['user_jid', 'courier', 'awb', 'hp', 'created_at'],
    [SHEETS.ACTIVE_TRACKS]: ['user_jid', 'courier', 'awb', 'hp', 'last_status', 'last_checked'],
    [SHEETS.USERS]:         ['id', 'name'],
    [SHEETS.STOCKS]:        ['id', 'user_id', 'item_name', 'status', 'created_at'],
    [SHEETS.STOCK_TRACKS]:  ['id', 'stock_id', 'user_name', 'item_name', 'courier', 'awb', 'hp', 'last_status', 'added_by_jid', 'added_at'],

    // === New Sheets ===
    [SHEETS.CATALOG]: [
        'id',          // Auto-increment
        'item_name',   // Nama model HP (harus cocok dengan Stocks.item_name)
        'harga_beli',  // Modal beli (Rp)
        'harga_jual',  // Harga jual ke customer (Rp)
        'kondisi',     // Baru / Bekas
        'deskripsi',   // Deskripsi untuk posting
        'last_updated' // ISO timestamp
    ],
    [SHEETS.TRANSACTIONS]: [
        'id',          // Auto-increment
        'date',        // ISO timestamp
        'user_id',     // ID pemilik barang
        'item_name',   // Nama barang
        'harga_jual',  // Harga jual aktual (Rp)
        'pembeli',     // Nama pembeli (opsional)
        'catatan',     // Catatan tambahan
    ],
    [SHEETS.MARKETPLACE_PRICES]: [
        'id',            // Auto-increment
        'keyword',       // Kata kunci yang di-scrape
        'harga_min',     // Harga terendah ditemukan
        'harga_max',     // Harga tertinggi ditemukan
        'harga_rata2',   // Rata-rata harga
        'jumlah_listing',// Berapa listing ditemukan
        'scraped_at'     // ISO timestamp
    ],
};

module.exports = { SHEETS, HEADERS };
