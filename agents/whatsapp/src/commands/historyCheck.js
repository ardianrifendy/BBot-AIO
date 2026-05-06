const db = require('../db');
const binderbyte = require('../binderbyte');
const { reply } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    const userJid = msg.from;
    const targetStr = args[1];

    if (!targetStr) return reply(msg, "❌ Format salah. Contoh: !ch 1 atau !ch 1,2,3");

    try {
        const histories = await db.getHistory(userJid);
        if (histories.length === 0) return reply(msg, "📭 Histori Anda kosong.");

        const targets = targetStr.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        let trackRequests = [];

        // Note: For history display, we display the last N, but indexes here are absolute 1-N from DB currently.
        // If we sliced in history.js, user will input based on the sliced display. We must ensure consistency.
        // Assuming user inputs the 1-indexed value shown in history.js
        const displayLimit = 20;
        const displayHistories = histories.slice(-displayLimit);

        targets.forEach(t => {
            const idx = t - 1;
            if (displayHistories[idx]) {
                trackRequests.push({
                    courier: displayHistories[idx].courier,
                    awb: displayHistories[idx].awb,
                    hp: displayHistories[idx].hp
                });
            }
        });

        if (trackRequests.length === 0) {
            return reply(msg, "❌ Nomor histori tidak ditemukan.");
        }

        await reply(msg, `⏳ Mengecek ulang ${trackRequests.length} resi dari histori...`);

        let results = [];
        for (const req of trackRequests) {
            try {
                const data = await binderbyte.trackReceipt(req.awb, req.courier, req.hp);
                results.push(binderbyte.formatTrackingResult(data));

                // Update cron if delivered
                if (data.summary.status.toLowerCase() !== 'delivered') {
                    await db.addActiveTrack(userJid, data.summary.courier, data.summary.awb, req.hp, data.summary.status);
                } else {
                    await db.removeActiveTrack(userJid, data.summary.courier, data.summary.awb);
                }

            } catch (error) {
                results.push(`❌ Gagal melacak kurir ${req.courier.toUpperCase()} resi ${req.awb}: ${error.message}`);
            }
        }

        for (const res of results) {
            await reply(msg, res);
        }

    } catch (error) {
        reply(msg, "❌ Gagal memproses data histori.");
    }
};

module.exports = { execute };
