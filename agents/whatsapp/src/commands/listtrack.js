/**
 * ============================================================
 * COMMAND: !listtrack [user]
 * ============================================================
 * Menampilkan daftar resi yang sedang dipantau otomatis
 * oleh scheduler, beserta status terakhir yang diketahui.
 *
 * Contoh:
 *   !listtrack          → semua user
 *   !listtrack Ardian   → hanya stok Ardian
 * ============================================================
 */

const db        = require('../db');
const { reply } = require('../utils/helpers');

const FOOTER = '\n\n_— *Bagaskara Cell* 📦_';

const execute = async (msg, args) => {
    const filterUser = args[1] ? args[1].toLowerCase().trim() : null;

    try {
        let tracks = await db.getAllStockTracks();

        if (tracks.length === 0) {
            return reply(msg,
                `📭 *Tidak ada resi yang sedang dipantau.*\n\n` +
                `Tambahkan dengan: \`!addtrack [user] [no stok] [kurir] [resi]\`` +
                FOOTER
            );
        }

        // Filter per user jika ada argumen
        if (filterUser) {
            tracks = tracks.filter(t => t.user_name?.toLowerCase() === filterUser);
            if (tracks.length === 0) {
                return reply(msg,
                    `❌ Tidak ada track aktif untuk user *${args[1]}*.` + FOOTER
                );
            }
        }

        // Kelompokkan per user
        const byUser = {};
        for (const t of tracks) {
            if (!byUser[t.user_name]) byUser[t.user_name] = [];
            byUser[t.user_name].push(t);
        }

        const title = filterUser
            ? `🔍 *TRACK AKTIF — ${args[1].toUpperCase()}*`
            : `🔍 *SEMUA TRACK AKTIF*`;

        let text = `${title}\n━━━━━━━━━━━━━━━━━━\n`;

        for (const [uName, userTracks] of Object.entries(byUser)) {
            text += `\n👤 *${uName}* (${userTracks.length} track)\n`;

            userTracks.forEach((t, i) => {
                const status = t.last_status || '_Belum dicek_';
                const emoji  = !t.last_status          ? '⏳'
                             : t.last_status.toLowerCase() === 'delivered' ? '✅'
                             : t.last_status.toLowerCase().includes('return') ? '⚠️'
                             : '🚚';

                text += `${i + 1}. ${emoji} *${t.item_name}*\n`;
                text += `   🚚 ${t.courier?.toUpperCase()} \`${t.awb}\`\n`;
                text += `   📍 _${status}_\n`;
            });
        }

        text += `\n━━━━━━━━━━━━━━━━━━`;
        text += `\n📦 Total: *${tracks.length} resi* dipantau`;

        return reply(msg, text + FOOTER);

    } catch (e) {
        console.error('[LISTTRACK] Error:', e);
        return reply(msg, `❌ Gagal memuat data track: ${e.message}` + FOOTER);
    }
};

module.exports = { execute };
