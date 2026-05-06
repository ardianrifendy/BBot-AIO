/**
 * ============================================================
 * WHATSAPP BOT — Entry Point
 * ============================================================
 * Refactored dari WaResiBot/index.js.
 * Tambahan: Integrasi smartRecommendation module.
 *
 * Export: startWhatsAppBot() — dipanggil dari main.js
 * ============================================================
 */

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const logger = require('../../core/logger');
const log = logger.module('WA-BOT');

const smartRec = require('./src/smartRecommendation');

// ── Inisialisasi WA Client ─────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.resolve(__dirname, './.wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu'
        ]
    },
    webVersionCache: { type: 'local' }
});

// ── Command Map ────────────────────────────────────────────────────────────────
const commandsMap = {
    // Tracking
    '!cekresi': require('./src/commands/cekresi'),
    '!track':   require('./src/commands/cekresi'),
    '!cek':     require('./src/commands/cekresi'),
    '!history': require('./src/commands/history'),
    '!h':       require('./src/commands/history'),
    '!ch':      require('./src/commands/historyCheck'),
    '!c':       require('./src/commands/clear'),
    '!clear':   require('./src/commands/clear'),
    '!delete':  require('./src/commands/delete'),
    '!del':     require('./src/commands/delete'),
    '!d':       require('./src/commands/delete'),
    '!help':    require('./src/commands/help'),
    '!bantuan': require('./src/commands/help'),
    '!restartbot': require('./src/commands/restart'),

    // Stock Opname
    '!adduser':       require('./src/commands/adduser'),
    '!addready':      require('./src/commands/addstock'),
    '!tambahready':   require('./src/commands/addstock'),
    '!addnotready':   require('./src/commands/addstock'),
    '!tambahdijalan': require('./src/commands/addstock'),
    '!liststock':     require('./src/commands/liststock'),
    '!list':          require('./src/commands/liststock'),
    '!l':             require('./src/commands/liststock'),
    '!move':          require('./src/commands/movestock'),
    '!deletestock':   require('./src/commands/deletestock'),
    '!delstok':       require('./src/commands/deletestock'),
    '!ds':            require('./src/commands/deletestock'),
    '!renameready':   require('./src/commands/renamestock'),
    '!renamenotready':require('./src/commands/renamestock'),
    '!summary':       require('./src/commands/summary'),
    '!s':             require('./src/commands/summary'),
    '!status':        require('./src/commands/status'),
    '!ping':          require('./src/commands/status'),

    // Stock Auto-Track
    '!addtrack':    require('./src/commands/addtrack'),
    '!listtrack':   require('./src/commands/listtrack'),
    '!lt':          require('./src/commands/listtrack'),
    '!removetrack': require('./src/commands/removetrack'),
    '!rmtrack':     require('./src/commands/removetrack'),

    // Sales (Penjualan)
    '!terjual':      require('./src/commands/sell'),
    '!sold':         require('./src/commands/sell'),
    '!penjualan':    require('./src/commands/salesSummary'),
    '!omzet':        require('./src/commands/salesSummary'),
};

// ── Events ─────────────────────────────────────────────────────────────────────

client.on('qr', (qr) => {
    log.info('Scan QR Code untuk login WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    log.info('✅ WhatsApp Bot terhubung dan siap!');

    // Mulai scheduler (auto-cek resi & daily report)
    const scheduler = require('./src/scheduler');
    scheduler.start(client);
});

// ── Rate Limiter (anti-spam, per JID) ──────────────────────────────────────────
const RATE_LIMIT_MS  = 3000;   // Minimal jeda antar perintah per user
const _lastCmd       = new Map(); // Map<jid, timestamp>

function isRateLimited(jid) {
    const last = _lastCmd.get(jid) || 0;
    if (Date.now() - last < RATE_LIMIT_MS) return true;
    _lastCmd.set(jid, Date.now());
    // Bersihkan map tiap 500 entry agar tidak bocor memori
    if (_lastCmd.size > 500) {
        const oldest = [..._lastCmd.entries()].sort((a,b) => a[1]-b[1]);
        oldest.slice(0, 100).forEach(([k]) => _lastCmd.delete(k));
    }
    return false;
}

client.on('message', async (msg) => {
    const text = msg.body;
    if (!text) return;

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    let firstLine = lines[0];
    if (firstLine.startsWith('! ')) firstLine = '!' + firstLine.slice(2).trim();

    const args    = firstLine.split(' ');
    const command = args[0].toLowerCase();

    if (!command.startsWith('!')) {
        // Fitur Smart Recommendation (DIMATIKAN SESUAI PERMINTAAN USER)
        // try { await smartRec.handleMessage(msg, client); } catch (e) { log.error(`Smart Rec error: ${e.message}`); }
        return;
    }

    // Rate limit per JID (kecuali perintah !status dan !ping)
    const jid = msg.author || msg.from;
    if (!['!status', '!ping'].includes(command) && isRateLimited(jid)) {
        return; // silent skip — jangan balas agar tidak spam
    }

    let targetCommand = command;
    if ((command === '!h' || command === '!history') && args[1]?.toLowerCase() === 'delete') {
        targetCommand = '!h delete';
    }

    try {
        if (targetCommand === '!h delete') {
            const historyDelete = require('./src/commands/historyDelete');
            return await historyDelete.execute(msg, args, client, text, lines);
        }
        if (commandsMap[targetCommand]) {
            return await commandsMap[targetCommand].execute(msg, args, client, text, lines);
        }
    } catch (e) {
        log.error(`Command error [${targetCommand}]: ${e.message}`);
    }
});

// ── Welcome Message ────────────────────────────────────────────────────────────
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        if (!chat || !chat.isGroup) return;

        const contactId = notification.recipientIds?.[0] || '';
        let memberName  = contactId.replace('@c.us', '');
        try {
            const contact = await client.getContactById(contactId);
            memberName = contact.pushname || contact.name || memberName;
        } catch (_) {}

        const welcomeMsg =
            `Selamat datang, *${memberName}*! 👋🎉\n\n` +
            `Aku adalah *bot asisten* Bagaskara Cell.\n\n` +
            `📦 *Yang bisa aku bantu:*\n` +
            `• Cek resi pengiriman  → ketik \`!help tracking\`\n` +
            `• Info stok barang     → ketik \`!help stok\`\n` +
            `• Rekomendasi HP       → DM langsung ya kak 😊\n\n` +
            `Ketik \`!help\` untuk panduan lengkap 🙂\n\n` +
            `_— *Bagaskara Cell* 📦_`;

        await chat.sendMessage(welcomeMsg);
        log.info(`Welcome message terkirim ke: ${memberName}`);
    } catch (e) {
        log.error(`Gagal kirim welcome: ${e.message}`);
    }
});

// ── Export: startWhatsAppBot ───────────────────────────────────────────────────

/**
 * Inisialisasi dan jalankan WhatsApp bot.
 * Non-blocking — berjalan event-driven di background.
 */
const startWhatsAppBot = () => {
    log.info('Menginisialisasi WhatsApp Bot...');
    client.initialize();
};

module.exports = { startWhatsAppBot, client };
