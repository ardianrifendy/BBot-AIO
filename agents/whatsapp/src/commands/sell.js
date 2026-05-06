const sheets = require('../../../../core/googleSheets');
const { SHEETS } = require('../../../../core/sheetConstants');
const { reply } = require('../utils/helpers');
const logger = require('../../../../core/logger');
const log = logger.module('CMD-SELL');

/**
 * !terjual [user] [index_stok] [harga] [pembeli] [catatan]
 * Contoh: !terjual Ardian 1 1500000 Budi Cash
 */
const execute = async (msg, args, client) => {
    try {
        const userName = args[1];
        const indexStok = parseInt(args[2]);
        const hargaJual = parseInt(args[3]);
        const pembeli = args[4] || '-';
        const catatan = args.slice(5).join(' ') || '-';

        if (!userName || isNaN(indexStok) || isNaN(hargaJual)) {
            return reply(msg, '❌ *Format Salah!*\n\n`!terjual [nama_user] [index_stok] [harga] [pembeli] [catatan]`\n\nContoh: `!terjual Ardian 1 1500000 Budi Cash`');
        }

        // 1. Cari user_id
        const users = await sheets.getAll(SHEETS.USERS);
        const user = users.find(u => u.name.toLowerCase() === userName.toLowerCase());
        if (!user) return reply(msg, `❌ User *${userName}* tidak ditemukan.`);

        // 2. Cari stok Ready milik user tsb
        const stocks = await sheets.getAll(SHEETS.STOCKS);
        const userStocks = stocks.filter(s => s.user_id === user.id && s.status === 'Ready');
        
        const target = userStocks[indexStok - 1];
        if (!target) return reply(msg, `❌ Stok nomor *${indexStok}* milik *${userName}* tidak ditemukan.`);

        // 3. Tambahkan ke Transactions
        const txId = await sheets.getNextId(SHEETS.TRANSACTIONS);
        await sheets.appendRow(SHEETS.TRANSACTIONS, [
            txId,
            new Date().toISOString(),
            user.id,
            target.item_name,
            hargaJual,
            pembeli,
            catatan
        ]);

        // 4. Hapus dari Stocks
        // Kita butuh rowIndex asli di sheet. findRow lebih akurat.
        const stockRow = await sheets.findRow(SHEETS.STOCKS, r => r.id === target.id);
        if (stockRow) {
            await sheets.deleteRow(SHEETS.STOCKS, stockRow.rowIndex);
        }

        return reply(msg, 
            `✅ *BERHASIL TERJUAL!*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📦 *Barang:* ${target.item_name}\n` +
            `👤 *Pemilik:* ${user.name}\n` +
            `💰 *Harga:* Rp ${hargaJual.toLocaleString('id-ID')}\n` +
            `🤝 *Pembeli:* ${pembeli}\n` +
            `📝 *Catatan:* ${catatan}\n\n` +
            `_Stok otomatis dihapus dan dicatat di laporan penjualan._`
        );

    } catch (e) {
        log.error(`Error in !terjual: ${e.message}`);
        return reply(msg, `❌ Gagal memproses penjualan: ${e.message}`);
    }
};

module.exports = { execute };
