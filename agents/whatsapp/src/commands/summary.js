/**
 * ============================================================
 * COMMAND: !summary / !s
 * ============================================================
 * Menampilkan ringkasan SINGKAT stok semua user:
 * hanya angka Ready, Di Jalan, dan Total — tanpa daftar item.
 *
 * Contoh output:
 *   📊 RINGKASAN STOK
 *   ──────────────────
 *   👤 Ardian   → 24 Ready | 7 Jalan
 *   👤 Okiq     → 16 Ready | 1 Jalan
 *   ──────────────────
 *   🟢 Total Ready  : 40
 *   🚚 Total Jalan  : 8
 *   📦 Grand Total  : 48
 * ============================================================
 */

const db = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args) => {
    try {
        const data = await db.getAllUsersAndStocks();

        if (!data || data.length === 0) {
            return reply(msg, '📭 Belum ada data stok.');
        }

        // Kelompokkan per user
        const userMap = {};
        for (const row of data) {
            if (!userMap[row.user_name]) {
                userMap[row.user_name] = { ready: 0, notReady: 0 };
            }
            if (row.item_name) {
                if (row.status === 'Ready') {
                    userMap[row.user_name].ready++;
                } else {
                    userMap[row.user_name].notReady++;
                }
            }
        }

        // Hitung lebar kolom nama user untuk alignment rapi
        const names = Object.keys(userMap);
        const maxLen = Math.max(...names.map(n => n.length));

        let lines = '';
        let grandReady = 0;
        let grandNotReady = 0;

        for (const [name, counts] of Object.entries(userMap)) {
            // Padding di LUAR bold agar WhatsApp tetap render *nama* sebagai bold
            // Spasi trailing di dalam *...* menyebabkan bold tidak aktif
            const pad = ' '.repeat(maxLen - name.length);
            lines += `👤 *${name}*${pad}  →  ✅ ${counts.ready} Ready  |  🚚 ${counts.notReady} Jalan\n`;
            grandReady    += counts.ready;
            grandNotReady += counts.notReady;
        }

        const grandTotal = grandReady + grandNotReady;

        const response =
            `📊 *RINGKASAN STOK*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            lines.trim() + '\n' +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🟢 Total Ready     : *${grandReady} item*\n` +
            `🚚 Total Di Jalan  : *${grandNotReady} item*\n` +
            `📦 Grand Total     : *${grandTotal} item*`;

        return reply(msg, response);

    } catch (e) {
        console.error('[SUMMARY] Error:', e);
        return reply(msg, '❌ Gagal memuat ringkasan stok.');
    }
};

module.exports = { execute };
