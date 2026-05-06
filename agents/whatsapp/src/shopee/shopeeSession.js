/**
 * ============================================================
 * SHOPEE SESSION MANAGER
 * ============================================================
 * Mengelola sesi login Shopee via QR Code (mirip whatsapp-web.js).
 * Setelah login, session cookies disimpan ke file.
 *
 * Alur:
 *  1. Coba load cookies dari file → validasi login
 *  2. Jika expired/tidak ada → buka browser visible (headless:false)
 *  3. Arahkan ke halaman login Shopee → tampilkan tab QR
 *  4. Tunggu user scan QR → deteksi redirect post-login
 *  5. Simpan cookies → jalankan headless untuk operasi selanjutnya
 * ============================================================
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');
const fs              = require('fs');
const path            = require('path');

// Aktifkan stealth mode untuk bypass bot-detection Shopee
puppeteerExtra.use(StealthPlugin());

// ─── Konstanta ────────────────────────────────────────────────────────────────
const SESSION_FILE = path.join(__dirname, '../../data/shopee_session.json');
const SHOPEE_URL   = 'https://shopee.co.id';
const LOGIN_URL    = 'https://shopee.co.id/buyer/login';

// ─── State ────────────────────────────────────────────────────────────────────
let browser    = null;
let mainPage   = null;
let isLoggedIn = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Simpan cookies ke file ───────────────────────────────────────────────────
async function saveSession(pg) {
    try {
        const cookies = await pg.cookies();
        if (!fs.existsSync(path.dirname(SESSION_FILE))) {
            fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
        }
        fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
        console.log('[SHOPEE] 💾 Session tersimpan.');
    } catch (e) {
        console.error('[SHOPEE] ❌ Gagal simpan session:', e.message);
    }
}

// ─── Load cookies dari file ───────────────────────────────────────────────────
async function loadSession(pg) {
    if (!fs.existsSync(SESSION_FILE)) return false;
    try {
        const raw     = fs.readFileSync(SESSION_FILE, 'utf8');
        let cookies   = JSON.parse(raw);
        if (!Array.isArray(cookies) || cookies.length === 0) return false;

        // Pastikan semua cookies punya domain yang benar
        cookies = cookies.map(c => ({
            ...c,
            domain: c.domain || '.shopee.co.id',
            path  : c.path   || '/',
        }));

        // Puppeteer butuh halaman yang sudah navigate ke domain sebelum setCookie
        // Navigasi dulu ke shopee, lalu set cookies
        await pg.goto('https://shopee.co.id', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await pg.setCookie(...cookies);
        console.log(`[SHOPEE] 🔑 Session dimuat: ${cookies.length} cookies.`);
        return true;
    } catch (e) {
        console.error('[SHOPEE] ⚠️  Gagal load session:', e.message);
        return false;
    }
}

// ─── Cek apakah sudah login ───────────────────────────────────────────────────
async function checkLoginStatus(pg) {
    try {
        // Reload halaman utama SETELAH cookies sudah di-set
        await pg.goto(SHOPEE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await delay(3000);

        const currentUrl = pg.url();

        // Jika kena verify/traffic → session tidak valid
        if (currentUrl.includes('/verify/traffic') || currentUrl.includes('/buyer/login')) {
            console.log('[SHOPEE] ⚠️  Redirect ke verify/login — session expired.');
            return false;
        }

        const loggedIn = await pg.evaluate(() => {
            const hasSpcU    = document.cookie.split(';').some(c => c.trim().startsWith('SPC_U='));
            const hasProfile = !!document.querySelector(
                '.shopee-avatar, [data-sqe="avatar"], .navbar__username, ' +
                'a[href*="/user/profile"], [class*="account"]'
            );
            const notOnLogin = !window.location.href.includes('/login');
            // SPC_U adalah indikator paling reliable
            return hasSpcU || (hasProfile && notOnLogin);
        });

        console.log(`[SHOPEE] 🔑 SPC_U check: ${loggedIn ? 'VALID ✅' : 'TIDAK ADA ❌'}`);
        return loggedIn;
    } catch (e) {
        console.error('[SHOPEE] ⚠️  checkLoginStatus error:', e.message);
        return false;
    }
}

// ─── Buka Browser (Stealth Mode) ──────────────────────────────────────────────
async function launchBrowser(headless = true) {
    return puppeteerExtra.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1200,800',
        ],
        defaultViewport: headless ? { width: 1200, height: 800 } : null,
        ignoreDefaultArgs: ['--enable-automation'],
    });
}

// ─── Helper: Klik tombol berdasarkan teks ────────────────────────────────────
async function clickByText(pg, texts) {
    return pg.evaluate((texts) => {
        const all = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const el  = all.find(e => texts.some(t => e.textContent?.trim() === t));
        if (el) { el.click(); return el.textContent?.trim(); }
        return null;
    }, texts);
}

// ─── Login via QR ─────────────────────────────────────────────────────────────
/**
 * Buka browser, tampilkan halaman login Shopee dengan QR code,
 * dan tunggu user scan QR.
 *
 * @param {Function} [onQR]    - Callback saat QR siap (opsional)
 * @param {Function} [onReady] - Callback setelah login sukses (opsional)
 * @returns {Promise<boolean>} true jika login sukses
 */
