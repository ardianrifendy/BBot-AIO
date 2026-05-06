/**
 * ============================================================
 * COMMAND: !removetrack [user] [nomor di !listtrack]
 * ============================================================
 * Menghapus tracking resi dari item stok (berhenti dipantau).
 *
 * Contoh:
 *   !removetrack Ardian 1    → hapus track nomor 1 milik Ardian
 *   !removetrack Ardian 1 3  → hapus nomor 1 dan 3 sekaligus
 * ============================================================
 */

const db        = require('../db');
const { reply } = require('../utils/helpers');

const FOOTER = '\n\n_— *Bagaskara Cell* 📦_';

const execute = async (msg, args) => {
    if (args.length < 3) {
        return reply(msg,
            `❌ *Format salah.*\n\n` +
            `\`!removetrack [user] [nomor]\`\n\n` +
            `Lihat nomor track dengan: \`!listtrack [user]\`` +
            FOOTER
        );
    }

    const userName = args[1];
    // Ambil semua nomor setelah nama user (support multi)
    const targets = args.slice(2)
        .join(' ').split(/[\s,]+/)
        .map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);

    if (targets.length === 0) {
        return reply(msg, `❌ Nomor track tidak valid.` + FOOTER);
    }

    try {
        const tracks = await db.getStockTracksByUser(userName);

        if (tracks.length === 0) {
            return reply(msg, `❌ Tidak ada track aktif untuk *${userName}*.` + FOOTER);
        }

        const removed  = [];
        const invalid  = [];

        for (const t of targets) {
            const track = tracks[t - 1];
            if (!track) { invalid.push(t); continue; }
            await db.removeStockTrack(track.id);
            removed.push(`🗑️ *${t}.* ${track.item_name} — ${track.courier?.toUpperCase()} \`${track.awb}\``);
        }

        let resp = '';
        if (removed.length > 0) {
            resp += `✅ *${removed.length} track dihapus* (${userName}):\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    removed.join('\n');
        }
        if (invalid.length > 0) {
            if (resp) resp += '\n\n';
            resp += `⚠️ Nomor tidak ditemukan: ${invalid.join(', ')}`;
        }

        return reply(msg, resp + FOOTER);

    } catch (e) {
        console.error('[REMOVETRACK] Error:', e);
        return reply(msg, `❌ Gagal menghapus track: ${e.message}` + FOOTER);
    }
};

module.exports = { execute };
