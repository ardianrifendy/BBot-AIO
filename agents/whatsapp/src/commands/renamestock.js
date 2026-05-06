/**
 * !renameready [user] [no] [nama baru]    — ganti nama item Ready
 * !renamenotready [user] [no] [nama baru] — ganti nama item Di Jalan
 * (Admin Only) — Nomor mengacu ke urutan di !list (sorted alphabetical)
 */
const db        = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args) => {
    const commandName  = args[0].toLowerCase();
    const targetStatus = (commandName === '!renameready') ? 'Ready' : 'Not Ready';

    if (args.length < 4) {
        return reply(msg,
            `❌ *Format salah.*\n` +
            `Contoh: \`!renameready Ardian 1 Nama Baru\``
        );
    }

    const userName  = args[1];
    const targetIdx = parseInt(args[2]);
    const newName   = args.slice(3).join(' ').trim();

    if (isNaN(targetIdx) || targetIdx < 1) {
        return reply(msg, '❌ Nomor barang tidak valid.');
    }
    if (!newName) {
        return reply(msg, '❌ Nama baru tidak boleh kosong.');
    }

    try {
        const user = await db.getUserByName(userName);
        if (!user) return reply(msg, `❌ User *${userName}* tidak ditemukan.`);

        const rawStocks = await db.getStocksByUser(user.id);
        if (rawStocks.length === 0) return reply(msg, `📭 User *${user.name}* tidak memiliki barang.`);

        // Sort SAMA seperti !list
        const ready    = rawStocks.filter(s => s.status === 'Ready')
                                  .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));
        const notReady = rawStocks.filter(s => s.status !== 'Ready')
                                  .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));
        const allSorted = [...ready, ...notReady];

        const stock = allSorted[targetIdx - 1];
        if (!stock) {
            return reply(msg, `❌ Nomor *${targetIdx}* tidak ditemukan (total: ${allSorted.length} item).`);
        }

        // Verifikasi command sesuai status
        if (stock.status !== targetStatus) {
            return reply(msg,
                `❌ Item no.*${targetIdx}* berstatus *${stock.status}*,\n` +
                `bukan *${targetStatus}*.\n\n` +
                `Gunakan \`${stock.status === 'Ready' ? '!renameready' : '!renamenotready'}\`.`
            );
        }

        const oldName = stock.item_name;
        await db.renameStock(stock.id, newName);

        return reply(msg,
            `✏️ *Nama berhasil diubah!*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 User   : *${user.name}*\n` +
            `📦 Lama   : ~~${oldName}~~\n` +
            `📦 Baru   : *${newName}*`
        );

    } catch (e) {
        console.error('[RENAMESTOCK] Error:', e);
        return reply(msg, '❌ Terjadi kesalahan saat merename stok.');
    }
};

module.exports = { execute };
