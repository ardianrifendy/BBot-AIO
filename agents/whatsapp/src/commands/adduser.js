const db        = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args) => {
    // args: ['!adduser', 'NamaUser']
    if (args.length < 2) {
        return reply(msg, "❌ Format salah. Contoh: !adduser Rina");
    }

    // Gabungkan argumen jika nama pakai spasi
    const name = args.slice(1).join(' ');

    try {
        const result = await db.addUser(name);
        if (result.success) {
            reply(msg, `✅ Pengguna *${name}* berhasil didaftarkan ke sistem stok.`);
        } else {
            reply(msg, `⚠️ Gagal mendaftarkan: ${result.message}`);
        }
    } catch (error) {
        console.error("Gagal menambah user:", error);
        reply(msg, "❌ Terjadi kesalahan saat mendaftarkan user.");
    }
};

module.exports = { execute };
