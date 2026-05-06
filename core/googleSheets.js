/**
 * ============================================================
 * GOOGLE SHEETS — Core Data Layer
 * ============================================================
 * Basis dari semua operasi data. Versi ini adalah upgrade dari
 * WaResiBot/src/googleSheets.js dengan tambahan:
 * - Import SHEETS & HEADERS dari sheetConstants.js
 * - Support sheet baru: Catalog, MarketplacePrices
 * - Error logging terpusat
 * ============================================================
 */

const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');
const { SHEETS, HEADERS } = require('./sheetConstants');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SPREADSHEET_ID   = process.env.GOOGLE_SHEETS_ID;
const CREDENTIALS_PATH = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, '../credentials.json'));

let sheetsApi     = null;
let isInitialized = false;

// ── Inisialisasi ───────────────────────────────────────────────────────────────

const initialize = async () => {
    if (isInitialized) return;

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        sheetsApi = google.sheets({ version: 'v4', auth: authClient });

        await ensureSheetTabs();
        isInitialized = true;
        console.log('[SHEETS] Google Sheets berhasil terkoneksi.');
    } catch (error) {
        console.error('[SHEETS] Gagal menginisialisasi Google Sheets:', error.message);
        throw error;
    }
};

// ── Pastikan Semua Tab Sheet Exist ─────────────────────────────────────────────

const ensureSheetTabs = async () => {
    const spreadsheet = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

    for (const sheetName of Object.values(SHEETS)) {
        if (!existingSheets.includes(sheetName)) {
            // Tambah tab baru
            await sheetsApi.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }]
                }
            });

            // Tambah header row
            await sheetsApi.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'RAW',
                requestBody: { values: [HEADERS[sheetName]] }
            });

            console.log(`[SHEETS] Tab '${sheetName}' berhasil dibuat.`);
        }
    }
};

// ── CRUD Operations ────────────────────────────────────────────────────────────

/** Ambil semua data dari sheet (skip header row) */
const getAll = async (sheetName) => {
    await initialize();
    const res = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return [];

    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
    });
};

/** Tambah satu baris data */
const appendRow = async (sheetName, values) => {
    await initialize();
    await sheetsApi.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] }
    });
};

/** Update satu cell (1-indexed row, 0-indexed col) */
const updateCell = async (sheetName, rowIndex, colIndex, value) => {
    await initialize();
    const colLetter = String.fromCharCode(65 + colIndex);
    const range = `${sheetName}!${colLetter}${rowIndex}`;
    await sheetsApi.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] }
    });
};

/** Update seluruh baris */
const updateRow = async (sheetName, rowIndex, values) => {
    await initialize();
    await sheetsApi.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] }
    });
};

/** Hapus satu baris berdasarkan row index (1-indexed) */
const deleteRow = async (sheetName, rowIndex) => {
    await initialize();
    const spreadsheet = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return;

    await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheet.properties.sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        }
    });
};

/** Cari banyak baris yang cocok: return array of { data, rowIndex } */
const findRows = async (sheetName, matchFn) => {
    const allData = await getAll(sheetName);
    const results = [];
    allData.forEach((row, idx) => {
        if (matchFn(row)) results.push({ data: row, rowIndex: idx + 2 });
    });
    return results;
};

/** Cari satu baris pertama yang cocok */
const findRow = async (sheetName, matchFn) => {
    const results = await findRows(sheetName, matchFn);
    return results.length > 0 ? results[0] : null;
};

/** Generate auto-increment ID berdasarkan data existing */
const getNextId = async (sheetName) => {
    const allData = await getAll(sheetName);
    if (allData.length === 0) return 1;
    const maxId = Math.max(...allData.map(r => parseInt(r.id) || 0));
    return maxId + 1;
};

module.exports = {
    initialize,
    SHEETS,
    HEADERS,
    getAll,
    appendRow,
    updateCell,
    updateRow,
    deleteRow,
    findRows,
    findRow,
    getNextId
};
