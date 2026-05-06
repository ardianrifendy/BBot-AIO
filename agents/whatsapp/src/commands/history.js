const db = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    const userJid = msg.from;

    try {
        const histories = await db.getHistory(userJid);

        if (histories.length === 0) {
            return reply(msg, "📭 Sedih, histori Anda masih kosong.");
        }

        let textResponse = "📝 *HISTORI TRACKING ANDA*\n\n";

        // Batasi maksimal 20 history agar pesan tidak terlalu panjang
        const displayLimit = 20;
        const displayHistories = histories.slice(-displayLimit); // ambil 20 terakhir

        displayHistories.forEach((h, i) => {
            textResponse += `*${i + 1}.* [${h.courier.toUpperCase()}] ${h.awb}\n`;
        });
        textResponse += "\n_Gunakan !ch <nomor> untuk cek ulang._\n_Contoh: !ch 1 atau !ch 1,2_";

        if (histories.length > displayLimit) {
            textResponse += `\n_(Menampilkan ${displayLimit} history terbaru dari total ${histories.length})_`;
        }

        reply(msg, textResponse);
    } catch (error) {
        reply(msg, "❌ Gagal mengambil histori.");
    }
};

module.exports = { execute };
