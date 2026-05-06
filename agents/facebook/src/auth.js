/**
 * ============================================================
 * FB AUTH — Login & Session Manager
 * ============================================================
 * Versi refactored: Tidak ada inquirer prompt.
 * forceLogin() buka browser visible dan POLL status login
 * setiap 5 detik secara otomatis (max 5 menit).
 * ============================================================
 */

let cachedName = '';

/**
 * Cek apakah browser sudah dalam keadaan login Facebook.
 * @param {import('playwright').BrowserContext} browserContext
 * @returns {Promise<{loggedIn: boolean, name: string}>}
 */
export async function checkLoginStatus(browserContext) {
    const page = await browserContext.newPage();
    // console.log('[FB-AUTH] Memeriksa status login Facebook...');
    try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) { /* Abaikan timeout ringan */ }

    const isLoginPage =
        await page.locator('input[name="email"]').isVisible({ timeout: 3000 }).catch(() => false) ||
        await page.locator('input[name="pass"]').isVisible({ timeout: 1000 }).catch(() => false) ||
        page.url().includes('login');

    if (isLoginPage) {
        cachedName = '';
        await page.close();
        return { loggedIn: false, name: '' };
    }

    // Jika sudah punya cache nama, gunakan itu saja (lebih cepat)
    if (cachedName) {
        await page.close();
        return { loggedIn: true, name: cachedName };
    }

    // Ambil nama jika belum ada di cache
    let name = 'Facebook User';
    try {
        // Coba ambil dari aria-label di navbar (biasanya ada "Profil Anda, [Nama]")
        const profileLink = page.locator('a[href*="/me/"], a[href*="facebook.com/profile.php"]').first();
        const ariaLabel = await profileLink.getAttribute('aria-label').catch(() => '');
        
        if (ariaLabel && ariaLabel.toLowerCase().includes('profil')) {
            // Format biasanya: "Profil Anda", "Your profile", dsb. 
            // Kadang namanya ada di dalamnya.
            // Tapi lebih pasti ke /me
        }

        await page.goto('https://www.facebook.com/me/', { waitUntil: 'networkidle', timeout: 15000 });
        // Selector H1 biasanya berisi nama di halaman profil
        const h1 = page.locator('h1').first();
        await h1.waitFor({ timeout: 5000 });
        name = await h1.innerText();
        
        if (name) {
            cachedName = name.trim();
            name = cachedName;
        }
    } catch (e) {
        // console.log('[FB-AUTH] (Gagal mengambil nama profil)');
    }

    await page.close();
    return { loggedIn: true, name };
}

/**
 * Buka browser VISIBLE dan polling login setiap 5 detik.
 * Tidak membutuhkan input terminal sama sekali.
 * Timeout: 5 menit — jika lebih, throw error.
 *
 * @param {import('playwright').BrowserContext} browserContext - browser visible (headless: false)
 */
export async function forceLogin(browserContext) {
    const page = await browserContext.newPage();
    try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {}

    console.log('\n[FB-AUTH] ═══════════════════════════════════════════');
    console.log('[FB-AUTH] ⚠️  SESI FACEBOOK BELUM ADA / KADALUARSA');
    console.log('[FB-AUTH] ═══════════════════════════════════════════');
    console.log('[FB-AUTH] Browser Chrome sudah terbuka di layar Anda.');
    console.log('[FB-AUTH] Silakan login di browser tersebut.');
    console.log('[FB-AUTH] Bot akan otomatis melanjutkan setelah login terdeteksi.');
    console.log('[FB-AUTH] (Timeout: 5 menit)\n');

    // Polling setiap 5 detik, max 60 kali = 5 menit
    const MAX_POLLS  = 60;
    const POLL_INTERVAL_MS = 5000;

    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        try {
            await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(1000);
        } catch (e) {}

        const isStillLoggedOut =
            await page.locator('input[name="email"]').isVisible({ timeout: 2000 }).catch(() => false) ||
            page.url().includes('login');

        if (!isStillLoggedOut) {
            console.log('[FB-AUTH] ✅ Login terdeteksi! Sesi disimpan otomatis.');
            await page.close();
            return; // Berhasil login
        }

        const minutesLeft = Math.ceil((MAX_POLLS - i - 1) * POLL_INTERVAL_MS / 60000);
        if (i % 6 === 0 && i > 0) {
            console.log(`[FB-AUTH] ⏳ Menunggu login... (sisa ~${minutesLeft} menit)`);
        }
    }

    // Timeout
    await page.close();
    throw new Error('[FB-AUTH] Timeout 5 menit — login tidak terdeteksi. Pastikan sudah login di browser yang terbuka.');
}

/**
 * Cetak nama akun Facebook yang sedang login (untuk konfirmasi).
 * @param {import('playwright').BrowserContext} browserContext
 */
export async function printUserName(browserContext) {
    const page = await browserContext.newPage();
    try {
        await page.goto('https://www.facebook.com/me/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const h1 = page.locator('h1').first();
        await h1.waitFor({ timeout: 5000 });
        const name = await h1.innerText();
        console.log(`[FB-AUTH] ✅ Login sebagai: ${name}`);
    } catch (e) {
        console.log('[FB-AUTH] (Tidak bisa ambil nama profil)');
    } finally {
        await page.close();
    }
}
