/**
 * shopeeChecker.js — Stock checker via DOM scraping (session-based)
 * Fix: gunakan scraping halaman koleksi langsung untuk dapat semua produk + stok
 */

const session = require('./shopeeSession');

const SHOPEE_CONFIG = {
    shopId       : 228625083,
    collectionId : 248056249,
    shopUsername : 'vondutchofficial',
    collectionUrl: 'https://shopee.co.id/vondutchofficial?shopCollection=248056249#product_list',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Auto-scroll halaman ──────────────────────────────────────────────────────
async function autoScroll(page, maxMs = 12000) {
    await page.evaluate(async (maxMs) => {
        await new Promise(resolve => {
            let last = 0;
            const t  = Date.now();
            const id = setInterval(() => {
                window.scrollBy(0, 500);
                const h = document.body.scrollHeight;
                if (h === last || Date.now() - t > maxMs) { clearInterval(id); resolve(); }
                last = h;
            }, 500);
        });
    }, maxMs);
}

// ─── Scrape daftar produk dari halaman koleksi ────────────────────────────────
async function scrapeCollectionItems() {
    const pg = await session.newPage();
    const items = [];

    try {
        console.log('[SHOPEE] 🌐 Buka halaman koleksi workshirt...');
        await pg.goto(SHOPEE_CONFIG.collectionUrl, { waitUntil: 'networkidle2', timeout: 35000 });
        await delay(6000);

        // ── Handle halaman "Pilih bahasa Anda" jika muncul ───────────────────
        let curUrl = pg.url();
        if (curUrl.includes('/verify/traffic') || curUrl.includes('language') ||
            await pg.evaluate(() => !!document.querySelector('button')?.textContent?.includes('Bahasa'))) {

            const btnFound = await pg.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, a'));
                const btn  = btns.find(b => b.textContent?.trim() === 'Bahasa Indonesia');
                if (btn) { btn.click(); return true; }
                return false;
            });

            if (btnFound) {
                console.log('[SHOPEE] ✅ Klik Bahasa Indonesia...');
                try { await pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 }); } catch (_) {}
                await delay(3000);
                // Buka ulang halaman koleksi
                await pg.goto(SHOPEE_CONFIG.collectionUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await delay(8000); // Tunggu lebih lama untuk React render
            }
        }

        // Screenshot debug setelah load
        await pg.screenshot({ path: require('path').join(__dirname, '../../data/debug_collection.png'), fullPage: true }).catch(() => {});

        // Scroll bertahap untuk trigger lazy load React
        for (let i = 0; i < 6; i++) {
            await pg.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            await delay(1200);
        }
        await delay(3000);

        // Screenshot setelah scroll
        await pg.screenshot({ path: require('path').join(__dirname, '../../data/debug_after_scroll.png'), fullPage: false }).catch(() => {});

        // Simpan HTML untuk debug selector
        const html = await pg.content().catch(() => '');
        require('fs').writeFileSync(require('path').join(__dirname, '../../data/debug_page.html'), html.slice(0, 50000));
        console.log(`[SHOPEE] 📄 HTML saved (${html.length} chars)`);

        // Tunggu produk muncul di DOM
        try {
            await pg.waitForSelector(
                'a[href*="/vondutchofficial/"], a[href*="-i."], a[href*="/product/"]',
                { timeout: 12000 }
            );
            console.log('[SHOPEE] ✅ Produk terdeteksi di DOM!');
        } catch (_) {
            console.log('[SHOPEE] ⏳ Produk belum muncul setelah scroll.');
        }

        // Scrape semua link produk Von Dutch
        const scraped = await pg.evaluate((shopUsername, shopId) => {
            const results = [];
            const seen    = new Set();

            // Semua <a> yang mengarah ke produk Von Dutch
            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            for (const a of allLinks) {
                const href = a.href || '';
                if (!href.includes('shopee.co.id')) continue;

                // Pola URL produk Shopee:
                // /vondutchofficial/ProductName-i.{shopId}.{itemId}
                // /product/{shopId}/{itemId}
                const m1 = href.match(/\-i\.\d+\.(\d+)/);          // format baru
                const m2 = href.match(/\/product\/\d+\/(\d+)/);     // format lama
                const m3 = href.match(/i\.\d+\.(\d+)/);             // format singkat

                const itemId = (m1 || m2 || m3)?.[1];
                if (!itemId || seen.has(itemId)) continue;
                if (href.includes('/login') || href.includes('/search')) continue;

                seen.add(itemId);
                const img  = a.querySelector('img');
                const name = img?.alt || a.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim() || '';

                results.push({
                    itemId,
                    name : name.slice(0, 80),
                    url  : href.split('?')[0],
                });
            }

            return results;
        }, SHOPEE_CONFIG.shopUsername, SHOPEE_CONFIG.shopId);

        items.push(...scraped);
        console.log(`[SHOPEE] 📦 DOM: ${items.length} produk.`);

        // Jika DOM masih 0, coba via Shopee API (dalam browser yang sudah login)
        if (items.length === 0) {
            console.log('[SHOPEE] 🔄 DOM kosong, coba Shopee API dalam browser...');

            const apiItems = await pg.evaluate(async (shopId, collId) => {
                try {
                    const res = await fetch(
                        `https://shopee.co.id/api/v4/shop/rcmd_items?` +
                        `shop_id=${shopId}&collection_id=${collId}&limit=30&offset=0&sort_type=1`,
                        {
                            credentials: 'include',
                            headers: {
                                'x-api-source'    : 'pc',
                                'x-requested-with': 'XMLHttpRequest',
                                'referer'         : `https://shopee.co.id/vondutchofficial`,
                            },
                        }
                    );
                    const json = await res.json();
                    // Coba berbagai path response
                    return json?.data?.items || json?.items || json?.data?.sections?.[0]?.data?.item || [];
                } catch (e) {
                    return [];
                }
            }, SHOPEE_CONFIG.shopId, SHOPEE_CONFIG.collectionId);

            for (const it of apiItems) {
                const itemId = String(it.itemid || it.item_id || it.id || '');
                if (!itemId) continue;
                items.push({
                    itemId,
                    name: it.name || it.item_name || `Item ${itemId}`,
                    url : `https://shopee.co.id/${SHOPEE_CONFIG.shopUsername}/${(it.name||'product').toLowerCase().replace(/\s+/g,'-')}-i.${SHOPEE_CONFIG.shopId}.${itemId}`,
                });
            }

            if (items.length === 0) {
                // Last resort: coba ambil via search API
                console.log('[SHOPEE] 🔄 Coba search API...');
                const searchItems = await pg.evaluate(async (shopId) => {
                    try {
                        const res = await fetch(
                            `https://shopee.co.id/api/v4/search/search_items?` +
                            `by=pop&limit=30&match_id=${shopId}&newest=0&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2`,
                            { credentials: 'include', headers: { 'x-api-source': 'pc', 'x-requested-with': 'XMLHttpRequest' } }
                        );
                        const j = await res.json();
                        return j?.items || j?.data?.items || [];
                    } catch { return []; }
                }, SHOPEE_CONFIG.shopId);

                for (const it of searchItems) {
                    const d = it.item_basic || it;
                    const itemId = String(d.itemid || d.item_id || d.id || '');
                    if (!itemId) continue;
                    items.push({
                        itemId,
                        name: d.name || `Item ${itemId}`,
                        url : `https://shopee.co.id/product/${SHOPEE_CONFIG.shopId}/${itemId}`,
                    });
                }
            }

            console.log(`[SHOPEE] 📡 API: ${items.length} produk.`);
        }

        // Screenshot untuk debug
        const ssPath = require('path').join(__dirname, '../../data/debug_collection.png');
        await pg.screenshot({ path: ssPath, fullPage: false }).catch(() => {});
        console.log(`[SHOPEE] 📸 Debug screenshot: ${ssPath}`);

    } catch (err) {
        console.error('[SHOPEE] ❌ scrapeCollectionItems:', err.message);
    } finally {
        await pg.close().catch(() => {});
    }

    return items;
}

