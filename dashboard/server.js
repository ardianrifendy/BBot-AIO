/**
 * ============================================================
 * DASHBOARD SERVER — BagaskaraBot Web UI
 * ============================================================
 * Express + Socket.io server untuk monitoring real-time.
 * Jalankan via: node dashboard/server.js
 * Atau otomatis via main.js
 * Buka browser: http://localhost:3001
 * ============================================================
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import multer from 'multer';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const sheets     = require('../core/googleSheets');
const { SHEETS } = require('../core/sheetConstants');

const PORT   = parseInt(process.env.DASHBOARD_PORT) || 3001;
const TOKEN  = process.env.DASHBOARD_TOKEN || '';          // kosong = no auth (dev mode)
const app    = express();
const server = createServer(app);
const io     = new Server(server);

// ── In-Memory Cache (TTL 5 menit) ─────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
const _cache    = new Map();

function cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
    return entry.data;
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }
function cacheInvalidate(...keys) { keys.forEach(k => _cache.delete(k)); }

async function cachedSheets(key, fn) {
    const hit = cacheGet(key);
    if (hit) return hit;
    const data = await fn();
    cacheSet(key, data);
    return data;
}

// ── Input Sanitizer ────────────────────────────────────────────────────────────
const sanitize = (val, maxLen = 200) => {
    if (val == null) return '';
    return String(val).trim().replace(/[<>"']/g, '').slice(0, maxLen);
};
const sanitizeId = (val) => String(val || '').replace(/\D/g, '').slice(0, 10);

// ── Auth Middleware (opsional, aktif jika DASHBOARD_TOKEN diset) ───────────────
const authMiddleware = (req, res, next) => {
    if (!TOKEN) return next();                          // dev mode: no auth
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    const query  = req.query.token;
    if (bearer === TOKEN || query === TOKEN) return next();
    // Beri akses ke file statis tanpa auth agar halaman login bisa muncul
    if (req.path === '/' || req.path.startsWith('/socket.io')) return next();
    res.status(401).json({ error: 'Unauthorized. Set DASHBOARD_TOKEN di .env' });
};

// ── Upload Gambar ──────────────────────────────────────────────────────────────
const IMAGES_DIR = path.resolve(__dirname, '../agents/facebook/images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, IMAGES_DIR),
        filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },   // max 10 MB per file, 5 files
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Hanya file gambar yang diizinkan (jpg, png, webp, gif)'));
    }
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', authMiddleware);

app.post('/upload', authMiddleware, upload.array('images'), (req, res) => {
    res.json({ filenames: req.files.map(f => f.filename) });
});

// ── Log / Config Files ─────────────────────────────────────────────────────────
const LOGS_DIR       = path.resolve(__dirname, '../reports/logs');
const SUCCESS_LOG    = path.join(LOGS_DIR, 'fb_success.txt');
const FAILED_LOG     = path.join(LOGS_DIR, 'fb_failed.txt');
const CONFIG_FILE    = path.resolve(__dirname, '../posting_config.json');
const CAMPAIGNS_FILE = path.resolve(__dirname, '../agents/facebook/campaigns.json');

const readLastLines = (file, n = 50) => {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-n).reverse();
};
const loadConfig    = () => fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
const saveConfig    = (data) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
const loadCampaigns = () => fs.existsSync(CAMPAIGNS_FILE) ? JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8')) : {};

// ── Health Check ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
        cache:  _cache.size + ' entries',
        time:   new Date().toISOString(),
        version: '2.0.0'
    });
});

// ── REST API ───────────────────────────────────────────────────────────────────

// GET: Statistik stok
app.get('/api/stats', async (req, res) => {
    try {
        const stocks      = await cachedSheets('stocks',      () => sheets.getAll(SHEETS.STOCKS));
        const catalog     = await cachedSheets('catalog',     () => sheets.getAll(SHEETS.CATALOG));
        const marketplace = await cachedSheets('marketplace', () => sheets.getAll(SHEETS.MARKETPLACE_PRICES));

        const readyCount   = stocks.filter(s => s.status === 'Ready').length;
        const jalanCount   = stocks.filter(s => s.status !== 'Ready').length;
        const staleCount   = stocks.filter(s => {
            if (s.status !== 'Ready') return false;
            const d = new Date(s.created_at);
            return !isNaN(d) && (Date.now() - d) > 30 * 86400000;
        }).length;

        // Hitung omzet dari catalog × stok ready
        let modalTertahan = 0, potensiOmzet = 0;
        const hargaMap = {};
        catalog.forEach(c => {
            hargaMap[c.item_name] = { beli: parseInt(c.harga_beli) || 0, jual: parseInt(c.harga_jual) || 0 };
        });
        stocks.filter(s => s.status === 'Ready').forEach(s => {
            const h = hargaMap[s.item_name] || {};
            modalTertahan += h.beli || 0;
            potensiOmzet  += h.jual || 0;
        });

        const avgPrices = {};
        marketplace.forEach(m => {
            if (m.keyword && m.harga_rata2) avgPrices[m.keyword] = parseInt(m.harga_rata2);
        });

        res.json({
            readyCount, jalanCount, staleCount,
            totalStock: stocks.length, totalProduct: catalog.length,
            modalTertahan, potensiOmzet,
            avgPrices
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Daftar stok
app.get('/api/stocks', async (req, res) => {
    try {
        const [stocks, users] = await Promise.all([
            cachedSheets('stocks', () => sheets.getAll(SHEETS.STOCKS)),
            cachedSheets('users',  () => sheets.getAll(SHEETS.USERS)),
        ]);
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u.name; });
        res.json(stocks.map(s => ({ ...s, user_name: userMap[s.user_id] || s.user_id })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: StockTracks
app.get('/api/stocktracks', async (req, res) => {
    try {
        res.json(await cachedSheets('stocktracks', () => sheets.getAll(SHEETS.STOCK_TRACKS)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Tambah / update resi ke stok Di Jalan
app.post('/api/stocktracks/add', async (req, res) => {
    try {
        const stock_id = sanitizeId(req.body.stock_id);
        const courier  = sanitize(req.body.courier, 20).toLowerCase();
        const awb      = sanitize(req.body.awb, 50);
        const hp       = sanitize(req.body.hp, 20);

        if (!stock_id || !courier || !awb)
            return res.status(400).json({ error: 'stock_id, courier, awb wajib diisi' });

        const stockRow = await sheets.findRow(SHEETS.STOCKS, r => String(r.id) === stock_id);
        if (!stockRow) return res.status(404).json({ error: 'Stok tidak ditemukan' });

        const { trackReceipt } = require('../agents/whatsapp/src/binderbyte');
        let initialStatus = '';
        try {
            const td = await trackReceipt(awb, courier, hp);
            initialStatus = td?.summary?.status || '';
        } catch (apiErr) {
            return res.json({ error: `Resi tidak valid: ${apiErr.message}` });
        }

        const existing = await sheets.findRow(SHEETS.STOCK_TRACKS, r => String(r.stock_id) === stock_id);
        if (existing) await sheets.deleteRow(SHEETS.STOCK_TRACKS, existing.rowIndex);

        const id  = await sheets.getNextId(SHEETS.STOCK_TRACKS);
        await sheets.appendRow(SHEETS.STOCK_TRACKS, [
            id, stock_id, stockRow.data.user_id, stockRow.data.item_name,
            courier, awb, hp, initialStatus, 'dashboard', new Date().toISOString()
        ]);

        cacheInvalidate('stocktracks', 'stocks');

        if (initialStatus.toLowerCase() === 'delivered') {
            await sheets.updateCell(SHEETS.STOCKS, stockRow.rowIndex, 3, 'Ready');
            cacheInvalidate('stocks');
            io.emit('stockAutoReady', { stock_id, item_name: stockRow.data.item_name, courier, awb });
        }

        res.json({ ok: true, initialStatus, replaced: !!existing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Stock CRUD ────────────────────────────────────────────────────────────────

app.post('/api/stocks/add', async (req, res) => {
    try {
        const user_name = sanitize(req.body.user_name, 50);
        const status    = ['Ready', 'Not Ready'].includes(req.body.status) ? req.body.status : 'Ready';
        const itemList  = (Array.isArray(req.body.items) ? req.body.items : [req.body.items])
            .map(i => sanitize(i, 100)).filter(Boolean);

        if (!user_name) return res.status(400).json({ error: 'user_name wajib diisi' });
        if (!itemList.length) return res.status(400).json({ error: 'items tidak boleh kosong' });

        const users = await cachedSheets('users', () => sheets.getAll(SHEETS.USERS));
        const user  = users.find(u => u.name?.toLowerCase() === user_name.toLowerCase());
        if (!user) return res.status(404).json({ error: `User "${user_name}" tidak ditemukan` });

        const results = [];
        for (const item_name of itemList) {
            const id = await sheets.getNextId(SHEETS.STOCKS);
            await sheets.appendRow(SHEETS.STOCKS, [id, user.id, item_name, status, new Date().toISOString()]);
            results.push({ id, item_name });
        }
        cacheInvalidate('stocks');
        res.json({ ok: true, added: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/stocks/:id/rename', async (req, res) => {
    try {
        const id        = sanitizeId(req.params.id);
        const item_name = sanitize(req.body.item_name, 100);
        if (!item_name) return res.status(400).json({ error: 'item_name tidak boleh kosong' });
        const found = await sheets.findRow(SHEETS.STOCKS, r => String(r.id) === id);
        if (!found) return res.status(404).json({ error: 'Stok tidak ditemukan' });
        await sheets.updateCell(SHEETS.STOCKS, found.rowIndex, 2, item_name);
        cacheInvalidate('stocks');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/stocks/:id/status', async (req, res) => {
    try {
        const id     = sanitizeId(req.params.id);
        const status = ['Ready', 'Not Ready'].includes(req.body.status) ? req.body.status : null;
        if (!status) return res.status(400).json({ error: 'Status tidak valid' });
        const found = await sheets.findRow(SHEETS.STOCKS, r => String(r.id) === id);
        if (!found) return res.status(404).json({ error: 'Stok tidak ditemukan' });
        await sheets.updateCell(SHEETS.STOCKS, found.rowIndex, 3, status);
        cacheInvalidate('stocks');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/stocks/:id', async (req, res) => {
    try {
        const id   = sanitizeId(req.params.id);
        const found = await sheets.findRow(SHEETS.STOCKS, r => String(r.id) === id);
        if (!found) return res.status(404).json({ error: 'Stok tidak ditemukan' });
        await sheets.deleteRow(SHEETS.STOCKS, found.rowIndex);
        cacheInvalidate('stocks');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Tandai Terjual
app.post('/api/stocks/:id/sell', async (req, res) => {
    try {
        const id          = sanitizeId(req.params.id);
        const harga_jual  = parseInt(req.body.harga_jual) || 0;
        const pembeli     = sanitize(req.body.pembeli, 100);
        const catatan     = sanitize(req.body.catatan, 200);

        const stockRow = await sheets.findRow(SHEETS.STOCKS, r => String(r.id) === id);
        if (!stockRow) return res.status(404).json({ error: 'Stok tidak ditemukan' });

        const s = stockRow.data;
        const txId = await sheets.getNextId(SHEETS.TRANSACTIONS);
        await sheets.appendRow(SHEETS.TRANSACTIONS, [
            txId, new Date().toISOString(), s.user_id, s.item_name,
            harga_jual, pembeli, catatan
        ]);

        await sheets.deleteRow(SHEETS.STOCKS, stockRow.rowIndex);
        cacheInvalidate('stocks', 'transactions');

        io.emit('stockSold', { item_name: s.item_name, harga_jual, pembeli });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Tambah transaksi historis manual
app.post('/api/transactions/add', async (req, res) => {
    try {
        const item_name  = sanitize(req.body.item_name, 100);
        const user_name  = sanitize(req.body.user_name, 50);
        const harga_jual = parseInt(req.body.harga_jual) || 0;
        const pembeli    = sanitize(req.body.pembeli, 100);
        const catatan    = sanitize(req.body.catatan, 200);
        const date       = sanitize(req.body.date, 30) || new Date().toISOString();

        if (!item_name) return res.status(400).json({ error: 'item_name wajib diisi' });

        // Cari user_id dari nama
        const users  = await cachedSheets('users', () => sheets.getAll(SHEETS.USERS));
        const user   = users.find(u => u.name?.toLowerCase() === user_name.toLowerCase());
        const userId = user ? user.id : user_name; // fallback pakai nama jika user tidak ditemukan

        const txId = await sheets.getNextId(SHEETS.TRANSACTIONS);
        await sheets.appendRow(SHEETS.TRANSACTIONS, [
            txId, date, userId, item_name, harga_jual, pembeli, catatan
        ]);
        cacheInvalidate('transactions');
        res.json({ ok: true, id: txId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH: Edit transaksi
app.patch('/api/transactions/:id', async (req, res) => {
    try {
        const id = sanitizeId(req.params.id);
        const found = await sheets.findRow(SHEETS.TRANSACTIONS, r => String(r.id) === id);
        if (!found) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

        const headers = ['id','date','user_id','item_name','harga_jual','pembeli','catatan'];
        const current = found.data;

        // Resolve user_id dari user_name jika dikirim
        let user_id = current.user_id;
        if (req.body.user_name !== undefined) {
            const users = await cachedSheets('users', () => sheets.getAll(SHEETS.USERS));
            const user  = users.find(u => u.name?.toLowerCase() === String(req.body.user_name).toLowerCase());
            user_id = user ? user.id : sanitize(req.body.user_name, 50);
        }

        const updated = [
            current.id,
            req.body.date       ? sanitize(req.body.date, 30)       : current.date,
            user_id,
            req.body.item_name  ? sanitize(req.body.item_name, 100)  : current.item_name,
            req.body.harga_jual !== undefined ? (parseInt(req.body.harga_jual)||0) : current.harga_jual,
            req.body.pembeli    !== undefined ? sanitize(req.body.pembeli, 100)    : current.pembeli,
            req.body.catatan    !== undefined ? sanitize(req.body.catatan, 200)    : current.catatan,
        ];

        await sheets.updateRow(SHEETS.TRANSACTIONS, found.rowIndex, updated);
        cacheInvalidate('transactions');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Hapus transaksi
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const id = sanitizeId(req.params.id);
        const found = await sheets.findRow(SHEETS.TRANSACTIONS, r => String(r.id) === id);
        if (!found) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
        await sheets.deleteRow(SHEETS.TRANSACTIONS, found.rowIndex);
        cacheInvalidate('transactions');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Users
app.get('/api/users', async (req, res) => {
    try {
        res.json(await cachedSheets('users', () => sheets.getAll(SHEETS.USERS)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Cek resi via BinderByte
app.post('/api/track', async (req, res) => {
    try {
        const courier = sanitize(req.body.courier, 20).toLowerCase();
        const awb     = sanitize(req.body.awb, 50);
        const hp      = sanitize(req.body.hp, 20);
        if (!courier || !awb) return res.status(400).json({ error: 'Kurir dan AWB wajib diisi' });

        const { trackReceipt } = require('../agents/whatsapp/src/binderbyte');
        const data = await trackReceipt(awb, courier, hp);
        res.json(data);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// GET: Riwayat Penjualan (Transactions sheet)
app.get('/api/transactions', async (req, res) => {
    try {
        const [txs, users, catalog] = await Promise.all([
            cachedSheets('transactions', () => sheets.getAll(SHEETS.TRANSACTIONS)),
            cachedSheets('users',        () => sheets.getAll(SHEETS.USERS)),
            cachedSheets('catalog',      () => sheets.getAll(SHEETS.CATALOG)),
        ]);

        const userMap = {};
        users.forEach(u => { userMap[u.id] = u.name; });

        const buyMap = {};
        catalog.forEach(c => { buyMap[c.item_name] = parseInt(c.harga_beli) || 0; });

        const result = txs.map(t => ({
            ...t,
            user_name:  userMap[t.user_id] || t.user_id,
            harga_jual: parseInt(t.harga_jual) || 0,
            harga_beli: buyMap[t.item_name]   || 0,
            profit:     (parseInt(t.harga_jual) || 0) - (buyMap[t.item_name] || 0),
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Katalog + harga kompetitor
app.get('/api/catalog', async (req, res) => {
    try {
        const [catalog, marketplace, stocks] = await Promise.all([
            cachedSheets('catalog',     () => sheets.getAll(SHEETS.CATALOG)),
            cachedSheets('marketplace', () => sheets.getAll(SHEETS.MARKETPLACE_PRICES)),
            cachedSheets('stocks',      () => sheets.getAll(SHEETS.STOCKS)),
        ]);

        const readyCounts = {};
        stocks.forEach(s => {
            if (s.status === 'Ready') readyCounts[s.item_name] = (readyCounts[s.item_name] || 0) + 1;
        });
        const avgPrices = {};
        marketplace.forEach(m => {
            if (m.keyword) avgPrices[m.keyword] = {
                avg: parseInt(m.harga_rata2), min: parseInt(m.harga_min),
                max: parseInt(m.harga_max), scraped_at: m.scraped_at
            };
        });
        res.json(catalog.map(c => ({
            ...c,
            ready_count: readyCounts[c.item_name] || 0,
            competitor:  avgPrices[c.item_name]   || null,
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Log FB posting
app.get('/api/logs/fb', (req, res) => {
    res.json({ success: readLastLines(SUCCESS_LOG, 30), failed: readLastLines(FAILED_LOG, 20) });
});

// GET/POST: Config posting
app.get('/api/config', (req, res) => {
    res.json({ config: loadConfig(), campaigns: Object.keys(loadCampaigns()) });
});
app.post('/api/config', (req, res) => {
    const updated = { ...loadConfig(), ...req.body };
    saveConfig(updated);
    io.emit('configUpdated', updated);
    res.json({ ok: true, config: updated });
});

// POST: Force-clear semua cache (untuk sinkronisasi setelah edit langsung di Sheets)
app.post('/api/cache/clear', (req, res) => {
    _cache.clear();
    res.json({ ok: true, msg: 'Cache dikosongkan — data akan diambil ulang dari Google Sheets.' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

// Simpan status terakhir agar client baru langsung dapat status yang benar
const lastStatus = {
    wa: { ready: false, qr: false },
    fb: { loggedIn: false },
};

let botEmitter = null;
export function setBotEmitter(emitter) {
    botEmitter = emitter;
    emitter.on('log',          (d) => io.emit('botLog', d));
    emitter.on('cycleStart',   (d) => io.emit('cycleStart', d));
    emitter.on('cycleEnd',     (d) => io.emit('cycleEnd', d));
    emitter.on('waStatus',     (d) => { lastStatus.wa = d; io.emit('waStatus', d); });
    emitter.on('fbStatus',     (d) => { lastStatus.fb = d; io.emit('fbStatus', d); });
    emitter.on('postProgress', (d) => io.emit('postProgress', d));
}

let sharedBrowserContext = null;
export function setBrowserContext(ctx) {
    sharedBrowserContext = ctx;
}

io.on('connection', (socket) => {
    console.log(`[DASHBOARD] Client terhubung: ${socket.id}`);
    socket.emit('configUpdated', loadConfig());
    // Kirim status terakhir ke client baru agar tidak perlu menunggu event
    socket.emit('waStatus', lastStatus.wa);
    socket.emit('fbStatus', lastStatus.fb);

    socket.on('disconnect', () => console.log(`[DASHBOARD] Client disconnect: ${socket.id}`));

    socket.on('togglePosting', (active) => {
        const cfg = loadConfig(); cfg.active = active; saveConfig(cfg);
        io.emit('configUpdated', cfg);
        io.emit('botLog', { level: 'info', msg: `Auto-posting ${active ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'} via Dashboard` });
    });

    // ── Manual Posting Handlers ────────────────────────────────────────────────

    socket.on('checkFbAuth', async () => {
        try {
            const { launchBrowser }   = await import('../agents/facebook/src/browser.js');
            const { checkLoginStatus } = await import('../agents/facebook/src/auth.js');
            
            const ctx = sharedBrowserContext || global.fbBrowserContext;
            if (!ctx) {
                global.fbBrowserContext = await launchBrowser(true);
            }
            
            const targetCtx = sharedBrowserContext || global.fbBrowserContext;
            const status = await checkLoginStatus(targetCtx);
            
            if (status.loggedIn) { 
                socket.emit('fbAuthResult', { loggedIn: true, name: status.name }); 
            } else {
                if (sharedBrowserContext) {
                    socket.emit('fbAuthResult', { loggedIn: false, error: 'Session expired. Restart bot untuk login ulang.' });
                } else {
                    if (global.fbBrowserContext) await global.fbBrowserContext.close().catch(() => {});
                    global.fbBrowserContext = await launchBrowser(false);
                    socket.emit('fbAuthResult', { loggedIn: false });
                }
            }
        } catch (err) {
            console.error('[DASHBOARD] checkFbAuth error:', err.message);
            socket.emit('fbAuthResult', { loggedIn: false, error: err.message });
        }
    });

    socket.on('confirmFbLogin', async () => {
        try {
            const { launchBrowser }   = await import('../agents/facebook/src/browser.js');
            const { checkLoginStatus } = await import('../agents/facebook/src/auth.js');
            
            const ctx = sharedBrowserContext || global.fbBrowserContext;
            if (!ctx) return socket.emit('fbAuthResult', { loggedIn: false });

            const status = await checkLoginStatus(ctx);
            if (status.loggedIn) {
                if (!sharedBrowserContext) {
                    await global.fbBrowserContext.close().catch(() => {});
                    global.fbBrowserContext = await launchBrowser(true);
                }
                socket.emit('fbAuthResult', { loggedIn: true, name: status.name });
            } else socket.emit('fbAuthResult', { loggedIn: false });
        } catch { socket.emit('fbAuthResult', { loggedIn: false }); }
    });

    socket.on('getCampaignGroups', (name) => {
        const campaigns = loadCampaigns();
        socket.emit('campaignGroups', { name, groups: campaigns[name] || [] });
    });

    socket.on('scrapeGroups', async (keyword) => {
        const ctx = sharedBrowserContext || global.fbBrowserContext;
        if (!ctx) return socket.emit('scrapeResult', []);
        try {
            const { scrapeJoinedGroups } = await import('../agents/facebook/src/scraper.js');
            socket.emit('postLog', `🔍 Mencari grup: "${keyword || 'semua'}"`);
            const groups = await scrapeJoinedGroups(ctx, keyword);
            socket.emit('scrapeResult', groups);
        } catch (err) {
            socket.emit('postLog', `❌ Scrape error: ${err.message}`);
            socket.emit('scrapeResult', []);
        }
    });

    socket.on('saveCampaign', ({ name, groups }) => {
        const campaigns = loadCampaigns();
        campaigns[sanitize(name, 50)] = groups;
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
    });

    let stopSignal = false;
    socket.on('startPosting', async (data) => {
        const ctx = sharedBrowserContext || global.fbBrowserContext;
        if (!ctx) {
            socket.emit('postLog', '❌ Browser tidak aktif. Login dulu.');
            return;
        }
        let success = 0, fail = 0, skip = 0;
        try {
            const { postToGroup }  = await import('../agents/facebook/src/poster.js');
            const { parseSpintax } = await import('../agents/facebook/src/spintax.js');
            const { targetGroups, title, price, text, images } = data;
            socket.emit('postLog', `🔥 Mulai posting ke ${targetGroups.length} grup...`);
            for (let i = 0; i < targetGroups.length; i++) {
                if (stopSignal) break;
                const group = targetGroups[i];
                socket.emit('postLog', `➡️ [${i+1}/${targetGroups.length}] ${group.name}`);
                socket.emit('postProgress', { current: i+1, total: targetGroups.length, success, fail, skip });
                try {
                    const result = await postToGroup(
                        global.fbBrowserContext, group,
                        parseSpintax(title || ''), parseSpintax(price || ''),
                        parseSpintax(text), images
                    );
                    if (result.success) { success++; socket.emit('postLog', `✅ ${group.name}`); }
                    else                { fail++;    socket.emit('postLog', `❌ ${group.name}: ${result.error}`); }
                } catch (e) { fail++; socket.emit('postLog', `❌ ${group.name}: ${e.message}`); }

                if (i < targetGroups.length - 1 && !stopSignal) {
                    const d = Math.floor(Math.random() * 15000 + 15000);
                    socket.emit('postLog', `⏳ Jeda ${Math.round(d/1000)}s...`);
                    await new Promise(r => setTimeout(r, d));
                }
            }
        } catch (err) { socket.emit('postLog', `❌ Fatal: ${err.message}`); }
        socket.emit('postProgress', { current: targetGroups.length, total: targetGroups.length, success, fail, skip });
        socket.emit('postComplete', { success, fail, skip });
    });

    socket.on('stopPosting', () => { stopSignal = true; });
});

// ── Start Server ───────────────────────────────────────────────────────────────
function openBrowser(url) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(cmd, (err) => {
        if (err) console.log(`[DASHBOARD] ⚠️ Tidak bisa buka browser: ${err.message}`);
        else     console.log(`[DASHBOARD] 🚀 Browser dibuka → ${url}`);
    });
}

function startServer(port) {
    server.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`[DASHBOARD] 🌐 Web UI berjalan di → ${url}`);
        if (!TOKEN) console.log(`[DASHBOARD] ⚠️  Mode dev — set DASHBOARD_TOKEN di .env untuk mengaktifkan auth`);
        setTimeout(() => openBrowser(url), 2000);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[DASHBOARD] ⚠️ Port ${port} sibuk, mencoba ${port + 1}...`);
            server.close(); startServer(port + 1);
        } else {
            console.error('[DASHBOARD] Server error:', err.message);
        }
    });
}

startServer(PORT);
export { io };
