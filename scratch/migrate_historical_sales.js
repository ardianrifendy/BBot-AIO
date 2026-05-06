/**
 * Script to migrate historical sales data from an external Google Spreadsheet
 * to the BagaskaraBot Transactions sheet.
 */
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SOURCE_SPREADSHEET_ID = '1FL_owQ1kRS6llvg7MwdcznzGOUZOofhfzd8a-w7cklw';
const TARGET_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const CREDENTIALS_PATH = path.resolve(__dirname, '../credentials.json');

const MONTH_SHEETS = ['JANUARI 2026', 'FEBRUARI 2026', 'MARET 2026'];

async function run() {
    console.log('🚀 Starting migration...');

    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // 1. Get current Max ID from target Transactions
    let currentId = 0;
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: TARGET_SPREADSHEET_ID,
            range: 'Transactions!A:A'
        });
        const rows = res.data.values || [];
        if (rows.length > 1) {
            const ids = rows.slice(1).map(r => parseInt(r[0])).filter(id => !isNaN(id));
            currentId = Math.max(0, ...ids);
        }
    } catch (e) {
        console.error('Error getting current max ID:', e.message);
    }

    const allDataToAppend = [];

    for (const sheetName of MONTH_SHEETS) {
        console.log(`\nReading sheet: ${sheetName}...`);
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: SOURCE_SPREADSHEET_ID,
                range: `${sheetName}!A2:I` // Skip header
            });

            const rows = res.data.values || [];
            console.log(`Found ${rows.length} rows.`);

            for (const row of rows) {
                // Column Map: B:1 (Date), C:2 (Sumber), D:3 (HP), E:4 (Empty), F:5 (Varian), H:7 (Jual)
                const rawDate = row[1];
                const sumber = row[2] || '';
                const item = row[3] || '';
                const varian = row[5] || '';
                const jualStr = row[7] || '0';

                if (!item || !rawDate) continue;

                // Parse Date (DD/MM/YYYY)
                let isoDate = new Date().toISOString();
                const dateParts = rawDate.split('/');
                if (dateParts.length === 3) {
                    const day = dateParts[0].padStart(2, '0');
                    const month = dateParts[1].padStart(2, '0');
                    const year = dateParts[2];
                    isoDate = `${year}-${month}-${day}T00:00:00.000Z`;
                }

                // Parse Harga
                const harga_jual = parseInt(jualStr.replace(/[^0-9]/g, '')) || 0;

                currentId++;
                // Header Target: id, date, user_id, item_name, harga_jual, pembeli, catatan
                allDataToAppend.push([
                    currentId,
                    isoDate,
                    '1', // Default user_id
                    `${item} ${varian}`.trim(),
                    harga_jual,
                    '-', // No buyer info
                    sumber.trim()
                ]);
            }
        } catch (e) {
            console.error(`Error reading ${sheetName}:`, e.message);
        }
    }

    if (allDataToAppend.length > 0) {
        console.log(`\nAppending ${allDataToAppend.length} rows to Transactions...`);
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: TARGET_SPREADSHEET_ID,
                range: 'Transactions!A:G',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: allDataToAppend }
            });
            console.log('✅ Migration completed successfully.');
        } catch (e) {
            console.error('Error appending data:', e.message);
        }
    } else {
        console.log('No data to migrate.');
    }
}

run();
