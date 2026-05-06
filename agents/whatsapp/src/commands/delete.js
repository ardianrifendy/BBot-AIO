const { reply, isUserAdmin } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    if (!msg.hasQuotedMsg) {
        return reply(msg, "❌ Silakan reply profil/pesan yang ingin dihapus dengan perintah ini.");
    }

    try {
        const quotedMsg = await msg.getQuotedMessage();
        const chat = await msg.getChat();

        // Cek apakah di grup dan apakah bot admin jika pesan bukan milik bot (fromMe)
        if (chat.isGroup && !quotedMsg.fromMe) {
            // Gunakan helper khusus ngecek admin
            const allowedUser = '';
            const isAuthorized = await isUserAdmin(msg, chat, allowedUser);
            if (!isAuthorized) {
                return reply(msg, "❌ Bot membutuhkan hak Admin untuk menghapus pesan orang lain.");
            }
        }

        // delete(true) berarti delete for everyone
        await quotedMsg.delete(true);

        // Opsional: Hapus perintah !d nya juga biar rapi
        if (msg.fromMe) {
            await msg.delete(true);
        }
    } catch (error) {
        console.error("Gagal menghapus pesan:", error);
        reply(msg, "❌ Gagal menghapus pesan. Pastikan pesan tidak terlalu lama.");
    }
};

module.exports = { execute };
