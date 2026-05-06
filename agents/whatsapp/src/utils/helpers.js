/**
 * Helper module for WhatsApp Bot
 */

/**
 * Memeriksa apakah pengirim pesan adalah Admin grup, Bot itu sendiri (fromMe), 
 * atau User spesifik yang diizinkan.
 * 
 * @param {Object} msg - Object pesan dari whatsapp-web.js
 * @param {Object} chat - Object chat dari whatsapp-web.js
 * @param {string} allowedUser - Nomor spesifik yang diizinkan (contoh: '628951...0@c.us')
 * @returns {boolean} - True jika diizinkan
 */
const isUserAdmin = async (msg, chat, allowedUser = '') => {
    const sender = msg.author || msg.from;

    // Jika dari bot itu sendiri atau dari nomor yang diizinkan khusus
    let isAuthorized = msg.fromMe || (allowedUser && sender === allowedUser);

    // Jika di grup, cek apakah user admin/superadmin grup
    if (chat.isGroup && !isAuthorized) {
        try { await chat.fetchParticipants?.(); } catch (_) {}
        const participant = (chat.participants || []).find(p => p.id._serialized === sender);
        if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
            isAuthorized = true;
        }
    }

    return isAuthorized;
};

/**
 * Membalas pesan secara aman
 * 
 * @param {Object} msg - Object pesan dari whatsapp-web.js
 * @param {string} text - Teks balasan
 */
const reply = async (msg, text) => {
    try {
        await msg.reply(text);
    } catch (error) {
        console.error('Gagal membalas pesan:', error);
    }
};

module.exports = {
    isUserAdmin,
    reply
};