// ─── Scrape stok ukuran dari halaman produk ───────────────────────────────────
async function scrapeProductSizes(productUrl) {
    const pg = await session.newPage();
    try {
        await pg.goto(productUrl, { waitUntil: 'networkidle2', timeout: 25000 });
        await delay(3000);

        const sizes = await pg.evaluate(() => {
            // Coba API internal terlebih dahulu (lebih akurat)
            const state = window.__NEXT_DATA__ || window.__PRELOADED_STATE__;
            if (state) {
                try {
                    const str    = JSON.stringify(state);
                    const models = JSON.parse(str)?.pageProps?.initialState?.item?.item?.models;
                    if (models?.length) {
                        return models.map(m => ({
                            name     : m.name?.trim().toUpperCase(),
                            stock    : m.stock ?? 0,
                            price    : Math.round((m.price || 0) / 100000),
                            available: (m.stock ?? 0) > 0,
                        }));
                    }
                } catch (_) {}
            }

            // DOM scraping: cari tombol ukuran
            const btnSels = [
                'button.product-variation',
                '[class*="product-variation"]',
                '[class*="variation"] button',
                '[class*="btn-size"]',
            ];
            let buttons = [];
            for (const sel of btnSels) {
                buttons = Array.from(document.querySelectorAll(sel));
                if (buttons.length) break;
            }

            // Fallback: semua button ukuran standar
            if (!buttons.length) {
                buttons = Array.from(document.querySelectorAll('button')).filter(b => {
                    const t = b.textContent?.trim().toUpperCase();
                    return ['XS','S','M','L','XL','XXL','2XL','3XL','XXXL'].includes(t);
                });
            }

            return buttons.map(b => ({
                name     : b.textContent?.trim().toUpperCase(),
                available: !b.disabled && !b.className?.includes('disabled') && !b.className?.includes('inactive'),
                stock    : !b.disabled ? '≥1' : 0,
                price    : 0,
            }));
        });

        return sizes;
    } catch (err) {
        console.error(`[SHOPEE] ❌ scrapeProductSizes (${productUrl}):`, err.message);
        return [];
    } finally {
        await pg.close().catch(() => {});
    }
}

