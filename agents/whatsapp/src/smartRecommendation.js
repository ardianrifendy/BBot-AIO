/**
 * ============================================================
 * SMART RECOMMENDATION BOT — AI Sales Assistant
 * ============================================================
 * Deteksi pesan masuk dari prospek di WhatsApp DM (bukan grup).
 * Tanya budget & kebutuhan → cocokkan dengan stok Ready →
 * balas dengan 3 rekomendasi HP otomatis.
 *
 * State Machine per JID:
 *   IDLE → [trigger] → WAIT_BUDGET → WAIT_NEED → [kirim rekom] → IDLE
 * ============================================================
 */

const sheets = require('../../../core/googleSheets');
const { SHEETS } = require('../../../core/sheetConstants');
const logger = require('../../../core/logger');
const log = logger.module('SMART-REC');

// ── State Machine Storage (in-memory, per JID) ─────────────────────────────────
// Format: { jid: { state, budget, need, lastActivity } }
const sessionMap = new Map();

/** State constants */
const STATE = {
    IDLE:        'IDLE',
    WAIT_BUDGET: 'WAIT_BUDGET',
    WAIT_NEED:   'WAIT_NEED',
};

/** Timeout session: 10 menit tanpa reply → reset ke IDLE */
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

// ── Kata Kunci Trigger ─────────────────────────────────────────────────────────
const TRIGGER_KEYWORDS = [
    'stok', 'stock', 'beli', 'harga', 'ada', 'mau', 'cari',
    'hp', 'handphone', 'rekomendasi', 'rekomen', 'butuh', 'jual',
    'ready', 'murah', 'second', 'baru', 'garansi'
];

/**
 * Cek apakah pesan mengandung kata kunci trigger.
 * @param {string} text
 * @returns {boolean}
 */
const hasTriggerKeyword = (text) => {
    const lower = text.toLowerCase();
    return TRIGGER_KEYWORDS.some(kw => lower.includes(kw));
};

// ── Parser Budget ──────────────────────────────────────────────────────────────

/**
 * Parse teks budget dari user menjadi angka Rupiah.
 * Contoh: "3jt" → 3000000, "2.500.000" → 2500000, "4 juta" → 4000000
 * @param {string} text
 * @returns {number|null}
 */
const parseBudget = (text) => {
    const clean = text.toLowerCase().replace(/[,\s]/g, '').replace(/\./g, '');

    // Coba ekstrak angka + satuan
    const match = clean.match(/(\d+(?:[.,]\d+)?)(jt|juta|rb|ribu|k)?/);
    if (!match) return null;

    let amount = parseFloat(match[1].replace(',', '.'));
    const unit = match[2] || '';

    if (unit === 'jt' || unit === 'juta') amount *= 1_000_000;
    else if (unit === 'rb' || unit === 'ribu' || unit === 'k') amount *= 1_000;
    else if (amount < 1000) amount *= 1_000_000; // "3" → 3 juta (asumsi)

    return amount > 0 ? Math.round(amount) : null;
};

// ── Format Currency ────────────────────────────────────────────────────────────
const formatRupiah = (amount) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

// ── Query Stok + Catalog ───────────────────────────────────────────────────────

/**
 * Ambil daftar produk Ready beserta harga dari sheet Catalog.
 * @param {number} budgetMax - Maksimum harga jual
 * @returns {Promise<Array>}
 */
const getReadyStockWithPrice = async (budgetMax) => {
    const [stocks, catalogs] = await Promise.all([
        sheets.getAll(SHEETS.STOCKS),
        sheets.getAll(SHEETS.CATALOG),
    ]);

    // Hitung jumlah unit Ready per item_name
    const readyCounts = {};
    for (const stock of stocks) {
        if (stock.status === 'Ready') {
            readyCounts[stock.item_name] = (readyCounts[stock.item_name] || 0) + 1;
        }
    }

    // Gabungkan dengan data Catalog
    const result = [];
    for (const cat of catalogs) {
        const hargaJual = parseInt(cat.harga_jual) || 0;
        const jumlahReady = readyCounts[cat.item_name] || 0;

        if (jumlahReady > 0 && hargaJual > 0 && hargaJual <= budgetMax) {
            result.push({
                item_name:   cat.item_name,
                harga_jual:  hargaJual,
                kondisi:     cat.kondisi || 'Baru',
                deskripsi:   cat.deskripsi || '',
                jumlah_ready: jumlahReady,
            });
        }
    }

    // Sort: harga tertinggi dalam budget (paling premium untuk budget tsb)
    return result.sort((a, b) => b.harga_jual - a.harga_jual).slice(0, 3);
};

// ── Format Pesan Rekomendasi ───────────────────────────────────────────────────

