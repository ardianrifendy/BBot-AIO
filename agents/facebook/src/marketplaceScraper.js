/**
 * ============================================================
 * MARKETPLACE SCRAPER — FB Marketplace Price Intelligence
 * ============================================================
 * ESM version — compatible dengan facebook agent (type: module)
 * ============================================================
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Import core modules (CommonJS) via createRequire bridge
const sheets = require('../../../core/googleSheets');
const { SHEETS } = require('../../../core/sheetConstants');

const MAX_KEYWORDS_PER_SESSION = 10;
const DELAY_MIN_MS = 5000;
const DELAY_MAX_MS = 12000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomSleep = () => sleep(Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS) + DELAY_MIN_MS));

// ── Ambil Keywords dari Sheet Catalog ─────────────────────────────────────────
async function getKeywordsFromCatalog() {
    const catalog = await sheets.getAll(SHEETS.CATALOG);
    const keywords = [...new Set(catalog.map(row => row.item_name).filter(Boolean))];
    return keywords.slice(0, MAX_KEYWORDS_PER_SESSION);
}

// ── Scrape Harga Per Keyword ───────────────────────────────────────────────────
async function scrapeKeyword(browserContext, keyword) {
    const page = await browserContext.newPage();
    const prices = [];

    try {
        const searchUrl = `https://www.facebook.com/marketplace/category/search/?query=${encodeURIComponent(keyword)}&exact=false`;
        console.log(`[SCRAPER] Scraping: "${keyword}"`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(4000);

        // Scroll untuk load lazy items
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(2000);

        // Ambil semua teks harga yang terlihat
        const priceTexts = await page.evaluate(() => {
            const elements = document.querySelectorAll('span[dir="auto"], [aria-label*="price"]');
            const results = [];
            elements.forEach(el => {
                const text = el.textContent?.trim() || '';
                if (/Rp|rp/i.test(text) || /\d{3}\.\d{3}/.test(text)) {
                    results.push(text);
                }
            });
            return results.slice(0, 15);
        });

        for (const text of priceTexts) {
            const cleaned = text.replace(/[Rp\s]/gi, '').replace(/\./g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            if (!isNaN(num) && num >= 500_000 && num <= 30_000_000) {
                prices.push(Math.round(num));
            }
        }

        console.log(`[SCRAPER] "${keyword}" → ${prices.length} harga ditemukan`);
    } catch (err) {
        console.error(`[SCRAPER] Gagal scrape "${keyword}": ${err.message}`);
    } finally {
        await page.close();
    }

    return { prices, count: prices.length };
}

// ── Statistik ──────────────────────────────────────────────────────────────────
function calcStats(prices) {
    if (prices.length === 0) return { min: 0, max: 0, avg: 0 };
    return {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    };
}

// ── Simpan ke Sheet ────────────────────────────────────────────────────────────
async function savePriceData(keyword, stats, count) {
    const nextId = await sheets.getNextId(SHEETS.MARKETPLACE_PRICES);
    await sheets.appendRow(SHEETS.MARKETPLACE_PRICES, [
        String(nextId), keyword,
        String(stats.min), String(stats.max), String(stats.avg),
        String(count), new Date().toISOString()
    ]);
    console.log(`[SCRAPER] ✅ Tersimpan: "${keyword}" | Avg: Rp ${stats.avg.toLocaleString('id-ID')}`);
}

// ── Main Export ────────────────────────────────────────────────────────────────
export async function runMarketplaceScraper(browserContext) {
    console.log('[SCRAPER] ══ Memulai sesi Marketplace Scraper ══');

    let keywords;
    try {
        keywords = await getKeywordsFromCatalog();
    } catch (err) {
        console.error(`[SCRAPER] Gagal ambil keywords: ${err.message}`);
        return;
    }

    if (keywords.length === 0) {
        console.warn('[SCRAPER] Sheet Catalog kosong. Tambah produk ke Catalog terlebih dahulu.');
        return;
    }

    console.log(`[SCRAPER] ${keywords.length} keyword: ${keywords.join(', ')}`);
    let successCount = 0;

    for (let i = 0; i < keywords.length; i++) {
        try {
            const { prices, count } = await scrapeKeyword(browserContext, keywords[i]);
            if (count > 0) {
                await savePriceData(keywords[i], calcStats(prices), count);
                successCount++;
            }
        } catch (err) {
            console.error(`[SCRAPER] Error: ${err.message}`);
        }

        if (i < keywords.length - 1) await randomSleep();
    }

    console.log(`[SCRAPER] ══ Selesai: ${successCount}/${keywords.length} keyword berhasil ══`);
}