// ─── Scan seluruh koleksi untuk ukuran target ─────────────────────────────────
async function scanCollectionForSize(targetSize = 'S') {
    if (!session.getIsLoggedIn()) {
        throw new Error('Belum login ke Shopee. Ketik !loginshopee terlebih dahulu.');
    }

    const normalize  = s => s?.replace(/size|uk\.?|ukuran/gi, '').trim().toUpperCase();
    const target     = normalize(targetSize);
    const available  = [];

    // Step 1: Ambil semua produk dari koleksi
    const allItems = await scrapeCollectionItems();
    if (!allItems.length) {
        console.warn('[SHOPEE] ⚠️  Tidak ada produk ditemukan di koleksi!');
        return [];
    }

    console.log(`[SHOPEE] 🔍 Cek stok ukuran ${target} di ${allItems.length} produk...\n`);

    // Step 2: Cek stok tiap produk
    for (const [i, item] of allItems.entries()) {
        console.log(`[SHOPEE] [${i + 1}/${allItems.length}] ${item.name || item.itemId}`);
        try {
            await delay(800);
            const sizes = await scrapeProductSizes(item.url);

            if (!sizes.length) {
                console.log(`           ⚠️  Tidak ada data ukuran.`);
                continue;
            }

            const sizeInfo = sizes.find(s => normalize(s.name) === target);
            if (!sizeInfo) {
                const availSizes = sizes.filter(s => s.available).map(s => s.name).join(', ');
                console.log(`           ❌ Ukuran ${target} tidak ada. Tersedia: ${availSizes || '-'}`);
                continue;
            }

            if (!sizeInfo.available) {
                console.log(`           ❌ Ukuran ${target} HABIS.`);
                continue;
            }

            const entry = {
                itemId  : item.itemId,
                name    : item.name || `Item ${item.itemId}`,
                stock   : sizeInfo.stock,
                price   : sizeInfo.price || item.price,
                available: true,
                url     : item.url,
                allSizes: sizes,
            };
            available.push(entry);
            console.log(`           ✅ TERSEDIA! Stok: ${sizeInfo.stock}`);

        } catch (err) {
            console.error(`           ❌ Error: ${err.message}`);
        }
    }

    return available;
}

// ─── Format notifikasi WhatsApp ───────────────────────────────────────────────
function formatNotification(availableItems, targetSize) {
    const now = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short',
    });

    if (!availableItems.length) {
        return (
            `🔍 *CEK STOK SHOPEE*\n━━━━━━━━━━━━━━━━━━\n` +
            `🏪 Von Dutch Official\n👕 Workshirt — Ukuran *${targetSize}*\n\n` +
            `❌ Saat ini *BELUM TERSEDIA*\n🕐 Dicek: _${now}_\n\n` +
            `_Bot akan terus memantau & notif jika ada stok!_ 🤖`
        );
    }

    let itemList = '';
    for (const item of availableItems) {
        const harga = typeof item.price === 'number' && item.price > 0
            ? `Rp ${item.price.toLocaleString('id-ID')}`
            : (item.price || '-');
        itemList +=
            `\n👕 *${item.name}*\n` +
            `   📦 Stok: *${item.stock}*  💰 ${harga}\n` +
            `   🔗 ${item.url}\n`;
    }

    return (
        `🚨 *STOK TERSEDIA — VON DUTCH!*\n━━━━━━━━━━━━━━━━━━\n` +
        `🏪 Von Dutch Official\n👕 Workshirt — Ukuran *${targetSize}*\n\n` +
        `✅ *${availableItems.length} produk tersedia:*` +
        itemList +
        `\n━━━━━━━━━━━━━━━━━━\n🕐 Dicek: _${now}_\n⚡ *Segera pesan sebelum habis!*`
    );
}

module.exports = {
    scanCollectionForSize,
    scrapeCollectionItems,
    scrapeProductSizes,
    formatNotification,
    SHOPEE_CONFIG,
};
