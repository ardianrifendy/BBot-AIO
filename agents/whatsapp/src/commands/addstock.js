const db        = require('../db');
const { reply } = require('../utils/helpers');

const execute = async (msg, args, client, text, lines) => {
    const isMultiLine = lines.length > 1;

    // Untuk parsing, kita butuh tahu command ini dipanggil untuk status apa.
    // addready / tambahready -> Ready
    // addnotready / tambahdijalan -> Not Ready
    const commandName = args[0].toLowerCase();
    const status = (commandName === '!addready' || commandName === '!tambahready') ? 'Ready' : 'Not Ready';
    const statusLabel = status === 'Ready' ? '🟢 Ready' : '🟡 Dalam Pengiriman';

    let userName = '';
    let items = [];

    if (isMultiLine) {
        // !addready Rina
        // Kipas Angin
        // Setrika
        if (args.length < 2) return reply(msg, "❌ Format salah. Tulis nama user di baris yang sama dengan perintah.");

        // Asumsi format baris 1: !addready Rina
        // Atau !addready Rina A.
        // Kita butuh ekstrak nama user dari firstLine. Karena args bisa lebih dari 2.
        userName = args.slice(1).join(' ');

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() !== '') {
                items.push(lines[i].trim());
            }
        }
    } else {
        // !addready Rina Kipas Angin Turbo
        if (args.length < 3) {
            return reply(msg, `❌ Format salah. Contoh: ${commandName} Rina Kipas Angin`);
        }
        userName = args[1]; // Jika diketik sebaris, kita paksa argumen ke-2 SEBAGAI NAMA secara penuh. Kata selanjutnya adalah item
        // Maka kata barang adalah argumen index 2 keatas
        const itemName = args.slice(2).join(' ');
        items.push(itemName);
    }

    if (items.length === 0) {
        return reply(msg, "❌ Tidak ada barang yang terbaca.");
    }

    try {
        // Verifikasi User
        const user = await db.getUserByName(userName);
        if (!user) {
            return reply(msg, `❌ User *${userName}* belum terdaftar. Silakan daftar menggunakan perintah !adduser ${userName}`);
        }

        // Tambahkan semua barang
        let addedCount = 0;
        for (const item of items) {
            await db.addStock(user.id, item, status);
            addedCount++;
        }

        if (items.length === 1) {
            reply(msg, `${status === 'Ready' ? '🟢' : '🟡'} [${user.name}] Berhasil menambahkan *${items[0]}* ke stok ${statusLabel}.`);
        } else {
            reply(msg, `${status === 'Ready' ? '🟢' : '🟡'} [${user.name}] Berhasil menambahkan *${addedCount} item* ke stok ${statusLabel}.`);
        }

    } catch (e) {
        console.error("Gagal menambah stok:", e);
        reply(msg, "❌ Terjadi kesalahan saat memproses penambahan stok barang.");
    }
};

module.exports = { execute };
