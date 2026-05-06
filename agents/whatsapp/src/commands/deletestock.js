/**
 * !ds [user] [no1] [no2] ... — Hapus stok (Admin Only)
 * Nomor mengacu ke urutan tampil di !list (sorted alphabetical).
 * Support multi-nomor: !ds Ardian 1 3 5 atau !ds Ardian 1,3,5
 */
const db      = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    if (args.length < 3) {
        return reply(msg,
            `❌ *Format salah.*\n` +
            `Contoh: \`!ds Ardian 1\` atau \`!ds Ardian 1 3 5\``
        );
    }

    const userName = args[1];

    // Parsing nomor — support spasi dan koma
    const targets = [...new Set(
        args.slice(2).join(',').split(/[,\s]+/)
            .map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0)
    )].sort((a, b) => b - a); // hapus dari belakang agar index tidak bergeser

    try {
        const user = await db.getUserByName(userName);
        if (!user) return reply(msg, `❌ User *${userName}* tidak ditemukan.`);

        const rawStocks = await db.getStocksByUser(user.id);
        if (rawStocks.length === 0) return reply(msg, `📭 User *${user.name}* tidak memiliki barang.`);

        // Sort SAMA seperti !list: Ready A→Z dulu, lalu Not Ready A→Z
        const ready    = rawStocks.filter(s => s.status === 'Ready')
                                  .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));
        const notReady = rawStocks.filter(s => s.status !== 'Ready')
                                  .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));
        const allSorted = [...ready, ...notReady];

        const deleted = [];
        const invalid = [];

        for (const t of targets) {
            const stock = allSorted[t - 1];
            if (!stock) { invalid.push(t); continue; }
            await db.deleteStock(stock.id);
            // Jika ada track aktif untuk stok ini, hapus juga
            try { await db.removeStockTrackByStockId(stock.id); } catch (_) {}
            deleted.push(`🗑️ *${t}.* ${stock.item_name}`);
        }

        let resp = '';
        if (deleted.length > 0) {
            resp += `✅ *${deleted.length} barang dihapus* (${user.name}):\n━━━━━━━━━━━━━━━━━━\n` + deleted.join('\n');
        }
        if (invalid.length > 0) {
            if (resp) resp += '\n\n';
            resp += `⚠️ Nomor tidak ditemukan: ${invalid.join(', ')}`;
        }

        return reply(msg, resp || '❌ Tidak ada barang yang dihapus.');

    } catch (e) {
        console.error('[DELETESTOCK] Error:', e);
        return reply(msg, '❌ Terjadi kesalahan saat menghapus stok.');
    }
};

module.exports = { execute };
