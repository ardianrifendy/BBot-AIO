/**
 * ============================================================
 * COMMAND: !status / !ping
 * ============================================================
 * Menampilkan informasi kesehatan bot:
 *  - Uptime sejak bot terakhir start
 *  - Jumlah stok aktif (Ready & Di Jalan)
 *  - Jumlah resi yang sedang di-track
 *  - Jumlah entry cache aktif
 *  - Timestamp sekarang (WIB)
 * ============================================================
 */

const db        = require('../db');
const cache     = require('../cache');
const { reply } = require('../utils/helpers');

// Simpan waktu start saat module pertama kali di-load
const BOT_START_TIME = Date.now();

/**
 * Format durasi milidetik menjadi string "X jam Y menit"
 * @param {number} ms
 * @returns {string}
 */
const formatUptime = (ms) => {
    const totalSec  = Math.floor(ms / 1000);
    const days      = Math.floor(totalSec / 86400);
    const hours     = Math.floor((totalSec % 86400) / 3600);
    const minutes   = Math.floor((totalSec % 3600) / 60);

    const parts = [];
    if (days    > 0) parts.push(`${days}h`);
    if (hours   > 0) parts.push(`${hours}j`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
};

const execute = async (msg, args) => {
    try {
        // ── Ambil data stok ───────────────────────────────────────────────────
        const allStocks  = await db.getAllUsersAndStocks();
        const totalReady    = allStocks.filter(s => s.item_name && s.status === 'Ready').length;
        const totalNotReady = allStocks.filter(s => s.item_name && s.status !== 'Ready').length;
        const totalStok     = totalReady + totalNotReady;

        // ── Jumlah track aktif ────────────────────────────────────────────────
        const stockTracks = await db.getAllStockTracks();
        const activeTracks = await db.getAllActiveTracks();

        // ── Info cache ────────────────────────────────────────────────────────
        const cacheSize = cache.size();

        // ── Uptime ───────────────────────────────────────────────────────────
        const uptime = formatUptime(Date.now() - BOT_START_TIME);

        // ── Waktu WIB ─────────────────────────────────────────────────────────
        const now = new Date().toLocaleString('id-ID', {
            timeZone:  'Asia/Jakarta',
            dateStyle: 'short',
            timeStyle: 'short'
        });

        const response =
            `⚙️ *STATUS BOT — Bagaskara Cell*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🟢 Status       : *Online*\n` +
            `⏱️ Uptime       : *${uptime}*\n` +
            `🕐 Waktu (WIB)  : *${now}*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📦 *STOK*\n` +
            `   ✅ Ready     : ${totalReady} item\n` +
            `   🚚 Di Jalan  : ${totalNotReady} item\n` +
            `   📊 Total     : ${totalStok} item\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📡 *TRACKING*\n` +
            `   🔍 StockTrack: ${stockTracks.length} resi dipantau\n` +
            `   📬 ActiveTrack: ${activeTracks.length} resi aktif\n` +
            `   💾 Cache      : ${cacheSize} entry\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `_— *Bagaskara Cell* 📦_`;

        return reply(msg, response);

    } catch (e) {
        console.error('[STATUS] Error:', e);
        return reply(msg, '❌ Gagal mengambil info status bot.');
    }
};

module.exports = { execute, BOT_START_TIME };
