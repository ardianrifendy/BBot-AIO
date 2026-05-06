const sheets = require('../../../../core/googleSheets');
const { SHEETS } = require('../../../../core/sheetConstants');
const { reply } = require('../utils/helpers');

/**
 * !omzet [bulan] [user]
 * Contoh: !omzet
 * Contoh: !omzet 04
 * Contoh: !omzet 04 Ardian
 */
const execute = async (msg, args) => {
    try {
        const [txs, users] = await Promise.all([
            sheets.getAll(SHEETS.TRANSACTIONS),
            sheets.getAll(SHEETS.USERS)
        ]);

        if (txs.length === 0) return reply(msg, '📭 Belum ada data penjualan.');

        const now = new Date();
        const arg1 = (args[1] || '').toLowerCase();
        const arg2 = (args[2] || '').toLowerCase();

        // Resolving Month
        let targetMonth = (now.getMonth() + 1).toString().padStart(2, '0');
        if (arg1 && !isNaN(parseInt(arg1)) && arg1.length <= 2) {
            targetMonth = arg1.padStart(2, '0');
        }

        // Resolving User
        let targetUser = null;
        if (arg2) {
            targetUser = users.find(u => u.name.toLowerCase() === arg2);
        } else if (arg1 && isNaN(parseInt(arg1))) {
            // Jika arg1 bukan angka, asumsikan itu nama user (misal: !omzet Ardian)
            targetUser = users.find(u => u.name.toLowerCase() === arg1);
            targetMonth = (now.getMonth() + 1).toString().padStart(2, '0'); // Reset ke bulan ini
        }

        const targetYear = now.getFullYear().toString();

        const filtered = txs.filter(t => {
            const d = new Date(t.date);
            const mMatch = (d.getMonth() + 1).toString().padStart(2, '0') === targetMonth && d.getFullYear().toString() === targetYear;
            const uMatch = targetUser ? String(t.user_id) === String(targetUser.id) : true;
            return mMatch && uMatch;
        });

        const userTitle = targetUser ? ` *(${targetUser.name})*` : '';
        if (filtered.length === 0) {
            return reply(msg, `📭 Tidak ada penjualan${userTitle} di bulan *${targetMonth}/${targetYear}*.`);
        }

        const totalOmzet = filtered.reduce((s, t) => s + (parseInt(t.harga_jual) || 0), 0);
        
        let report = `💰 *OMZET ${targetMonth}/${targetYear}${userTitle.toUpperCase()}*\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        filtered.slice(-10).forEach((t, i) => {
            const d = new Date(t.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            report += `${i + 1}. [${d}] *${t.item_name}*\n`;
            report += `   💰 Rp ${(parseInt(t.harga_jual) || 0).toLocaleString('id-ID')} | 🤝 ${t.pembeli || '-'}\n\n`;
        });

        if (filtered.length > 10) {
            report += `_...dan ${filtered.length - 10} transaksi lainnya._\n\n`;
        }

        report += `📊 *Ringkasan:* \n`;
        report += `• Total Unit: *${filtered.length}*\n`;
        report += `• Total Omzet: *Rp ${totalOmzet.toLocaleString('id-ID')}*\n\n`;
        report += `_Detail lengkap cek di Dashboard._`;

        return reply(msg, report);

    } catch (e) {
        return reply(msg, `❌ Gagal mengambil data: ${e.message}`);
    }
};

module.exports = { execute };