async function loginWithQR(onQR, onReady) {
    console.log('[SHOPEE] 🚀 Membuka browser untuk login Shopee via QR...');

    // Buka browser VISIBLE agar user bisa scan QR
    browser  = await launchBrowser(false);
    mainPage = await browser.newPage();

    await mainPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await mainPage.setExtraHTTPHeaders({ 'Accept-Language': 'id-ID,id;q=0.9' });

    // Buka halaman login
    console.log('[SHOPEE] 🌐 Membuka halaman login Shopee...');
    await mainPage.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2500);

    // ── Step 1: Handle halaman /verify/traffic/error (pilih bahasa) ───────────
    // Shopee mendeteksi bot dan redirect ke halaman ini dulu.
    // Klik "Bahasa Indonesia" → tunggu redirect ke halaman login.
    for (let attempt = 1; attempt <= 8; attempt++) {
        const currentUrl = mainPage.url();

        if (currentUrl.includes('/verify/traffic')) {
            console.log(`[SHOPEE] 🔎 Halaman traffic check terdeteksi (attempt ${attempt})...`);

            // Klik "Bahasa Indonesia"
            const clicked = await clickByText(mainPage, ['Bahasa Indonesia', 'Indonesia']);
            if (clicked) {
                console.log(`[SHOPEE] ✅ Klik "${clicked}", menunggu redirect...`);
                // Tunggu navigasi setelah klik bahasa
                try {
                    await mainPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                } catch (_) { /* timeout ok, halaman mungkin sudah pindah */ }
                await delay(2000);
                break;
            } else {
                console.log(`[SHOPEE] ⏳ Tombol bahasa belum muncul, tunggu...`);
                await delay(1500);
            }
        } else {
            // Sudah tidak di halaman verify
            break;
        }
    }

    // ── Step 2: Pastikan di halaman login, jika tidak → navigasi manual ───────
    {
        const currentUrl = mainPage.url();
        if (!currentUrl.includes('/buyer/login') && !currentUrl.includes('/login')) {
            console.log('[SHOPEE] 🔄 Redirect ke halaman login...');
            await mainPage.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 25000 });
            await delay(2500);
        } else {
            console.log('[SHOPEE] ✅ Sudah di halaman login.');
        }
    }

    // ── Step 3: Handle lagi jika kena verify setelah goto login ──────────────
    {
        const currentUrl = mainPage.url();
        if (currentUrl.includes('/verify/traffic')) {
            console.log('[SHOPEE] ⚠️  Kena verify lagi setelah login redirect...');
            const clicked = await clickByText(mainPage, ['Bahasa Indonesia', 'Indonesia', 'English']);
            if (clicked) {
                console.log(`[SHOPEE] ✅ Klik "${clicked}"...`);
                try {
                    await mainPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                } catch (_) {}
                await delay(2000);
                // Navigasi ulang ke login
                await mainPage.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 20000 });
                await delay(2500);
            }
        }
    }

    // ── Step 4: Klik tombol "Log in dengan QR" ───────────────────────────────
    // Selector ditemukan via DOM inspection:
    //   a[href="/buyer/login/qr"]  → paling stabil (href-based)
    //   div.ZJ5g1O / div.YqPlXG   → tooltip text "Log in dengan QR"
    let qrClicked = false;
    for (let attempt = 1; attempt <= 8; attempt++) {
        try {
            qrClicked = await mainPage.evaluate(() => {
                // Strategi 1: href langsung ke /buyer/login/qr (paling reliable)
                const byHref = document.querySelector('a[href="/buyer/login/qr"]');
                if (byHref) { byHref.click(); return 'href'; }

                // Strategi 2: cari elemen teks persis "Log in dengan QR"
                const allEls = Array.from(document.querySelectorAll('a, button, div, span'));
                const byText = allEls.find(el =>
                    el.children.length === 0 &&
                    (el.textContent?.trim() === 'Log in dengan QR' ||
                     el.textContent?.trim() === 'Login dengan QR')
                );
                if (byText) {
                    (byText.closest('a') || byText.closest('button') || byText).click();
                    return 'text';
                }

                // Strategi 3: class fallback (bisa berubah, tapi dicoba)
                const byClass = document.querySelector(
                    '[class*="qr"], [class*="QR"], a[class*="Eb"], a[class*="qr"]'
                );
                if (byClass) { byClass.click(); return 'class'; }

                return null;
            });

            if (qrClicked) {
                console.log(`[SHOPEE] 📷 Tombol QR diklik via "${qrClicked}" (attempt ${attempt})`);
                await delay(2500);
                break;
            }
        } catch (_) {}

        console.log(`[SHOPEE] ⏳ Cari tombol QR... (attempt ${attempt}/8)`);
        await delay(1200);
    }

    if (!qrClicked) {
        console.log('[SHOPEE] ℹ️  Tombol QR tidak ditemukan otomatis.');
        console.log('[SHOPEE]    → Silakan klik "Log in dengan QR" secara MANUAL di browser.');
    }

    // Notify bahwa QR siap (browser sudah terbuka)
    console.log('[SHOPEE] 📱 Browser terbuka! Silakan scan QR dengan Shopee App.');
    console.log('[SHOPEE]    Shopee App → Profil → Ikon Kamera (Scan QR)');
    if (onQR) onQR();

    // Tunggu user login (deteksi redirect dari /login ke halaman utama)
    const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 menit
    const startTime = Date.now();
    let success = false;

    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
        await delay(2500);
        try {
            const currentUrl = mainPage.url();
            const pageHasCookie = await mainPage.evaluate(() =>
                document.cookie.split(';').some(c => c.trim().startsWith('SPC_U='))
            );

            if (pageHasCookie || (!currentUrl.includes('/login') && !currentUrl.includes('/verify'))) {
                console.log('[SHOPEE] ✅ Login terdeteksi! Menyimpan session...');
                await delay(2000); // tunggu cookies sepenuhnya di-set
                await saveSession(mainPage);
                isLoggedIn = true;
                success = true;
                break;
            }
        } catch (_) {}
    }

    if (!success) {
        console.error('[SHOPEE] ❌ Timeout login. QR tidak di-scan dalam 3 menit.');
        await browser.close().catch(() => {});
        browser = null; mainPage = null;
        return false;
    }

    // Setelah sukses, switch ke headless browser untuk operasi selanjutnya
    const savedCookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    await browser.close().catch(() => {});

    browser  = await launchBrowser(true);
    mainPage = await browser.newPage();
    await mainPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await mainPage.setCookie(...savedCookies);
    await mainPage.goto(SHOPEE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

    console.log('[SHOPEE] 🔒 Beralih ke mode headless. Session aktif.');
    if (onReady) onReady();

    return true;
}

