/**
 * Database Layer - Google Sheets Backend
 * API tetap sama dengan versi SQLite sebelumnya
 * agar semua command module tidak perlu diubah.
 */
const sheets = require('../../../core/googleSheets');
const { SHEETS } = sheets;

// ==========================================
// HISTORY FUNCTIONS
// ==========================================

const addHistory = async (user_jid, courier, awb, hp = '') => {
    // Cek duplikat (UNIQUE: user_jid + courier + awb)
    const existing = await sheets.findRow(SHEETS.HISTORY, row =>
        row.user_jid === user_jid && row.courier === courier && row.awb === awb
    );

    if (existing) {
        // Update hp jika ada
        if (hp) {
            const colIndex = sheets.HEADERS[SHEETS.HISTORY].indexOf('hp');
            await sheets.updateCell(SHEETS.HISTORY, existing.rowIndex, colIndex, hp);
        }
        return;
    }

    const now = new Date().toISOString();
    await sheets.appendRow(SHEETS.HISTORY, [user_jid, courier, awb, hp, now]);
};

const getHistory = async (user_jid) => {
    const rows = await sheets.findRows(SHEETS.HISTORY, row => row.user_jid === user_jid);
    return rows.map(r => r.data).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
};

const deleteHistory = async (user_jid, id = null) => {
    if (id !== null) {
        // Hapus berdasarkan spesifik row: kita gunakan index unik
        // Karena sheets tidak punya ID internal, "id" di sini adalah index dari getHistory result
        // Kita perlu cari semua history user_jid lalu hapus yang cocok dari id
        const allUserHistory = await sheets.findRows(SHEETS.HISTORY, row => row.user_jid === user_jid);
        const sorted = allUserHistory.sort((a, b) => (a.data.created_at || '').localeCompare(b.data.created_at || ''));

        // ID dianggap sebagai composite key: courier+awb
        // Cari berdasarkan id yang sebenarnya match di display
        const target = sorted.find(r => `${r.data.courier}:${r.data.awb}` === id);
        if (target) {
            await sheets.deleteRow(SHEETS.HISTORY, target.rowIndex);
            return 1;
        }
        return 0;
    } else {
        // Hapus semua milik user
        const allUserHistory = await sheets.findRows(SHEETS.HISTORY, row => row.user_jid === user_jid);
        // Hapus dari bawah ke atas agar rowIndex tidak bergeser
        const sorted = allUserHistory.sort((a, b) => b.rowIndex - a.rowIndex);
        for (const entry of sorted) {
            await sheets.deleteRow(SHEETS.HISTORY, entry.rowIndex);
        }
        return sorted.length;
    }
};

// ==========================================
// ACTIVE TRACKS FUNCTIONS
// ==========================================

const addActiveTrack = async (user_jid, courier, awb, hp = '', last_status = '') => {
    const now = new Date().toISOString();

    // Cek existing (REPLACE jika ada)
    const existing = await sheets.findRow(SHEETS.ACTIVE_TRACKS, row =>
        row.user_jid === user_jid && row.courier === courier && row.awb === awb
    );

    if (existing) {
        await sheets.updateRow(SHEETS.ACTIVE_TRACKS, existing.rowIndex,
            [user_jid, courier, awb, hp, last_status, now]);
    } else {
        await sheets.appendRow(SHEETS.ACTIVE_TRACKS, [user_jid, courier, awb, hp, last_status, now]);
    }
};

const updateActiveTrackStatus = async (user_jid, courier, awb, new_status) => {
    const existing = await sheets.findRow(SHEETS.ACTIVE_TRACKS, row =>
        row.user_jid === user_jid && row.courier === courier && row.awb === awb
    );

    if (existing) {
        const now = new Date().toISOString();
        const statusCol = sheets.HEADERS[SHEETS.ACTIVE_TRACKS].indexOf('last_status');
        const checkedCol = sheets.HEADERS[SHEETS.ACTIVE_TRACKS].indexOf('last_checked');
        await sheets.updateCell(SHEETS.ACTIVE_TRACKS, existing.rowIndex, statusCol, new_status);
        await sheets.updateCell(SHEETS.ACTIVE_TRACKS, existing.rowIndex, checkedCol, now);
        return 1;
    }
    return 0;
};

