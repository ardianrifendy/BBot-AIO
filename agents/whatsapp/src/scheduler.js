/**
 * ============================================================
 * SCHEDULER - Auto-cek Resi Aktif (Cron Job)
 * ============================================================
 * Berjalan setiap jam. Versi "pintar":
 *
 *  1. SKIP resi yang sudah delivered > MAX_DELIVERED_AGE_DAYS hari
 *     (tidak perlu terus dicek — cukup bersihkan dari active tracks)
 *
 *  2. SKIP resi yang last_checked-nya kurang dari MIN_RECHECK_MS
 *     (hindari double-check jika bot restart dalam rentang waktu dekat)
 *
 *  3. Kirim notifikasi HANYA jika status benar-benar berubah
 *     (logika ini sudah ada, diperkuat dengan validasi string)
 *
 *  4. Rate limiting 2 detik antar API call (anti-ban Binderbyte)
 *
 *  5. Logging detail untuk memantau kesehatan scheduler
 * ============================================================
 */

const cron = require('node-cron');
const db = require('./db');
const binderbyte = require('./binderbyte');

// ─── Konfigurasi Scheduler ────────────────────────────────────────────────────

/** Maksimal usia resi delivered yang masih disimpan (hari) */
const MAX_DELIVERED_AGE_DAYS = 3;

/** Jeda minimal antara pengecekan ulang resi yang sama (ms) — default 50 menit */
const MIN_RECHECK_MS = 50 * 60 * 1000;

/** Jeda antar API call untuk menghindari rate limit Binderbyte */
const API_DELAY_MS = 2000;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Menghitung selisih waktu dalam milidetik dari timestamp ISO
 * @param {string} isoTimestamp
 * @returns {number} Selisih dalam ms (positif = sudah berlalu)
 */
const msSince = (isoTimestamp) => {
    if (!isoTimestamp) return Infinity;
    return Date.now() - new Date(isoTimestamp).getTime();
};