// ─── Inisialisasi (auto-login jika session ada) ───────────────────────────────
async function initialize() {
    console.log('[SHOPEE] 🔍 Memeriksa session tersimpan...');

    if (!fs.existsSync(SESSION_FILE)) {
        console.log('[SHOPEE] ℹ️  Tidak ada session. Perlu login QR.');
        return false;
    }

    let cookies;
    try {
        cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    } catch (_) {
        console.log('[SHOPEE] ℹ️  File session rusak. Perlu login ulang.');
        return false;
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log('[SHOPEE] ℹ️  Session kosong. Perlu login QR.');
        return false;
    }

    // Cek apakah SPC_U (user ID) ada di cookies — ini indikator login
    const spcU = cookies.find(c => c.name === 'SPC_U');
    if (!spcU || !spcU.value || spcU.value === '0') {
        console.log('[SHOPEE] ⚠️  SPC_U tidak ditemukan. Session tidak valid.');
        return false;
    }

    // Cek apakah cookies belum expired
    const now     = Math.floor(Date.now() / 1000);
    const expired = cookies.filter(c => c.expires && c.expires > 0 && c.expires < now);
    const spcExpired = cookies.find(c => c.name === 'SPC_U' && c.expires && c.expires < now);
    if (spcExpired) {
        console.log('[SHOPEE] ⚠️  Session SPC_U expired. Perlu login ulang.');
        return false;
    }

    // Session tampak valid — buka browser headless dan inject cookies
    console.log(`[SHOPEE] 🔑 Session ditemukan (SPC_U: ${spcU.value.slice(0, 8)}...) — load browser...`);
    browser  = await launchBrowser(true);
    mainPage = (await browser.pages())[0] || await browser.newPage();
    await mainPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Navigasi dulu ke shopee agar domain cookie bisa di-set
    await mainPage.goto('https://shopee.co.id', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const fixedCookies = cookies.map(c => ({ ...c, domain: c.domain || '.shopee.co.id', path: c.path || '/' }));
    await mainPage.setCookie(...fixedCookies);

    isLoggedIn = true;
    console.log('[SHOPEE] ✅ Session dimuat. Bot siap.');
    return true;
}

// ─── Buka halaman baru dengan cookies session ─────────────────────────────────
async function newPage() {
    if (!browser) throw new Error('Browser belum aktif. Panggil initialize() atau loginWithQR() dulu.');
    const pg = await browser.newPage();
    await pg.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    // Salin cookies dari mainPage
    if (mainPage) {
        const cookies = await mainPage.cookies().catch(() => []);
        if (cookies.length > 0) await pg.setCookie(...cookies);
    }
    return pg;
}

// ─── Close browser ────────────────────────────────────────────────────────────
async function close() {
    if (browser) {
        await browser.close().catch(() => {});
        browser = null; mainPage = null; isLoggedIn = false;
        console.log('[SHOPEE] 🔒 Browser ditutup.');
    }
}

// ─── Hapus session ────────────────────────────────────────────────────────────
function clearSession() {
    if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
        console.log('[SHOPEE] 🗑️  Session dihapus.');
    }
    isLoggedIn = false;
}

module.exports = {
    initialize,
    loginWithQR,
    saveSession,
    loadSession,
    checkLoginStatus,
    newPage,
    close,
    clearSession,
    getIsLoggedIn : () => isLoggedIn,
    getBrowser    : () => browser,
    getPage       : () => mainPage,
    SESSION_FILE,
    SHOPEE_URL,
};
