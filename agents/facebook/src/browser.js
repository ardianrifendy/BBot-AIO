/**
 * ============================================================
 * BROWSER — Playwright Chrome Launcher
 * ============================================================
 * Membuka Chrome dengan persistent session (cookies tersimpan).
 * Session disimpan di agents/facebook/session/ (path absolut).
 * ============================================================
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path folder session — absolut agar tidak bergantung dari mana node dijalankan */
const SESSION_DIR = path.resolve(__dirname, '../session');

/**
 * Buka Chrome dengan persistent context (session tersimpan).
 * @param {boolean} isHeadless - true = background, false = tampilkan browser
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function launchBrowser(isHeadless = true) {
    console.log(`[BROWSER] Membuka Chrome (${isHeadless ? 'background/headless' : 'visible untuk login'})...`);

    try {
        const browserContext = await chromium.launchPersistentContext(SESSION_DIR, {
            headless: isHeadless,
            channel: 'chrome',
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        });

        await new Promise(r => setTimeout(r, 2000));
        console.log('[BROWSER] ✅ Chrome berhasil dibuka.');
        return browserContext;
    } catch (error) {
        console.error('[BROWSER] ❌ Gagal membuka Chrome:', error.message);
        console.error('[BROWSER] Pastikan Google Chrome sudah terinstall dan Playwright browsers sudah di-install:');
        console.error('[BROWSER] Jalankan: npx playwright install chromium');
        throw error;
    }
}
