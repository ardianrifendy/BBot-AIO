/**
 * ============================================================
 * COMMAND: !cekshopee
 * ============================================================
 * Perintah WhatsApp untuk memantau stok workshirt Von Dutch.
 *
 * Penggunaan:
 *   !cekshopee              → Cek stok sekarang (ukuran default dari .env)
 *   !cekshopee S            → Cek stok ukuran S sekarang
 *   !cekshopee status       → Lihat status monitor otomatis
 *   !cekshopee start        → Aktifkan monitor otomatis
 *   !cekshopee stop         → Hentikan monitor otomatis
 * ============================================================
 */

const shopee  = require('../shopee/shopeeChecker');
const monitor = require('../shopee/shopeeMonitor');
const session = require('../shopee/shopeeSession');

const execute = async (msg, args, client) => {
    const sub = (args[1] || '').toLowerCase();

    // ── Cek login dulu (kecuali command status/start/stop) ───────────────────
    const needsLogin = !['status', 'start', 'stop'].includes(sub);
    if (needsLogin && !session.getIsLoggedIn()) {
        return msg.reply(
            `❌ *Belum login ke Shopee!*\n\n` +
            `Ketik *!loginshopee* untuk login via QR Code dulu.\n` +
            `Setelah login, bot bisa memantau stok otomatis.`
        );
    }

    // ── !cekshopee status ────────────────────────────────────────────────────
    if (sub === 'status') {
        const st = monitor.getStatus();
        const nums = st.notifyNums.join('\n   ');
        const statusIcon = st.active ? '🟢 AKTIF' : '🔴 NONAKTIF';
        const loginIcon  = st.loggedIn ? '✅ Sudah Login' : '❌ Belum Login';

        return msg.reply(
            `📊 *STATUS MONITOR SHOPEE*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🏪 Von Dutch Workshirt\n` +
            `🔐 Login Shopee   : *${loginIcon}*\n` +
            `🎯 Ukuran Target  : *${st.targetSize}*\n` +
            `🔄 Status Monitor : *${statusIcon}*\n` +
            `⏱️  Interval       : *${st.intervalMins} menit*\n` +
            `🔍 Sedang Cek?    : ${st.isChecking ? 'Ya ⏳' : 'Tidak'}\n` +
            `📲 Kirim notif ke :\n   ${nums || '-'}\n\n` +
            (!st.loggedIn
                ? `⚠️  _Ketik *!loginshopee* untuk login dulu._\n`
                : ``) +
            `_Ketik !cekshopee start/stop untuk kontrol monitor_`
        );
    }

    // ── !cekshopee start ─────────────────────────────────────────────────────
    if (sub === 'start') {
        const st = monitor.getStatus();
        if (st.active) {
            return msg.reply(`ℹ️  Monitor Shopee sudah *aktif*.\nInterval: setiap *${st.intervalMins} menit*.`);
        }
        monitor.startMonitor(client);
        return msg.reply(
            `✅ *Monitor Shopee diaktifkan!*\n\n` +
            `🎯 Target: Ukuran *${st.targetSize}* — Von Dutch Workshirt\n` +
            `⏱️  Cek setiap: *${st.intervalMins} menit*\n\n` +
            `_Kamu akan dapat notifikasi WhatsApp jika ada stok!_`
        );
    }

    // ── !cekshopee stop ──────────────────────────────────────────────────────
    if (sub === 'stop') {
        const st = monitor.getStatus();
        if (!st.active) {
            return msg.reply(`ℹ️  Monitor Shopee sudah *nonaktif*.`);
        }
        monitor.stopMonitor();
        return msg.reply(`🔴 *Monitor Shopee dihentikan.*\n\nKetik !cekshopee start untuk mengaktifkan kembali.`);
    }

    // ── !cekshopee [ukuran?] → cek manual sekarang ───────────────────────────
    const targetSize = (args[1] || process.env.SHOPEE_TARGET_SIZE || 'S').toUpperCase();
    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

    if (!validSizes.includes(targetSize) && sub !== '') {
        return msg.reply(
            `❌ Ukuran tidak valid: *${targetSize.toUpperCase()}*\n\n` +
            `Ukuran yang tersedia:\n${validSizes.map(s => `• ${s}`).join('\n')}\n\n` +
            `Contoh: !cekshopee S`
        );
    }

    // Kirim pesan loading
    await msg.reply(
        `⏳ *Mengecek stok ukuran ${targetSize}...*\n` +
        `🏪 Von Dutch Workshirt\n\n` +
        `_Mohon tunggu, sedang scan semua produk..._`
    );

    try {
        const availableItems = await shopee.scanCollectionForSize(targetSize);

        // Buat semua item (available + sold out) untuk laporan lengkap
        const allItemsReport = [];
        // Re-scan dengan mode detail (bisa ditambahkan nanti)
        // Untuk sekarang gunakan availableItems saja
        const msg2 = shopee.formatNotification(availableItems, targetSize);
        await msg.reply(msg2);

    } catch (err) {
        console.error('[CMD:cekshopee]', err);
        await msg.reply(
            `❌ *Gagal cek stok Shopee*\n\n` +
            `Error: ${err.message}\n\n` +
            `_Kemungkinan rate limit. Coba lagi dalam beberapa menit._`
        );
    }
};

module.exports = { execute };
