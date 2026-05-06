/**
 * ============================================================
 * COMMAND: !loginshopee
 * ============================================================
 * Login Shopee via QR Code dari WhatsApp.
 *
 * Penggunaan:
 *   !loginshopee        → Mulai proses login (buka browser + scan QR)
 *   !loginshopee status → Cek apakah sudah login
 *   !loginshopee logout → Hapus session (logout)
 * ============================================================
 */

const session = require('../shopee/shopeeSession');

const execute = async (msg, args, client) => {
    const sub = (args[1] || '').toLowerCase();

    // ── !loginshopee status ──────────────────────────────────────────────────
    if (sub === 'status') {
        const loggedIn = session.getIsLoggedIn();
        return msg.reply(
            `🔐 *STATUS LOGIN SHOPEE*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Status: ${loggedIn ? '✅ *Sudah Login*' : '❌ *Belum Login*'}\n\n` +
            (loggedIn
                ? `_Session aktif. Bot siap cek stok Shopee._\n\nKetik *!cekshopee* untuk cek stok.`
                : `_Ketik *!loginshopee* untuk login via QR._`)
        );
    }

    // ── !loginshopee logout ──────────────────────────────────────────────────
    if (sub === 'logout') {
        session.clearSession();
        await session.close();
        return msg.reply(
            `🔓 *Logout Shopee berhasil.*\n\n` +
            `Session dihapus. Ketik *!loginshopee* untuk login kembali.`
        );
    }

    // ── !loginshopee → Mulai QR login ─────────────────────────────────────────
    if (session.getIsLoggedIn()) {
        return msg.reply(
            `ℹ️  Sudah login ke Shopee.\n\n` +
            `Ketik *!loginshopee logout* jika ingin login ulang.\n` +
            `Ketik *!cekshopee* untuk cek stok.`
        );
    }

    await msg.reply(
        `🔐 *MULAI LOGIN SHOPEE*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `⏳ Sedang membuka browser...\n\n` +
        `_Browser Shopee akan terbuka di komputer kamu._\n` +
        `_Buka aplikasi Shopee → Profil → Ikon Kamera → Scan QR_\n\n` +
        `⏱️  Batas waktu scan: *3 menit*`
    );

    console.log('[SHOPEE] 🔐 Memulai QR login via perintah WhatsApp...');

    // Jalankan di background (non-blocking) agar WA tidak freeze
    setImmediate(async () => {
        try {
            const success = await session.loginWithQR(
                // onQR: browser sudah terbuka, QR tampil
                async () => {
                    try {
                        await client.sendMessage(msg.from,
                            `📷 *Browser Shopee sudah terbuka!*\n\n` +
                            `👇 *Cara scan QR:*\n` +
                            `1. Buka aplikasi Shopee di HP\n` +
                            `2. Tap ikon 📷 di pojok kanan atas\n` +
                            `3. Arahkan kamera ke QR di layar komputer\n\n` +
                            `⏱️  Sisa waktu: *3 menit*`
                        );
                    } catch (_) {}
                },
                // onReady: login berhasil
                async () => {
                    try {
                        await client.sendMessage(msg.from,
                            `✅ *Login Shopee Berhasil!*\n\n` +
                            `🏪 Akun tersambung & session tersimpan.\n` +
                            `🤖 Bot siap memantau stok workshirt!\n\n` +
                            `Ketik *!cekshopee* untuk cek stok sekarang.\n` +
                            `Ketik *!cekshopee start* untuk aktifkan monitor otomatis.`
                        );
                    } catch (_) {}
                }
            );

            if (!success) {
                await client.sendMessage(msg.from,
                    `❌ *Login Timeout atau Gagal*\n\n` +
                    `QR tidak di-scan dalam 3 menit.\n` +
                    `Ketik *!loginshopee* untuk mencoba lagi.`
                ).catch(() => {});
            }

        } catch (err) {
            console.error('[SHOPEE LOGIN]', err.message);
            await client.sendMessage(msg.from,
                `❌ *Terjadi Error saat Login*\n\n` +
                `${err.message}\n\n` +
                `Coba lagi dengan *!loginshopee*`
            ).catch(() => {});
        }
    });
};

module.exports = { execute };
