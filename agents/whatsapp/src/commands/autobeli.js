/**
 * Command: !autobeli
 * Scan workshirt ukuran M → add to cart → checkout VA BCA → kirim laporan ke WA
 *
 * !autobeli          → DRY RUN ukuran M
 * !autobeli live     → LIVE checkout
 * !autobeli M live   → explicit ukuran + live
 */
const session  = require('../shopee/shopeeSession');
const shopee   = require('../shopee/shopeeChecker');
const checkout = require('../shopee/shopeeCheckout');

const execute = async (msg, args, client) => {
    const isLive  = args.some(a => a.toLowerCase() === 'live');
    const dryRun  = !isLive;
    const sizeArg = args.find(a => ['XS','S','M','L','XL','XXL'].includes(a.toUpperCase()));
    const size    = sizeArg?.toUpperCase() || process.env.SHOPEE_TARGET_SIZE || 'M';

    // Cek login
    if (!session.getIsLoggedIn()) {
        return msg.reply(
            `❌ *Belum login Shopee!*\n\nKetik *!loginshopee* dulu.`
        );
    }

    await msg.reply(
        `🛒 *AUTO CHECKOUT DIMULAI*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👕 Ukuran: *${size}*\n` +
        `💳 Bayar: *VA BCA*\n` +
        `🧪 Mode: *${dryRun ? 'DRY RUN (tidak jadi beli)' : '🔴 LIVE'}*\n\n` +
        `_Proses berjalan... tunggu notifikasi hasil._`
    );

    // Jalankan di background
    setImmediate(async () => {
        try {
            // 1. Scan stok
            await client.sendMessage(msg.from, `🔍 Scanning stok ukuran ${size}...`);
            const items = await shopee.scanCollectionForSize(size);

            if (items.length === 0) {
                return client.sendMessage(msg.from,
                    `❌ Tidak ada stok ukuran ${size} saat ini.\nBot akan notif jika ada stok.`
                );
            }

            await client.sendMessage(msg.from,
                `✅ Ditemukan *${items.length}* produk stok ${size}.\n🛒 Menambahkan ke keranjang...`
            );

            // 2. Add to cart
            const addResults = [];
            for (const item of items.slice(0, 10)) {
                const r = await checkout.addToCart(item.url, size);
                r.productName = item.name;
                addResults.push(r);
            }

            const ok = addResults.filter(r => r.added).length;
            await client.sendMessage(msg.from,
                `📦 *${ok}/${items.length}* berhasil masuk keranjang.\n💳 Proses checkout...`
            );

            if (ok === 0) {
                return client.sendMessage(msg.from, `❌ Tidak ada produk berhasil ke keranjang.`);
            }

            // 3. Checkout
            const coResult = await checkout.checkoutFromCart(dryRun, async (status) => {
                try { await client.sendMessage(msg.from, `⏳ ${status}`); } catch (_) {}
            });

            // 4. Kirim laporan
            const report = checkout.formatReport(addResults, coResult, size, dryRun);
            await client.sendMessage(msg.from, report);

        } catch (err) {
            await client.sendMessage(msg.from,
                `❌ *Error Auto Checkout*\n\n${err.message}\n\nCoba lagi dengan *!autobeli*`
            ).catch(() => {});
        }
    });
};

module.exports = { execute };
