/**
 * ============================================================
 * COMMAND: !addtrack [user] [nomorstok] [kurir] [AWB] (opsional: [HP])
 * ============================================================
 * Menghubungkan nomor resi ke item stok yang berstatus Di Jalan.
 * Scheduler akan otomatis memantau resi ini setiap jam dan:
 *   - Mengirim notifikasi jika status berubah
 *   - Memindahkan stok ke Ready jika sudah Delivered
 *
 * Contoh:
 *   !addtrack Ardian 5 jnt 987654321
 *   !addtrack Ardian 7 jne JX12345678 89123
 *
 * Perintah terkait:
 *   !listtrack [user]          → lihat semua resi yang dipantau
 *   !removetrack [user] [no]   → hapus track dari item stok
 * ============================================================
 */

const db         = require('../db');
const { reply }  = require('../utils/helpers');
const { normalizeKurir, getKurirExamples } = require('../kurirMapper');
const binderbyte = require('../binderbyte');

const FOOTER = '\n\n_— *Bagaskara Cell* 📦_';

const execute = async (msg, args) => {
    // ── Validasi argumen minimum: !addtrack [user] [no] [kurir] [awb] ─────────
    if (args.length < 5) {
        return reply(msg,
            `❌ *Format tidak lengkap.*\n\n` +
            `*Penggunaan:*\n` +
            `\`!addtrack [user] [nomor stok] [kurir] [resi]\`\n\n` +
            `*Contoh:*\n` +
            `• \`!addtrack Ardian 5 jnt 987654321\`\n` +
            `• \`!addtrack Ardian 7 jne JX12345 89123\` _(JNE +5 digit HP)_\n\n` +
            `💡 Nomor stok = urutan nomor di \`!l [nama]\`` +
            FOOTER
        );
    }

    const userName = args[1];
    const stockNo  = parseInt(args[2]);
    const rawKurir = args[3];
    const awb      = args[4];
    const hp       = args[5] || '';

    // ── Validasi nomor stok ───────────────────────────────────────────────────
    if (isNaN(stockNo) || stockNo < 1) {
        return reply(msg, `❌ Nomor stok tidak valid: \`${args[2]}\``);
    }

    // ── Normalisasi kurir (anti-typo) ─────────────────────────────────────────
    const { code: kurirCode, isValid } = normalizeKurir(rawKurir);
    if (!isValid) {
        return reply(msg,
            `❌ *Kurir tidak dikenali:* \`${rawKurir}\`\n` +
            `Gunakan: _${getKurirExamples()}_` +
            FOOTER
        );
    }

    // ── Validasi khusus JNE ───────────────────────────────────────────────────
    if (kurirCode === 'jne' && (!hp || hp.trim().length < 5)) {
        return reply(msg,
            `📋 *Info Penting untuk JNE*\n\n` +
            `Tracking JNE memerlukan 5 digit terakhir No HP penerima.\n` +
            `\`!addtrack ${userName} ${stockNo} jne [AWB] [5-digit-HP]\`` +
            FOOTER
        );
    }

    try {
        // ── Temukan user ──────────────────────────────────────────────────────
        const user = await db.getUserByName(userName);
        if (!user) {
            return reply(msg, `❌ User *${userName}* tidak ditemukan.` + FOOTER);
        }

        // ── Ambil HANYA stok Di Jalan (Not Ready) — sorted A→Z ───────────────
        const rawStocks  = await db.getStocksByUser(user.id);
        const diJalan    = rawStocks
            .filter(s => s.status !== 'Ready')
            .sort((a, b) => a.item_name.localeCompare(b.item_name, 'id', { sensitivity: 'base' }));

        if (diJalan.length === 0) {
            return reply(msg,
                `📭 User *${user.name}* tidak memiliki stok *Di Jalan*.\n` +
                `_(Semua barang sudah berstatus Ready)_` +
                FOOTER
            );
        }

        // ── Validasi nomor (mengacu ke list Di Jalan saja) ───────────────────
        const stock = diJalan[stockNo - 1];
        if (!stock) {
            return reply(msg,
                `❌ Nomor *${stockNo}* tidak ditemukan di daftar Di Jalan *${user.name}*.\n` +
                `_(Total Di Jalan: ${diJalan.length} item — gunakan \`!l ${userName}\` untuk melihat nomor)_` +
                FOOTER
            );
        }

        // ── Validasi resi ke API Binderbyte sebelum disimpan ─────────────────
        await reply(msg, `⏳ Memvalidasi resi *${awb}* ke server ekspedisi...`);

        let initialStatus = '';
        try {
            const trackData = await binderbyte.trackReceipt(awb, kurirCode, hp);
            initialStatus   = trackData?.summary?.status || '';
        } catch (apiErr) {
            return reply(msg,
                `❌ *Resi tidak valid atau tidak ditemukan.*\n\n` +
                `*Kurir:* ${kurirCode.toUpperCase()}\n` +
                `*Resi:* \`${awb}\`\n\n` +
                `_${apiErr.message}_\n\n` +
                `💡 Pastikan nomor resi dan kurir sudah benar.` +
                FOOTER
            );
        }

        // ── Simpan ke StockTracks ─────────────────────────────────────────────
        const addedByJid = msg.author || msg.from;
        const result = await db.addStockTrack(
            stock.id,
            user.name,
            stock.item_name,
            kurirCode,
            awb,
            hp,
            addedByJid
        );

        const action = result.replaced ? '🔄 Diperbarui' : '✅ Ditambahkan';

        return reply(msg,
            `${action} tracking resi!\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `👤 User   : *${user.name}*\n` +
            `📦 Barang : *${stock.item_name}*\n` +
            `🚚 Kurir  : *${kurirCode.toUpperCase()}*\n` +
            `📋 Resi   : \`${awb}\`\n\n` +
            `💡 _Scheduler akan memantau resi ini setiap jam._\n` +
            `_Anda akan mendapat notifikasi jika status berubah._\n` +
            `_Stok otomatis pindah ke Ready jika paket Delivered._` +
            FOOTER
        );

    } catch (e) {
        console.error('[ADDTRACK] Error:', e);
        return reply(msg, `❌ Terjadi kesalahan: ${e.message}` + FOOTER);
    }
};

module.exports = { execute };
