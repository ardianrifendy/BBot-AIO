const { reply } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    let chat;

    // ── Step 1: Ambil objek chat ──────────────────────────────────────────────
    try {
        chat = await msg.getChat();
    } catch (e) {
        console.error('[CLEAR] Gagal getChat():', e.message);
        return reply(msg, '❌ Tidak dapat mengakses chat ini.');
    }

    // ── Step 2: Fetch pesan terakhir ──────────────────────────────────────────
    let messages = [];
    try {
        messages = await chat.fetchMessages({ limit: 50 });
    } catch (e) {
        console.error('[CLEAR] Gagal fetchMessages():', e.message);
        try { if (msg.fromMe) await msg.delete(true); } catch (_) {}
        return reply(msg, '❌ Gagal mengambil pesan. Coba lagi beberapa saat.');
    }

    // ── Step 3: Filter pesan yang akan dihapus ────────────────────────────────
    // Kriteria hapus:
    //   a) Pesan dari bot (fromMe = true)
    //   b) Pesan dari siapapun yang isinya diawali '!' (perintah bot)
    const toDelete = messages.filter(m => {
        if (m.fromMe) return true;                      // pesan dari bot
        const body = (m.body || '').trim();
        return body.startsWith('!');                    // perintah user ke bot
    });

    if (toDelete.length === 0) {
        return reply(msg, '📭 Tidak ada pesan bot atau perintah yang bisa dihapus.');
    }

    console.log(`[CLEAR] ${toDelete.length} pesan akan dihapus (bot + perintah user).`);

    // ── Step 4: Hapus satu per satu ───────────────────────────────────────────
    let deletedCount = 0;
    for (const m of toDelete) {
        try {
            // delete(true) = revoke untuk semua (hanya work < 60 menit)
            await m.delete(true);
            deletedCount++;
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            // Pesan terlalu lama / tidak bisa di-revoke — skip tanpa crash
            console.warn(`[CLEAR] Skip:`, e.message);
        }
    }

    // ── Step 5: Hapus pesan command !c itu sendiri ────────────────────────────
    try { if (msg.fromMe) await msg.delete(true); } catch (_) {}

    // ── Step 6: Konfirmasi singkat, auto-hapus 3 detik ───────────────────────
    try {
        const confirmMsg = await msg.reply(`✅ *${deletedCount}* pesan dihapus (bot + perintah).`);
        if (confirmMsg) {
            setTimeout(async () => {
                try { await confirmMsg.delete(true); } catch (_) {}
            }, 3000);
        }
    } catch (_) {}

    console.log(`[CLEAR] Selesai. ${deletedCount}/${toDelete.length} pesan dihapus.`);
};

module.exports = { execute };
