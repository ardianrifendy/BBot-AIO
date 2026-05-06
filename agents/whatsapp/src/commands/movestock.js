/**
 * ============================================================
 * COMMAND: !move [nama] [no1] [no2] [no3] ...
 * ============================================================
 * Pindahkan barang dari *Di Jalan* → *Ready*.
 * Nomor mengacu ke urutan di seksi 🟡 Dalam Pengiriman di !list.
 * Mendukung BULK — beberapa nomor sekaligus, pisah spasi atau koma.
 *
 * Contoh:
 *   !move Ardian 1          → pindah nomor 1 dari Di Jalan ke Ready
 *   !move Ardian 1 3 5      → pindah 3 item sekaligus
 *   !move Ardian 1,3,5      → format koma juga didukung
 * ============================================================
 */

const db = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args) => {
    if (args.length < 3) {
        return reply(msg,
            `❌ *Format salah.*\n\n` +
            `Contoh penggunaan:\n` +
            `• \`!move Ardian 1\` — pindah item Di Jalan no.1 ke Ready\n` +
            `• \`!move Ardian 1 3 5\` — pindah 3 item sekaligus\n` +
            `• \`!move Ardian 1,3,5\` — format koma juga bisa\n\n` +
            `💡 Nomor mengacu ke urutan di seksi *Dalam Pengiriman* pada \`!l [nama]\``
        );
    }

    const userName = args[1];

    // Parsing nomor — support spasi dan koma
    const targets = [...new Set(
        args.slice(2).join(',')
            .split(/[,\s]+/)
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n) && n > 0)
    )].sort((a, b) => a - b);

    if (targets.length === 0) {
        return reply(msg, `❌ Tidak ada nomor valid yang diberikan.`);
    }

    try {
        const user = await db.getUserByName(userName);
        if (!user) return reply(msg, `❌ User *${userName}* tidak ditemukan.`);

        // ── Ambil HANYA stok Di Jalan, sorted A→Z (sama seperti !list) ─────────
        const rawStocks = await db.getStocksByUser(user.id);
        const diJalan   = rawStocks
            .filter(s => s.status !== 'Ready')
            .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));

        if (diJalan.length === 0) {
            return reply(msg,
                `📭 User *${user.name}* tidak memiliki barang *Di Jalan*.\n` +
                `_(Semua barang sudah berstatus Ready)_`
            );
        }

        const moved   = [];
        const invalid = [];

        for (const t of targets) {
            const stock = diJalan[t - 1];

            if (!stock) {
                invalid.push(t);
                continue;
            }

            // Pindah Di Jalan → Ready
            await db.updateStockStatus(stock.id, 'Ready');

            // Jika ada StockTrack aktif untuk item ini, hapus otomatis
            try { await db.removeStockTrackByStockId(stock.id); } catch (_) {}

            moved.push(`🚚→✅ *${t}.* ${stock.item_name}`);
        }

        let response = '';

        if (moved.length > 0) {
            response +=
                `✅ *${moved.length} barang tiba di Gudang* (milik *${user.name}*):\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                moved.join('\n');
        }

        if (invalid.length > 0) {
            if (response) response += '\n\n';
            response += `⚠️ Nomor Di Jalan tidak ditemukan: ${invalid.join(', ')}\n`;
            response += `_(Total Di Jalan: ${diJalan.length} item)_`;
        }

        return reply(msg, response.trim());

    } catch (e) {
        console.error('[MOVE] Error:', e);
        return reply(msg, '❌ Terjadi kesalahan saat memindahkan stok.');
    }
};

module.exports = { execute };
