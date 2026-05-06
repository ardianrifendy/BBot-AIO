/**
 * ADMIN GUARD — Shared Admin Authorization Utility
 *
 * Hierarki izin:
 *  1. msg.fromMe         — pesan dari bot sendiri
 *  2. ADMIN_NUMBERS env  — nomor hardcoded di .env
 *  3. Admin/SuperAdmin grup WhatsApp
 */

const dotenv = require('dotenv');
dotenv.config();

const DENIED_MSG =
    `🔒 *Akses Ditolak*\n` +
    `Perintah ini hanya bisa digunakan oleh *admin*.\n` +
    `_Hubungi admin grup jika ada pertanyaan._`;

/**
 * @param {Object} msg   - Objek pesan whatsapp-web.js
 * @param {Object} chat  - Objek chat (hasil getChat())
 * @returns {boolean}
 */
const checkAdmin = async (msg, chat) => {
    // Ambil semua kemungkinan identifier pengirim
    const sender      = msg.author || msg.from || '';
    const senderClean = sender.replace('@c.us', '').replace('@s.whatsapp.net', '');

    // DEBUG — hapus baris ini setelah konfirmasi berfungsi
    console.log(`[ADMIN_CHECK] sender="${sender}" | fromMe=${msg.fromMe} | isGroup=${chat?.isGroup}`);

    // 1. Pesan dari bot sendiri
    if (msg.fromMe) return true;

    // 2. Terdaftar di ADMIN_NUMBERS di .env
    //    Normalisasi: strip @c.us dari kedua sisi agar tidak ada mismatch format
    const adminRaw = (process.env.ADMIN_NUMBERS || '').split(',');
    const adminList = adminRaw.map(n => n.trim().replace('@c.us', '').replace('@s.whatsapp.net', '')).filter(n => n.length > 0);

    if (adminList.includes(senderClean)) {
        console.log(`[ADMIN_CHECK] ✅ Lolos via ADMIN_NUMBERS (${senderClean})`);
        return true;
    }

    // 3. Admin/SuperAdmin grup WhatsApp
    if (chat && chat.isGroup) {
        try { await chat.fetchParticipants?.(); } catch (_) {}

        const participant = (chat.participants || []).find(
            p => p.id._serialized === sender ||
                 p.id._serialized === `${senderClean}@c.us` ||
                 p.id._serialized === `${senderClean}@s.whatsapp.net`
        );

        if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
            console.log(`[ADMIN_CHECK] ✅ Lolos via Group Admin (${senderClean})`);
            return true;
        }
    }

    console.log(`[ADMIN_CHECK] ❌ Ditolak (${senderClean})`);
    return false;
};

module.exports = { checkAdmin, DENIED_MSG };
