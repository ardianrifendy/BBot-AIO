/**
 * ============================================================
 * SHOPEE MONITOR — Scheduler Pemantau Stok Otomatis
 * ============================================================
 * Memantau stok ukuran S workshirt Von Dutch secara berkala
 * dan mengirim notifikasi WhatsApp saat stok tersedia.
 *
 * Konfigurasi via .env:
 *   SHOPEE_TARGET_SIZE      = S        (ukuran yang dipantau)
 *   SHOPEE_CHECK_INTERVAL   = 5        (interval cek dalam menit, min 5)
 *   SHOPEE_NOTIFY_NUMBERS   = 628xxx@c.us,628yyy@c.us
 * ============================================================
 */

const cron    = require('node-cron');
const shopee  = require('./shopeeChecker');
const session = require('./shopeeSession');

// ─── Konfigurasi dari .env ────────────────────────────────────────────────────
const TARGET_SIZE    = (process.env.SHOPEE_TARGET_SIZE   || 'S').toUpperCase();
const CHECK_INTERVAL = Math.max(5, parseInt(process.env.SHOPEE_CHECK_INTERVAL || '5', 10));

function getNotifyNumbers() {
    const raw = process.env.SHOPEE_NOTIFY_NUMBERS || process.env.ADMIN_NUMBERS || '';
    return raw.split(',').map(n => n.trim()).filter(Boolean);
}

// ─── State ────────────────────────────────────────────────────────────────────
const notifiedItems = new Map(); // itemId → timestamp notif terakhir
const RENOTIFY_AFTER_MS = 60 * 60 * 1000; // re-notif setelah 1 jam

let isRunning     = false;
let monitorActive = false;
let cronJob       = null;

// ─── Fungsi Utama: Satu Kali Pengecekan ──────────────────────────────────────
async function runCheck(client) {
    if (isRunning) {
        console.log('[SHOPEE] ⏩ Skip: Pengecekan sebelumnya masih berjalan.');
        return null;
    }

    if (!session.getIsLoggedIn()) {
        console.log('[SHOPEE] ⚠️  Monitor skip: belum login Shopee.');
        return null;
    }

    isRunning = true;
    console.log(`[SHOPEE] 🔍 Scan stok ukuran ${TARGET_SIZE}...`);

    try {
        const availableItems = await shopee.scanCollectionForSize(TARGET_SIZE);
        const notifyNums     = getNotifyNumbers();
        const now            = Date.now();

        // Filter item yang belum dinotifikasi (atau sudah > RENOTIFY_AFTER_MS)
        const newlyAvailable = availableItems.filter(item => {
            const lastNotif = notifiedItems.get(item.itemId) || 0;
            return now - lastNotif > RENOTIFY_AFTER_MS;
        });

        if (newlyAvailable.length > 0) {
            const msg = shopee.formatNotification(newlyAvailable, TARGET_SIZE);
            console.log(`[SHOPEE] 🚨 STOK TERSEDIA! Kirim notif ke ${notifyNums.length} nomor.`);

            for (const num of notifyNums) {
                try {
                    await client.sendMessage(num, msg);
                    console.log(`[SHOPEE] ✅ Notif terkirim ke ${num}`);
                } catch (sendErr) {
                    console.error(`[SHOPEE] ❌ Gagal kirim ke ${num}:`, sendErr.message);
                }
            }

            for (const item of newlyAvailable) {
                notifiedItems.set(item.itemId, now);
            }

        } else if (availableItems.length > 0) {
            console.log(`[SHOPEE] ℹ️  ${availableItems.length} item tersedia (sudah dinotif, skip spam).`);
        } else {
            console.log(`[SHOPEE] 💤 Stok ukuran ${TARGET_SIZE} belum tersedia.`);
        }

        return availableItems;

    } catch (err) {
        console.error('[SHOPEE] ❌ Error scan:', err.message);
        return null;
    } finally {
        isRunning = false;
    }
}

// ─── Start Monitor Otomatis ───────────────────────────────────────────────────
function startMonitor(client) {
    if (monitorActive) {
        console.log('[SHOPEE] ℹ️  Monitor sudah aktif.');
        return;
    }

    const cronExpr = `*/${CHECK_INTERVAL} * * * *`;
    console.log(`[SHOPEE] 🟢 Monitor aktif — interval ${CHECK_INTERVAL} menit (${cronExpr})`);
    console.log(`[SHOPEE] 🎯 Target: Ukuran *${TARGET_SIZE}* | Von Dutch Workshirt`);

    cronJob = cron.schedule(cronExpr, () => {
        runCheck(client).catch(e => console.error('[SHOPEE CRON]', e.message));
    }, { timezone: 'Asia/Jakarta' });

    monitorActive = true;

    // Coba inisialisasi session saat pertama start
    setTimeout(async () => {
        if (session.getIsLoggedIn()) {
            runCheck(client).catch(e => console.error('[SHOPEE INIT CHECK]', e.message));
        } else {
            // Coba load session dari file
            const ok = await session.initialize().catch(() => false);
            if (ok) {
                console.log('[SHOPEE] ✅ Session dimuat, langsung cek stok...');
                runCheck(client).catch(e => console.error('[SHOPEE]', e.message));
            } else {
                console.log('[SHOPEE] ℹ️  Monitor aktif, menunggu login. Ketik !loginshopee di WhatsApp.');
            }
        }
    }, 5000);
}

// ─── Stop Monitor ─────────────────────────────────────────────────────────────
function stopMonitor() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }
    monitorActive = false;
    console.log('[SHOPEE] 🔴 Monitor dihentikan.');
}

// ─── Status ───────────────────────────────────────────────────────────────────
function getStatus() {
    return {
        active        : monitorActive,
        loggedIn      : session.getIsLoggedIn(),
        targetSize    : TARGET_SIZE,
        intervalMins  : CHECK_INTERVAL,
        notifyNums    : getNotifyNumbers(),
        isChecking    : isRunning,
        notifiedCount : notifiedItems.size,
    };
}

module.exports = {
    startMonitor,
    stopMonitor,
    runCheck,
    getStatus,
};