const removeActiveTrack = async (user_jid, courier, awb) => {
    const existing = await sheets.findRow(SHEETS.ACTIVE_TRACKS, row =>
        row.user_jid === user_jid && row.courier === courier && row.awb === awb
    );

    if (existing) {
        await sheets.deleteRow(SHEETS.ACTIVE_TRACKS, existing.rowIndex);
        return 1;
    }
    return 0;
};

const getAllActiveTracks = async () => {
    return await sheets.getAll(SHEETS.ACTIVE_TRACKS);
};

// ==========================================
// STOCK OPNAME: USERS
// ==========================================

const addUser = async (name) => {
    // Cek unique
    const existing = await sheets.findRow(SHEETS.USERS, row =>
        row.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
        return { success: false, message: 'Nama user sudah terdaftar.' };
    }

    const nextId = await sheets.getNextId(SHEETS.USERS);
    await sheets.appendRow(SHEETS.USERS, [nextId.toString(), name]);
    return { success: true, id: nextId };
};

const getUserByName = async (name) => {
    const result = await sheets.findRow(SHEETS.USERS, row =>
        row.name.toLowerCase() === name.toLowerCase()
    );
    return result ? { id: result.data.id, name: result.data.name } : null;
};

// ==========================================
// STOCK OPNAME: STOCKS
// ==========================================

const addStock = async (userId, itemName, status) => {
    const nextId = await sheets.getNextId(SHEETS.STOCKS);
    const now = new Date().toISOString();
    await sheets.appendRow(SHEETS.STOCKS, [nextId.toString(), userId.toString(), itemName, status, now]);
    return nextId;
};

const getStocksByUser = async (userId) => {
    const rows = await sheets.findRows(SHEETS.STOCKS, row => row.user_id === userId.toString());
    // Sort: status DESC (Ready first), id ASC
    return rows.map(r => ({ id: r.data.id, user_id: r.data.user_id, item_name: r.data.item_name, status: r.data.status, _rowIndex: r.rowIndex }))
        .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'Ready' ? -1 : 1;
            return parseInt(a.id) - parseInt(b.id);
        });
};

const getAllUsersAndStocks = async () => {
    const users = await sheets.getAll(SHEETS.USERS);
    const stocks = await sheets.getAll(SHEETS.STOCKS);

    const result = [];

    // Sort users by name
    users.sort((a, b) => a.name.localeCompare(b.name));

    for (const user of users) {
        const userStocks = stocks.filter(s => s.user_id === user.id.toString())
            .sort((a, b) => {
                if (a.status !== b.status) return a.status === 'Ready' ? -1 : 1;
                return parseInt(a.id) - parseInt(b.id);
            });

        if (userStocks.length === 0) {
            result.push({ user_name: user.name, stock_id: null, item_name: null, status: null });
        } else {
            for (const stock of userStocks) {
                result.push({ user_name: user.name, stock_id: stock.id, item_name: stock.item_name, status: stock.status });
            }
        }
    }

    return result;
};

const updateStockStatus = async (stockId, status) => {
    const existing = await sheets.findRow(SHEETS.STOCKS, row => row.id === stockId.toString());
    if (existing) {
        const statusCol = sheets.HEADERS[SHEETS.STOCKS].indexOf('status');
        await sheets.updateCell(SHEETS.STOCKS, existing.rowIndex, statusCol, status);
        return 1;
    }
    return 0;
};

const renameStock = async (stockId, newName) => {
    const existing = await sheets.findRow(SHEETS.STOCKS, row => row.id === stockId.toString());
    if (existing) {
        const nameCol = sheets.HEADERS[SHEETS.STOCKS].indexOf('item_name');
        await sheets.updateCell(SHEETS.STOCKS, existing.rowIndex, nameCol, newName);
        return 1;
    }
    return 0;
};

const deleteStock = async (stockId) => {
    const existing = await sheets.findRow(SHEETS.STOCKS, row => row.id === stockId.toString());
    if (existing) {
        await sheets.deleteRow(SHEETS.STOCKS, existing.rowIndex);
        return 1;
    }
    return 0;
};

