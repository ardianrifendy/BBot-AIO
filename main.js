/**
 * ============================================================
 * MAIN.JS — Orchestrator (One-Click Start)
 * ============================================================
 * Penggerak seluruh ekosistem BagaskaraBot.
 * Jalankan dengan: node main.js
 *
 * Arsitektur:
 * - WhatsApp Bot: Event-driven, always-on di background
 * - Facebook Agent: Dijalankan tiap siklus (N menit)
 * - Marketplace Scraper: Dijalankan setiap 4 siklus (~4 jam)
 *
 * Bulletproof:
 * - Setiap modul dibungkus try-catch independen
 * - Satu modul crash = modul lain tetap jalan
 * - Semua error dilog ke file
 * ============================================================
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const logger = require('./core/logger');
const log    = logger.module('MAIN');
const EventEmitter = require('events');
const botEvents    = new EventEmitter();

// ── Dashboard Web UI ──────────────────────────────────────────────────────────
// Import dinamis karena dashboard/server.js adalah ESM
let dashboardIO = null;
let dashboardModule = null;


// ── Dynamic import untuk FB Agent (ES Module) ─────────────────────────────────
// FB Agent menggunakan ESM (import/export). Kita pakai dynamic import().
let runAutoPosting      = null;
let runMarketplaceScraper = null;

// ── Delay Helper ───────────────────────────────────────────────────────────────
const { randomDelay } = require('./core/delay');

// ── Konfigurasi Siklus ─────────────────────────────────────────────────────────
const CYCLE_INTERVAL_MIN = 55; // Minimal menit per siklus
const CYCLE_INTERVAL_MAX = 70; // Maksimal menit per siklus
const SCRAPER_EVERY_N_CYCLES = 4; // Scraper jalan setiap N siklus

// ── Browser Context (FB) ───────────────────────────────────────────────────────
let browserContext = null;

// ── Fase 1: Inisialisasi ───────────────────────────────────────────────────────

async function initFacebookBrowser() {
    try {
        // Import ES Module secara dinamis
        const { launchBrowser } = await import('./agents/facebook/src/browser.js');
        const { checkLoginStatus, forceLogin } = await import('./agents/facebook/src/auth.js');

        // Import runner modules
        const fbModule       = await import('./agents/facebook/index.js');
        const scraperModule  = await import('./agents/facebook/src/marketplaceScraper.js');
        runAutoPosting       = fbModule.runAutoPosting;
        runMarketplaceScraper = scraperModule.runMarketplaceScraper;

        log.info('Membuka browser Facebook (headless)...');
        browserContext = await launchBrowser(true); // true = headless

        let status = await checkLoginStatus(browserContext);

        if (!status.loggedIn) {
            log.warn('Sesi Facebook kadaluarsa atau belum login.');
            if (dashboardIO) botEvents.emit('fbStatus', { loggedIn: false });
            log.warn('Membuka browser di layar untuk login manual...');
            await browserContext.close();

            browserContext = await launchBrowser(false); // false = visible
            await forceLogin(browserContext);

            // Setelah login, switch ke headless
            await browserContext.close();
            log.info('Login berhasil. Memindahkan ke mode background...');
            browserContext = await launchBrowser(true);
            
            // Ambil nama setelah login baru
            status = await checkLoginStatus(browserContext);
        }

        log.info('✅ Browser Facebook siap (session aktif).');
        if (dashboardModule) dashboardModule.setBrowserContext(browserContext);
        
        if (dashboardIO) botEvents.emit('fbStatus', { loggedIn: true, name: status.name });
        return true;
    } catch (err) {
        log.error(`Gagal inisialisasi Facebook Browser: ${err.message}`);
        if (dashboardIO) botEvents.emit('fbStatus', { loggedIn: false });
        log.warn('Bot WhatsApp tetap berjalan. Facebook agent dinonaktifkan sementara.');
        return false;
    }
}

// ── Auto-Ready Scheduler ───────────────────────────────────────────────────────
// Cek resi "Di Jalan" setiap 30 menit → auto pindah ke Ready jika Delivered

async function runAutoReadyCheck() {
    try {
        const sheets   = require('./core/googleSheets');
        const { SHEETS } = require('./core/sheetConstants');
        const binderbyte = require('./agents/whatsapp/src/binderbyte');

        const tracks   = await sheets.getAll(SHEETS.STOCK_TRACKS);
        const stocks   = await sheets.getAll(SHEETS.STOCKS);

        // Hanya proses stok yang masih Di Jalan
        const diJalan  = stocks.filter(s => s.status !== 'Ready');
        const diJalanIds = new Set(diJalan.map(s => String(s.id)));

        const active   = tracks.filter(t => diJalanIds.has(String(t.stock_id)) && t.awb);
        if (active.length === 0) return;

        log.info(`[AUTO-READY] Memeriksa ${active.length} resi aktif...`);

        for (const track of active) {
            try {
                const data   = await binderbyte.trackReceipt(track.awb, track.courier, track.hp || '');
                const status = data?.summary?.status || '';

                // Update last_status di StockTracks (kolom 7 / index 7)
                const trackRow = await sheets.findRow(SHEETS.STOCK_TRACKS,
                    r => String(r.stock_id) === String(track.stock_id) && r.awb === track.awb
                );
                if (trackRow) {
                    await sheets.updateCell(SHEETS.STOCK_TRACKS, trackRow.rowIndex, 7, status);
                }

                if (status.toLowerCase() === 'delivered') {
                    // Pindahkan status stok ke Ready
                    const stockRow = await sheets.findRow(SHEETS.STOCKS,
                        r => String(r.id) === String(track.stock_id)
                    );
                    if (stockRow) {
                        await sheets.updateCell(SHEETS.STOCKS, stockRow.rowIndex, 3, 'Ready');
                        log.info(`[AUTO-READY] ✅ ${track.item_name} (${track.courier?.toUpperCase()} ${track.awb}) → Ready`);

                        // Emit ke dashboard
                        if (dashboardIO) {
                            dashboardIO.emit('stockAutoReady', {
                                stock_id:  track.stock_id,
                                item_name: track.item_name,
                                courier:   track.courier,
                                awb:       track.awb,
                            });
                        }
                    }
                } else {
                    log.info(`[AUTO-READY] ${track.item_name}: ${status}`);
                }

                // Delay 2 detik antar request
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                log.warn(`[AUTO-READY] Skip ${track.awb}: ${e.message}`);
            }
        }
    } catch (err) {
        log.error(`[AUTO-READY] Error: ${err.message}`);
    }
}

// ── Fase 2: Main Loop ──────────────────────────────────────────────────────────

async function mainLoop() {
    let cycleCount    = 0;
    let fbInitialized = false;

    // Coba inisialisasi FB sekali di awal
    fbInitialized = await initFacebookBrowser();

    while (true) {
        cycleCount++;
        const cycleStart = Date.now();
        log.info(`╔═══════════════════════════════════════╗`);
        log.info(`║  🔄 CYCLE #${String(cycleCount).padEnd(3)} dimulai               ║`);
        log.info(`╚═══════════════════════════════════════╝`);
        if (dashboardIO) botEvents.emit('cycleStart', { num: cycleCount });

        // ── Modul 1: Marketplace Scraper (setiap N siklus) ────────────────
        if (fbInitialized && cycleCount % SCRAPER_EVERY_N_CYCLES === 1) {
            log.info('📊 Menjalankan Marketplace Scraper...');
            try {
                await runMarketplaceScraper(browserContext);
                log.info('✅ Marketplace Scraper selesai.');
            } catch (err) {
                // ← TIDAK crash. Log error, lanjut ke modul berikutnya.
                log.error(`❌ Marketplace Scraper gagal: ${err.message}`);
            }
        } else if (fbInitialized) {
            log.info(`⏩ Marketplace Scraper dilewati (jalan di cycle ke-${SCRAPER_EVERY_N_CYCLES}).`);
        }

        // ── Modul 2: Auto-Posting Facebook ────────────────────────────────
        if (fbInitialized && runAutoPosting) {
            log.info('📤 Menjalankan Auto-Posting Facebook...');
            try {
                const result = await runAutoPosting(browserContext);
                if (result.skipped) {
                    log.info('⏩ Auto-Posting dilewati (config: active=false atau campaign tidak ada).');
                } else {
                    log.info(`✅ Auto-Posting selesai. Sukses: ${result.success} | Gagal: ${result.fail}`);
                }
            } catch (err) {
                log.error(`❌ Auto-Posting gagal: ${err.message}`);

                // Coba recover browser jika crash
                try {
                    log.warn('Mencoba restart browser Facebook...');
                    if (browserContext) await browserContext.close().catch(() => {});
                    fbInitialized = await initFacebookBrowser();
                } catch (recoverErr) {
                    log.error(`Gagal restart browser: ${recoverErr.message}`);
                    fbInitialized = false;
                }
            }
        } else {
            log.warn('⚠️  Facebook agent tidak aktif. Cek log inisialisasi di atas.');
        }

        // ── Catatan: WhatsApp Bot berjalan sendiri (event-driven) ─────────
        // Tidak perlu dipanggil di sini. Scheduler WA sudah ada di agents/whatsapp/src/scheduler.js

        // ── Jeda Antar Siklus ──────────────────────────────────────────────
        const waitSec = Math.floor(Math.random() * (CYCLE_INTERVAL_MAX - CYCLE_INTERVAL_MIN) + CYCLE_INTERVAL_MIN) * 60;
        const waitMin = Math.round(waitSec / 60);
        log.info(`⏳ Cycle #${cycleCount} selesai. Istirahat ~${waitMin} menit...\n`);
        if (dashboardIO) botEvents.emit('cycleEnd', { num: cycleCount, nextIn: waitMin });
        await randomDelay(CYCLE_INTERVAL_MIN * 60, CYCLE_INTERVAL_MAX * 60);
    }
}

// ── Entry Point ────────────────────────────────────────────────────────────────

async function main() {
    log.info('╔═══════════════════════════════════════╗');
    log.info('║   🚀 BagaskaraBot v2.0 Starting...   ║');
    log.info('║        by Bagaskara Cell 📦           ║');
    log.info('╚═══════════════════════════════════════╝');

    // ── Start Dashboard Web UI ────────────────────────────────────────────────
    try {
        const dash = await import('./dashboard/server.js');
        dashboardModule = dash;
        dashboardIO = dash.io;
        dash.setBotEmitter(botEvents);
        log.info('🌐 Dashboard berjalan di → http://localhost:3001');
    } catch (err) {
        log.warn(`Dashboard tidak tersedia: ${err.message}`);
    }


    // ── Start WhatsApp Bot (non-blocking, event-driven) ───────────────────
    log.info('Menginisialisasi WhatsApp Bot...');
    try {
        const { startWhatsAppBot, client: waClient } = require('./agents/whatsapp/index');
        startWhatsAppBot();
        log.info('✅ WhatsApp Bot diinisialisasi (menunggu QR scan / sesi restore).');

        // ── Bridging: Kirim event WA ke Dashboard ────────────────────────
        if (dashboardIO) {
            // Status QR
            waClient.on('qr', () => {
                botEvents.emit('waStatus', { ready: false, qr: true });
                botEvents.emit('log', { level: 'warn', msg: '[WA] Menunggu scan QR...' });
            });
            // Ready
            waClient.on('ready', () => {
                botEvents.emit('waStatus', { ready: true, qr: false });
                botEvents.emit('log', { level: 'info', msg: '[WA] ✅ WhatsApp Bot terhubung dan siap!' });
            });
            // Disconnect
            waClient.on('disconnected', (reason) => {
                botEvents.emit('waStatus', { ready: false, qr: false });
                botEvents.emit('log', { level: 'warn', msg: `[WA] ⚠️ Terputus: ${reason}` });
            });
            // Forward log dari winston ke dashboard console
            // Tambahkan custom transport agar setiap log diteruskan ke socket
            const Transport = require('winston-transport');
            class DashboardTransport extends Transport {
                log(info, callback) {
                    botEvents.emit('log', { level: info.level, msg: info.message });
                    callback();
                }
            }
            logger.add(new DashboardTransport({ level: 'info' }));
        }
    } catch (err) {
        log.error(`❌ WhatsApp Bot gagal start: ${err.message}`);
        log.warn('Lanjut tanpa WhatsApp Bot. Facebook agent akan tetap berjalan.');
    }

    // ── Auto-Ready Scheduler (setiap 30 menit) ───────────────────────────
    log.info('🔄 Auto-Ready Scheduler dimulai (interval: 30 menit)');
    setInterval(() => {
        runAutoReadyCheck().catch(e => log.error(`[AUTO-READY] ${e.message}`));
    }, 30 * 60 * 1000);
    // Jalankan sekali saat start
    setTimeout(() => runAutoReadyCheck(), 15000);

    // ── Tunggu sebentar agar WA client siap sebelum loop dimulai ─────────
    log.info('Menunggu 10 detik sebelum memulai Main Loop...');
    await randomDelay(8, 12);

    // ── Mulai Main Loop ───────────────────────────────────────────────────
    await mainLoop();
}

// Jalankan dengan error handler global
main().catch(err => {
    log.error(`FATAL ERROR di main(): ${err.message}`);
    log.error(err.stack);
    process.exit(1);
});
