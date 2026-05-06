/**
 * ============================================================
 * DELAY HELPER — Anti-Ban Randomized Delays
 * ============================================================
 * WAJIB digunakan di semua titik interaksi DOM dan antar iterasi
 * Main Loop. Delay acak membuat pola bot tidak terbaca oleh
 * algoritma deteksi Facebook.
 * ============================================================
 */

/**
 * Delay dengan durasi acak antara min dan max detik.
 * @param {number} minSec - Minimum detik
 * @param {number} maxSec - Maksimum detik
 * @returns {Promise<void>}
 *
 * @example
 * await randomDelay(3, 8);   // Tunggu 3-8 detik (antar aksi DOM)
 * await randomDelay(50, 70); // Tunggu 50-70 menit (antar siklus loop) — kalikan 60
 */
const randomDelay = (minSec, maxSec) => {
    const ms = Math.floor((Math.random() * (maxSec - minSec) + minSec) * 1000);
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Delay tetap (non-random) dalam milidetik.
 * Gunakan untuk timing yang memang harus pasti (misal tunggu load page).
 * @param {number} ms
 */
const fixedDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Simulasikan "human typing speed" — delay pendek antar karakter.
 * @param {number} minMs - Min ms per karakter (default 80)
 * @param {number} maxMs - Max ms per karakter (default 180)
 */
const typingDelay = (minMs = 80, maxMs = 180) => {
    const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
    return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = { randomDelay, fixedDelay, typingDelay };
