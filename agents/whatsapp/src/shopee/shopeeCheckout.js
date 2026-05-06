/**
 * shopeeCheckout.js — Auto Checkout via Cart (Keranjang)
 * Flow: Add to Cart semua produk → Checkout dari cart → VA BCA → Order
 */
const fs      = require('fs');
const path    = require('path');
const session = require('./shopeeSession');

const SS_DIR     = path.join(__dirname, '../../data/screenshots');
const ORDERS_LOG = path.join(__dirname, '../../data/orders.json');
const delay      = ms => new Promise(r => setTimeout(r, ms));

function ensureDirs() {
    [SS_DIR, path.dirname(ORDERS_LOG)].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
}

async function ss(page, name) {
    ensureDirs();
    const f = path.join(SS_DIR, `${name}_${Date.now()}.png`);
    await page.screenshot({ path: f, fullPage: false }).catch(() => {});
    console.log(`[CHECKOUT] 📸 ${path.basename(f)}`);
    return f;
}

// ─── Tambah ke keranjang ──────────────────────────────────────────────────────
async function addToCart(productUrl, size) {
    const pg = await session.newPage();
    const result = { productUrl, size, added: false };

    try {
        console.log(`[CART] 🛒 Buka: ${productUrl}`);
        await pg.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);

        // Pilih ukuran
        const sizeOk = await pg.evaluate((size) => {
            const normalize = s => s?.replace(/size|uk\.?|ukuran/gi, '').trim().toUpperCase();
            const target    = normalize(size);
            const selectors = [
                'button.product-variation',
                '[class*="product-variation"]',
                '[class*="variation"] button',
            ];
            let buttons = [];
            for (const sel of selectors) {
                buttons = Array.from(document.querySelectorAll(sel));
                if (buttons.length > 0) break;
            }
            if (!buttons.length) {
                buttons = Array.from(document.querySelectorAll('button')).filter(b =>
                    ['XS','S','M','L','XL','XXL'].includes(b.textContent?.trim().toUpperCase())
                );
            }
            const btn = buttons.find(b => normalize(b.textContent?.trim()) === target);
            if (!btn || btn.disabled || btn.className?.includes('disabled')) return false;
            btn.click();
            return true;
        }, size);

        if (!sizeOk) {
            result.error = `Ukuran ${size} tidak tersedia`;
            return result;
        }
        await delay(1000);

        // Klik "Tambah ke Keranjang"
        const added = await pg.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn  = btns.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return t?.includes('tambah ke keranjang') || t?.includes('add to cart');
            });
            if (btn && !btn.disabled) { btn.click(); return true; }
            return false;
        });

        if (!added) {
            result.error = 'Tombol "Tambah ke Keranjang" tidak ditemukan';
            return result;
        }

        await delay(2000);
        await ss(pg, `added_${size}`);
        result.added = true;
        console.log(`[CART] ✅ Berhasil ditambahkan ke keranjang.`);

    } catch (err) {
        result.error = err.message;
    } finally {
        await pg.close().catch(() => {});
    }

    return result;
}

// ─── Checkout dari Keranjang ──────────────────────────────────────────────────
async function checkoutFromCart(dryRun = true, onStatus) {
    const pg = await session.newPage();
    const result = { success: false, dryRun };

    try {
        // Buka halaman keranjang
        console.log('[CHECKOUT] 🌐 Buka keranjang...');
        await pg.goto('https://shopee.co.id/cart', { waitUntil: 'networkidle2', timeout: 25000 });
        await delay(3000);
        await ss(pg, 'cart_page');

        // Centang semua item di cart
        const selected = await pg.evaluate(() => {
            // Cari checkbox "Pilih Semua"
            const allEls = Array.from(document.querySelectorAll('*'));
            const selectAll = allEls.find(el => {
                const t = el.textContent?.trim().toLowerCase();
                return t === 'pilih semua' || t === 'select all';
            });
            if (selectAll) {
                const cb = selectAll.closest('label')?.querySelector('input[type="checkbox"]')
                    || selectAll.previousElementSibling
                    || selectAll;
                cb.click();
                return true;
            }
            // Fallback: klik semua checkbox individual
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            if (checkboxes.length > 0) {
                checkboxes.forEach(cb => { if (!cb.checked) cb.click(); });
                return checkboxes.length;
            }
            return false;
        });

        console.log(`[CHECKOUT] ☑️  Pilih semua item: ${selected}`);
        await delay(1500);

        // Klik "Checkout"
        const clickedCheckout = await pg.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn  = btns.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return t === 'checkout' || t === 'pesan sekarang';
            });
            if (btn) { btn.click(); return true; }
            return false;
        });

        if (!clickedCheckout) {
            result.error = 'Tombol Checkout tidak ditemukan di keranjang';
            return result;
        }

        console.log('[CHECKOUT] ⏳ Menunggu halaman checkout...');
        try {
            await pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        } catch (_) {}
        await delay(3000);
        await ss(pg, 'checkout_page');
        if (onStatus) onStatus('Halaman checkout terbuka');

        // Verifikasi alamat (gunakan yang pertama/utama — default Shopee)
        console.log('[CHECKOUT] 📍 Menggunakan alamat pengiriman utama (default)...');
        const addr = await pg.evaluate(() => {
            const addrEl = document.querySelector(
                '[class*="address"] [class*="name"], [class*="Address"] [class*="Name"], ' +
                '[data-sqe="address"] span, [class*="shipping-address"]'
            );
            return addrEl?.textContent?.trim() || '(alamat default)';
        });
        console.log(`[CHECKOUT] 📍 Alamat: ${addr}`);

        // Pilih VA BCA
        console.log('[CHECKOUT] 💳 Pilih VA BCA...');
        const payOk = await selectVABCA(pg);
        await ss(pg, 'payment_selected');

        if (!payOk) {
            console.warn('[CHECKOUT] ⚠️  VA BCA tidak terpilih otomatis. Cek browser.');
            if (onStatus) onStatus('⚠️ VA BCA perlu dipilih manual');
        } else {
            if (onStatus) onStatus('✅ VA BCA terpilih');
        }

        // Screenshot final sebelum order
        await ss(pg, 'before_order');

        if (dryRun) {
            console.log('[CHECKOUT] 🧪 DRY RUN — Stop sebelum "Buat Pesanan".');
            result.dryRun  = true;
            result.address = addr;
            result.success = true;
            if (onStatus) onStatus('🧪 DRY RUN selesai — tidak ada pembelian nyata');
            return result;
        }

        // LIVE: Klik "Buat Pesanan"
        console.log('[CHECKOUT] 🔴 Klik "Buat Pesanan"...');
        const ordered = await pg.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn  = btns.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return t === 'buat pesanan' || t === 'place order';
            });
            if (btn && !btn.disabled) { btn.click(); return true; }
            return false;
        });

        if (!ordered) {
            result.error = 'Tombol "Buat Pesanan" tidak ditemukan';
            return result;
        }

        await delay(5000);
        await ss(pg, 'order_confirmed');

        const orderId = await pg.evaluate(() => {
            const all = Array.from(document.querySelectorAll('*'));
            const el  = all.find(e => e.children.length === 0 && /^\d{12,}$/.test(e.textContent?.trim()));
            return el?.textContent?.trim() || null;
        });

        result.success = true;
        result.orderId = orderId;
        result.address = addr;
        console.log(`[CHECKOUT] ✅ Pesanan berhasil! ID: ${orderId || '-'}`);
        if (onStatus) onStatus(`✅ Pesanan berhasil! ID: ${orderId || '-'}`);

        // Simpan log
        ensureDirs();
        let orders = [];
        if (fs.existsSync(ORDERS_LOG)) {
            try { orders = JSON.parse(fs.readFileSync(ORDERS_LOG, 'utf8')); } catch (_) {}
        }
        orders.push({ orderId, address: addr, payment: 'VA BCA', timestamp: new Date().toISOString() });
        fs.writeFileSync(ORDERS_LOG, JSON.stringify(orders, null, 2));

    } catch (err) {
        result.error = err.message;
        console.error('[CHECKOUT] ❌', err.message);
        await ss(pg, 'error').catch(() => {});
    } finally {
        await pg.close().catch(() => {});
    }

    return result;
}