/**
 * Jeda (delay) dalam milidetik
 * @param {number} ms
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Start Scheduler ──────────────────────────────────────────────────────────

const start = (client) => {
    console.log('🔄 Scheduler otomatis 1 jam dimulai (Cron: 0 * * * *)');

    let isRunning = false;

    // Setiap jam di menit ke-00 (contoh: 10:00, 11:00, dst)
    // Untuk testing, ganti ke '* * * * *' (setiap menit)
    cron.schedule('0 * * * *', async () => {
        if (isRunning) {
            console.log('[CRON] Dilewati: Proses sebelumnya masih berjalan.');
            return;
        }

        console.log('\n[CRON] ══════════ Mulai pengecekan resi aktif ══════════');
        isRunning = true;

        try {
            const activeTracks = await db.getAllActiveTracks();

            if (activeTracks.length === 0) {
                console.log('[CRON] Tidak ada resi aktif. Selesai.');
                return;
            }

            console.log(`[CRON] ${activeTracks.length} resi aktif ditemukan.`);

            let checked  = 0;
            let skipped  = 0;
            let notified = 0;
            let cleaned  = 0;

            for (const track of activeTracks) {
                const awb = `${track.courier?.toUpperCase()} ${track.awb}`;

                // ── Filter 1: Skip resi delivered yang sudah terlalu lama ──────
                // Jika status sudah 'delivered' tapi masih ada di active tracks
                // (mungkin karena gagal hapus), bersihkan sekarang.
                if (track.last_status?.toLowerCase() === 'delivered') {
                    const age = msSince(track.last_checked);
                    const maxAge = MAX_DELIVERED_AGE_DAYS * 24 * 60 * 60 * 1000;

                    if (age > maxAge) {
                        console.log(`[CRON] 🧹 Bersihkan resi tua (delivered ${MAX_DELIVERED_AGE_DAYS}+ hari): ${awb}`);
                        await db.removeActiveTrack(track.user_jid, track.courier, track.awb);
                        cleaned++;
                        continue;
                    }
                }

                // ── Filter 2: Skip resi yang baru saja dicek ──────────────────
                const lastCheckedAgo = msSince(track.last_checked);
                if (lastCheckedAgo < MIN_RECHECK_MS) {
                    const minsAgo = Math.round(lastCheckedAgo / 60000);
                    console.log(`[CRON] ⏩ Skip ${awb} — baru dicek ${minsAgo} menit lalu`);
                    skipped++;
                    await delay(300); // jeda pendek tetap ada
                    continue;
                }

                // ── Hit API Binderbyte ─────────────────────────────────────────
                await delay(API_DELAY_MS);

                try {
                    const data = await binderbyte.trackReceipt(track.awb, track.courier, track.hp);
                    const currentStatus = data.summary?.status || '';
                    const prevStatus    = track.last_status    || '';

                    checked++;

                    // ── Bandingkan status (case-insensitive, trim) ─────────────
                    const statusChanged = currentStatus.trim().toLowerCase() !== prevStatus.trim().toLowerCase();

                    if (statusChanged) {
                        console.log(`[CRON] 🔔 Perubahan status ${awb}: "${prevStatus}" → "${currentStatus}"`);

                        // Format pesan notifikasi
                        const formattedText = binderbyte.formatTrackingResult(data);
                        const alertMsg =
                            `📢 *UPDATE RESI OTOMATIS*\n` +
                            `━━━━━━━━━━━━━━━━━━\n` +
                            `Status paket Anda berubah!\n\n` +
                            formattedText;

                        // Kirim notifikasi ke user
                        try {
                            await client.sendMessage(track.user_jid, alertMsg);
                            notified++;
                        } catch (sendErr) {
                            console.error(`[CRON] Gagal kirim notif ke ${track.user_jid}:`, sendErr.message);
                        }

                        // Update database
                        if (currentStatus.toLowerCase() === 'delivered') {
                            // Delivered → hapus dari active tracks
                            await db.removeActiveTrack(track.user_jid, track.courier, track.awb);
                            console.log(`[CRON] ✅ Resi ${awb} delivered — dihapus dari active tracks.`);
                        } else {
                            // Masih on process → update last_status
                            await db.updateActiveTrackStatus(track.user_jid, track.courier, track.awb, currentStatus);
                        }

                    } else {
                        // Status tidak berubah — hanya update waktu pengecekan
                        await db.updateActiveTrackStatus(track.user_jid, track.courier, track.awb, currentStatus);
                        console.log(`[CRON] ⏸  Tidak ada update: ${awb} (${currentStatus})`);
                    }

                } catch (apiErr) {
                    // API gagal — jangan crash loop, lanjut ke resi berikutnya
                    console.error(`[CRON] ❌ Gagal cek ${awb}:`, apiErr.message);
                }
            }

            // ════════════════════════════════════════════════════════
            // LOOP 2: Stock Tracks — Resi yang di-link ke item stok
            // ════════════════════════════════════════════════════════
            const stockTracks = await db.getAllStockTracks();

            if (stockTracks.length > 0) {
                console.log(`[CRON] ${stockTracks.length} stock track ditemukan.`);

                for (const track of stockTracks) {
                    const label = `${track.courier?.toUpperCase()} ${track.awb} (${track.item_name})`;
                    await delay(API_DELAY_MS);

                    try {
                        const data          = await binderbyte.trackReceipt(track.awb, track.courier, track.hp || '');
                        const currentStatus = data.summary?.status || '';
                        const prevStatus    = track.last_status     || '';
                        const isDelivered   = currentStatus.toLowerCase() === 'delivered';
                        const statusChanged = currentStatus.trim().toLowerCase() !== prevStatus.trim().toLowerCase();

                        if (statusChanged || isDelivered) {
                            console.log(`[CRON] 🔔 StockTrack ${label}: "${prevStatus}" → "${currentStatus}"`);

                            const lastHistory = data.history?.[0];
                            const lokasi      = lastHistory?.location || lastHistory?.desc || '-';
                            const tglUpdate   = lastHistory?.date     || '-';

                            const notifMsg = isDelivered
                                ? `✅ *PAKET SAMPAI!*\n━━━━━━━━━━━━━━━━━━\n` +
                                  `📦 *${track.item_name}*\n` +
                                  `👤 Milik: *${track.user_name}*\n` +
                                  `🚚 ${track.courier?.toUpperCase()} \`${track.awb}\`\n\n` +
                                  `📍 _${lokasi}_\n🕐 ${tglUpdate}\n\n` +
                                  `_Stok otomatis dipindahkan ke *Ready* ✅_\n\n_— *Bagaskara Cell* 📦_`
                                : `📢 *UPDATE RESI STOK*\n━━━━━━━━━━━━━━━━━━\n` +
                                  `📦 *${track.item_name}*\n` +
                                  `👤 Milik: *${track.user_name}*\n` +
                                  `🚚 ${track.courier?.toUpperCase()} \`${track.awb}\`\n\n` +
                                  `📍 ${lokasi}\n🕐 ${tglUpdate}\n📌 Status: *${currentStatus}*\n\n_— *Bagaskara Cell* 📦_`;

                            if (track.added_by_jid) {
                                try {
                                    await client.sendMessage(track.added_by_jid, notifMsg);
                                    notified++;
                                } catch (sendErr) {
                                    console.error(`[CRON] Gagal kirim notif StockTrack:`, sendErr.message);
                                }
                            }

                            if (isDelivered) {
                                // Auto-pindah stok ke Ready
                                await db.updateStockStatus(track.stock_id, 'Ready');
                                console.log(`[CRON] ✅ Stok "${track.item_name}" dipindah ke Ready.`);
                                // Hapus dari StockTracks
                                await db.removeStockTrack(track.id);
                                console.log(`[CRON] 🗑️  StockTrack ${label} dihapus (delivered).`);
                            } else {
                                await db.updateStockTrackStatus(track.id, currentStatus);
                            }

                        } else {
                            await db.updateStockTrackStatus(track.id, currentStatus);
                            console.log(`[CRON] ⏸  StockTrack tidak ada update: ${label}`);
                        }

                    } catch (apiErr) {
                        console.error(`[CRON] ❌ Gagal cek StockTrack ${label}:`, apiErr.message);
                    }
                }
            }

            // Ringkasan
            console.log(
                `[CRON] ══ Selesai: ${checked} dicek | ${notified} notif | ` +
                `${skipped} skip | ${cleaned} dibersihkan ══\n`
            );

        } catch (err) {
            console.error('[CRON] ❌ Kesalahan fatal saat tarik data DB:', err);
        } finally {
            isRunning = false;
        }
    });

    // ════════════════════════════════════════════════════════════════════════
    // DAILY REPORT — Setiap hari jam 08:00 WIB (01:00 UTC)
    // Kirim ringkasan stok ke grup yang dikonfigurasi di REPORT_GROUP_JID
    // ════════════════════════════════════════════════════════════════════════
    const REPORT_JID = process.env.REPORT_GROUP_JID;

    if (!REPORT_JID) {
        console.log('[CRON] ℹ️  REPORT_GROUP_JID tidak dikonfigurasi — daily report dinonaktifkan.');
    } else {
        cron.schedule('0 1 * * *', async () => { // 01:00 UTC = 08:00 WIB
            console.log('[CRON] 📊 Menjalankan daily report...');
            try {
                const allStocks  = await db.getAllUsersAndStocks();

                // Kelompokkan per user
                const userMap = {};
                for (const row of allStocks) {
                    if (!userMap[row.user_name]) userMap[row.user_name] = { ready: 0, notReady: 0 };
                    if (!row.item_name) continue;
                    if (row.status === 'Ready') userMap[row.user_name].ready++;
                    else                        userMap[row.user_name].notReady++;
                }

                const names   = Object.keys(userMap);
                const maxLen  = names.length ? Math.max(...names.map(n => n.length)) : 0;
                const grandReady    = Object.values(userMap).reduce((s, u) => s + u.ready, 0);
                const grandNotReady = Object.values(userMap).reduce((s, u) => s + u.notReady, 0);

                // Tanggal WIB
                const tgl = new Date().toLocaleDateString('id-ID', {
                    timeZone: 'Asia/Jakarta', dateStyle: 'full'
                });

                let lines = '';
                for (const [name, cnt] of Object.entries(userMap)) {
                    const pad = ' '.repeat(maxLen - name.length);
                    lines += `👤 *${name}*${pad}  →  ✅ ${cnt.ready} Ready  |  🚚 ${cnt.notReady} Jalan\n`;
                }

                const reportMsg =
                    `☀️ *LAPORAN STOK PAGI*\n` +
                    `📅 _${tgl}_\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    lines.trim() + '\n' +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `🟢 Total Ready    : *${grandReady} item*\n` +
                    `🚚 Total Di Jalan : *${grandNotReady} item*\n` +
                    `📦 Grand Total    : *${grandReady + grandNotReady} item*\n` +
                    `\n_— *Bagaskara Cell* 📦_`;

                await client.sendMessage(REPORT_JID, reportMsg);
                console.log('[CRON] ✅ Daily report terkirim ke', REPORT_JID);

            } catch (err) {
                console.error('[CRON] ❌ Gagal kirim daily report:', err.message);
            }
        }, { timezone: 'Asia/Jakarta' });

        console.log('📊 Daily report aktif — setiap hari 08:00 WIB ke', REPORT_JID);
    }
};

module.exports = { start };

