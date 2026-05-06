const db = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args) => {
    try {
        const data = await db.getAllUsersAndStocks();
        if (!data || data.length === 0) {
            return reply(msg, "📭 Sistem stok masih kosong.");
        }

        // Filter opsional: !l [nama_user] — hanya tampilkan stok user tertentu
        // Contoh: !l ardian | !l okiq | !l (tanpa filter = semua user)
        const filterName = args[1] ? args[1].toLowerCase().trim() : null;

        let responseText = filterName
            ? `📦 *STOK ${filterName.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━\n`
            : "📦 *LAPORAN STOK BARANG*\n━━━━━━━━━━━━━━━━━━\n";

        // Group by user, lalu group by status
        // Jika ada filterName, skip user yang tidak cocok
        const userMap = {};
        for (const row of data) {
            if (filterName && row.user_name.toLowerCase() !== filterName) continue;
            if (!userMap[row.user_name]) {
                userMap[row.user_name] = { ready: [], notReady: [] };
            }
            if (row.item_name) {
                if (row.status === 'Ready') {
                    userMap[row.user_name].ready.push(row.item_name);
                } else {
                    userMap[row.user_name].notReady.push(row.item_name);
                }
            }
        }

        // Jika filter tidak cocok dengan user manapun
        if (Object.keys(userMap).length === 0) {
            return reply(msg, `❌ User *${args[1]}* tidak ditemukan.`);
        }

        let isFirst = true;
        for (const [userName, stocks] of Object.entries(userMap)) {
            if (!isFirst) responseText += '\n';
            isFirst = false;

            responseText += `\n👤 *User: ${userName}*\n`;

            if (stocks.ready.length === 0 && stocks.notReady.length === 0) {
                responseText += `_(Belum ada stok)_\n`;
                continue;
            }

            // Stok Ready — sort A→Z lalu tampilkan
            if (stocks.ready.length > 0) {
                stocks.ready.sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
                responseText += `🟢 *Ready (${stocks.ready.length})*\n`;
                stocks.ready.forEach((item, idx) => {
                    responseText += `${idx + 1}. ${item}\n`;
                });
            }

            // Stok Dalam Pengiriman — sort A→Z lalu tampilkan
            if (stocks.notReady.length > 0) {
                stocks.notReady.sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
                if (stocks.ready.length > 0) responseText += '\n';
                responseText += `🟡 *Dalam Pengiriman (${stocks.notReady.length})*\n`;
                stocks.notReady.forEach((item, idx) => {
                    responseText += `${idx + 1}. ${item}\n`;
                });
            }
        }

        // ── GRAND TOTAL: jumlahkan semua user ─────────────────────────────────
        const grandReady    = Object.values(userMap).reduce((sum, u) => sum + u.ready.length, 0);
        const grandNotReady = Object.values(userMap).reduce((sum, u) => sum + u.notReady.length, 0);
        const grandTotal    = grandReady + grandNotReady;

        responseText += `\n━━━━━━━━━━━━━━━━━━`;
        responseText += `\n📊 *TOTAL KESELURUHAN*`;
        responseText += `\n🟢 Ready        : *${grandReady} item*`;
        responseText += `\n🟡 Pengiriman   : *${grandNotReady} item*`;
        responseText += `\n📦 Grand Total  : *${grandTotal} item*`;
        responseText += `\n━━━━━━━━━━━━━━━━━━`;

        reply(msg, responseText.trim());

    } catch (e) {
        console.error("Gagal menarik laporan:", e);
        reply(msg, "❌ Terjadi kesalahan sistem saat menarik data stok.");
    }
};

module.exports = { execute };