// ─── Pilih VA BCA ─────────────────────────────────────────────────────────────
async function selectVABCA(page) {
    // Coba klik tombol ganti/ubah pembayaran
    await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('button, a, div'));
        const changeBtn = allEls.find(el => {
            const t = el.textContent?.trim().toLowerCase();
            return (t === 'ganti' || t === 'ubah' || t === 'pilih') &&
                   el.closest('[class*="payment"], [class*="Payment"]');
        });
        if (changeBtn) changeBtn.click();
    });
    await delay(2000);

    // Cari opsi VA BCA
    const clicked = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('*'));
        const bcaEl  = allEls.find(el => {
            const t = (el.innerText || el.textContent || '').toLowerCase();
            return (t.includes('bca') || t.includes('bank central asia')) &&
                   (t.includes('virtual') || t.includes('va') || t.includes('transfer'));
        });
        if (!bcaEl) return false;
        const clickable = bcaEl.closest('label') || bcaEl.closest('li') ||
                          bcaEl.closest('[class*="item"]') || bcaEl;
        clickable.click();
        return true;
    });

    if (clicked) {
        await delay(1500);
        // Konfirmasi jika ada tombol
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const ok   = btns.find(b => {
                const t = b.textContent?.trim().toLowerCase();
                return ['pilih', 'konfirmasi', 'simpan', 'ok', 'selesai'].includes(t);
            });
            if (ok) ok.click();
        });
        await delay(1000);
    }

    return clicked;
}

// ─── Format laporan WA ────────────────────────────────────────────────────────
function formatReport(addResults, checkoutResult, size, dryRun) {
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' });
    const added   = addResults.filter(r => r.added).length;
    const failed  = addResults.filter(r => !r.added).length;

    let itemLines = '';
    for (const r of addResults) {
        itemLines += `${r.added ? '✅' : '❌'} _${r.productUrl.split('/').pop()}_`;
        if (r.error) itemLines += ` → ${r.error}`;
        itemLines += '\n';
    }

    const coStatus = checkoutResult?.success
        ? (dryRun ? '🧪 Dry Run OK' : `✅ Pesanan dibuat!\nID: ${checkoutResult.orderId || '-'}`)
        : `❌ ${checkoutResult?.error || 'Gagal'}`;

    return (
        `🛒 *AUTO CHECKOUT SHOPEE*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👕 Ukuran: *${size}* | Von Dutch Workshirt\n` +
        `💳 Bayar: *VA BCA*\n` +
        `🧪 Mode: *${dryRun ? 'DRY RUN' : '🔴 LIVE'}*\n\n` +
        `📦 *Keranjang (${added}/${addResults.length} ditambahkan):*\n` +
        itemLines + '\n' +
        `💳 *Checkout:*\n${coStatus}\n\n` +
        `📍 Alamat: ${checkoutResult?.address || '-'}\n` +
        `🕐 ${now}`
    );
}

module.exports = {
    addToCart,
    checkoutFromCart,
    selectVABCA,
    formatReport,
    SS_DIR,
    ORDERS_LOG,
};