const formatRecommendations = (items, budget, need) => {
    if (items.length === 0) {
        return (
            `😔 Maaf kak, untuk budget *${formatRupiah(budget)}* belum ada stok yang cocok saat ini.\n\n` +
            `Stok kami selalu update, boleh cek lagi besok atau mau saya kabarin kalau ada yang masuk? 😊\n\n` +
            `_— Bagaskara Cell 📦_`
        );
    }

    const emoji = ['1️⃣', '2️⃣', '3️⃣'];
    let msg = `✨ *${items.length} Rekomendasi HP untuk Budget ${formatRupiah(budget)}:*\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;

    items.forEach((item, i) => {
        msg += `${emoji[i]} *${item.item_name}* — ${formatRupiah(item.harga_jual)}\n`;
        msg += `   ✅ ${item.jumlah_ready} Unit Ready | ${item.kondisi}\n`;
        if (item.deskripsi) {
            msg += `   📝 ${item.deskripsi.substring(0, 80)}${item.deskripsi.length > 80 ? '...' : ''}\n`;
        }
        msg += `\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `Minat yang mana kak? Atau ada pertanyaan lain? 😊\n\n`;
    msg += `_— Bagaskara Cell 📦_`;
    return msg;
};

// ── Session Management ─────────────────────────────────────────────────────────

const getSession = (jid) => sessionMap.get(jid) || { state: STATE.IDLE };

const setSession = (jid, data) => {
    sessionMap.set(jid, { ...data, lastActivity: Date.now() });
};

const clearSession = (jid) => sessionMap.delete(jid);

/** Cek & bersihkan session yang expired */
const cleanExpiredSessions = () => {
    const now = Date.now();
    for (const [jid, session] of sessionMap.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
            sessionMap.delete(jid);
            log.debug(`Session expired: ${jid}`);
        }
    }
};
setInterval(cleanExpiredSessions, 5 * 60 * 1000); // Bersihkan setiap 5 menit

// ── Main Handler ───────────────────────────────────────────────────────────────

/**
 * Handle pesan masuk. Dipanggil dari whatsapp/index.js.
 * @param {object} msg  - Objek pesan whatsapp-web.js
 * @param {object} client - WA client instance
 * @returns {Promise<boolean>} true jika pesan ditangani oleh modul ini
 */
const handleMessage = async (msg, client) => {
    try {
        const text = (msg.body || '').trim();
        const jid  = msg.from;

        // Abaikan jika: kosong, command (dimulai !), atau dari grup
        if (!text || text.startsWith('!') || msg.isGroupMsg) return false;

        const session = getSession(jid);

        // ── State: IDLE ─────────────────────────────────────────────────────
        if (session.state === STATE.IDLE) {
            if (!hasTriggerKeyword(text)) return false; // Bukan trigger → abaikan

            // Trigger terdeteksi → tanya budget
            log.info(`Trigger dari ${jid}: "${text.substring(0, 50)}"`);
            setSession(jid, { state: STATE.WAIT_BUDGET });

            await msg.reply(
                `Halo kak! 👋 Ada nih stoknya!\n\n` +
                `Boleh tahu budget-nya berapa kak? 💰\n` +
                `_(contoh: 3jt, 3.500.000, atau 4 juta)_`
            );
            return true;
        }

        // ── State: WAIT_BUDGET ──────────────────────────────────────────────
        if (session.state === STATE.WAIT_BUDGET) {
            const budget = parseBudget(text);

            if (!budget) {
                await msg.reply(
                    `Hmm, maaf kak saya kurang nangkep budgetnya. 😅\n\n` +
                    `Boleh ketik ulang? _(contoh: "3jt" atau "3.500.000")_`
                );
                return true;
            }

            log.info(`Budget dari ${jid}: Rp ${budget.toLocaleString('id-ID')}`);
            setSession(jid, { state: STATE.WAIT_NEED, budget });

            await msg.reply(
                `Oke! Budget *${formatRupiah(budget)}* ya kak 👍\n\n` +
                `Kebutuhannya apa nih kak?\n` +
                `_(Gaming, kamera, sehari-hari, atau yang penting baterai gede?)_ 😊`
            );
            return true;
        }

        // ── State: WAIT_NEED ────────────────────────────────────────────────
        if (session.state === STATE.WAIT_NEED) {
            const { budget } = session;
            const need = text;

            log.info(`Kebutuhan dari ${jid}: "${need}" | Budget: Rp ${budget.toLocaleString('id-ID')}`);

            // Ambil & kirim rekomendasi
            const items = await getReadyStockWithPrice(budget);
            const replyMsg = formatRecommendations(items, budget, need);

            await msg.reply(replyMsg);

            // Reset session ke IDLE
            clearSession(jid);
            log.info(`Rekomendasi terkirim ke ${jid} (${items.length} item).`);
            return true;
        }

    } catch (err) {
        log.error(`Error di handleMessage: ${err.message}`);
    }

    return false;
};

module.exports = { handleMessage };