// ==========================================
// STOCK TRACKS — Resi yang di-link ke stok Di Jalan
// ==========================================

/**
 * Menambahkan track resi yang dikaitkan ke item stok tertentu
 * @param {string} stockId      - ID internal stok di sheet Stocks
 * @param {string} userName     - Nama pemilik stok (Ardian, Okiq, dll)
 * @param {string} itemName     - Nama item stok
 * @param {string} courier      - Kode kurir (jnt, jne, dll)
 * @param {string} awb          - Nomor resi
 * @param {string} hp           - HP khusus JNE (opsional)
 * @param {string} addedByJid   - WhatsApp JID penambah track (untuk kirim notif)
 */
const addStockTrack = async (stockId, userName, itemName, courier, awb, hp = '', addedByJid = '') => {
    // Jika stock_id sudah ada, update saja (replace track lama)
    const existing = await sheets.findRow(SHEETS.STOCK_TRACKS, row => row.stock_id === String(stockId));
    const now = new Date().toISOString();

    if (existing) {
        await sheets.updateRow(SHEETS.STOCK_TRACKS, existing.rowIndex,
            [existing.data.id, String(stockId), userName, itemName, courier, awb, hp, '', addedByJid, now]);
        return { replaced: true };
    }

    const nextId = await sheets.getNextId(SHEETS.STOCK_TRACKS);
    await sheets.appendRow(SHEETS.STOCK_TRACKS, [String(nextId), String(stockId), userName, itemName, courier, awb, hp, '', addedByJid, now]);
    return { replaced: false, id: nextId };
};

/**
 * Ambil semua stock tracks (untuk scheduler)
 */
const getAllStockTracks = async () => {
    return await sheets.getAll(SHEETS.STOCK_TRACKS);
};

/**
 * Ambil stock tracks milik user tertentu (untuk !listtrack)
 * @param {string} userName
 */
const getStockTracksByUser = async (userName) => {
    const rows = await sheets.findRows(SHEETS.STOCK_TRACKS, row =>
        row.user_name?.toLowerCase() === userName.toLowerCase()
    );
    return rows.map(r => r.data);
};

/**
 * Update status pada stock track
 * @param {string} trackId   - ID di sheet StockTracks
 * @param {string} newStatus - Status baru dari API
 */
const updateStockTrackStatus = async (trackId, newStatus) => {
    const existing = await sheets.findRow(SHEETS.STOCK_TRACKS, row => row.id === String(trackId));
    if (existing) {
        const statusCol = sheets.HEADERS[SHEETS.STOCK_TRACKS].indexOf('last_status');
        await sheets.updateCell(SHEETS.STOCK_TRACKS, existing.rowIndex, statusCol, newStatus);
        return 1;
    }
    return 0;
};

/**
 * Hapus stock track berdasarkan ID track
 * @param {string} trackId
 */
const removeStockTrack = async (trackId) => {
    const existing = await sheets.findRow(SHEETS.STOCK_TRACKS, row => row.id === String(trackId));
    if (existing) {
        await sheets.deleteRow(SHEETS.STOCK_TRACKS, existing.rowIndex);
        return 1;
    }
    return 0;
};

/**
 * Hapus stock track berdasarkan stock_id (saat item stok dihapus)
 * @param {string} stockId
 */
const removeStockTrackByStockId = async (stockId) => {
    const existing = await sheets.findRow(SHEETS.STOCK_TRACKS, row => row.stock_id === String(stockId));
    if (existing) {
        await sheets.deleteRow(SHEETS.STOCK_TRACKS, existing.rowIndex);
        return 1;
    }
    return 0;
};

module.exports = {
    addHistory,
    getHistory,
    deleteHistory,
    addActiveTrack,
    updateActiveTrackStatus,
    removeActiveTrack,
    getAllActiveTracks,

    // Exports Stock Opname
    addUser,
    getUserByName,
    addStock,
    getStocksByUser,
    getAllUsersAndStocks,
    updateStockStatus,
    renameStock,
    deleteStock,

    // Exports Stock Tracks
    addStockTrack,
    getAllStockTracks,
    getStockTracksByUser,
    updateStockTrackStatus,
    removeStockTrack,
    removeStockTrackByStockId
};
