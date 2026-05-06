const { reply, isUserAdmin } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    const chat = await msg.getChat();

    // Memastikan yang eksekusi ini hanyalah diri sendiri (me), admin grup, atau nomor owner yang diizinkan.
    const allowedUser = '6289513679939@c.us';
    const hasPermission = await isUserAdmin(msg, chat, allowedUser);

    if (!hasPermission) {
        return reply(msg, "❌ Anda tidak memiliki izin untuk merestart bot.");
    }

    await reply(msg, "⚙️ Merestart bot...");

    setTimeout(() => {
        process.exit(0); // Ini akan mematikan proses node. Di environment PM2/nodemon otomatis akan hidup lagi.
    }, 2000);
};

module.exports = { execute };
