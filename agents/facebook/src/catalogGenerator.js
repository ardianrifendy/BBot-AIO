/**
 * ============================================================
 * CATALOG GENERATOR — Auto Image Catalog Creator
 * ============================================================
 * ESM version — compatible dengan facebook agent (type: module)
 * Menggunakan jimp untuk generate gambar katalog.
 * ============================================================
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import Jimp from 'jimp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const sheets = require('../../../core/googleSheets');
const { SHEETS } = require('../../../core/sheetConstants');

const IMAGES_DIR = path.resolve(__dirname, '../images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatRupiah = (amount) => 'Rp ' + (parseInt(amount) || 0).toLocaleString('id-ID');
const formatTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Ambil Data ─────────────────────────────────────────────────────────────────
async function getCatalogWithStock() {
    const [stocks, catalogs] = await Promise.all([
        sheets.getAll(SHEETS.STOCKS),
        sheets.getAll(SHEETS.CATALOG),
    ]);

    const readyCounts = {};
    for (const stock of stocks) {
        if (stock.status === 'Ready') {
            readyCounts[stock.item_name] = (readyCounts[stock.item_name] || 0) + 1;
        }
    }

    return catalogs
        .filter(cat => (readyCounts[cat.item_name] || 0) > 0)
        .map(cat => ({
            item_name:    cat.item_name,
            harga_jual:   parseInt(cat.harga_jual) || 0,
            kondisi:      cat.kondisi || 'Baru',
            deskripsi:    cat.deskripsi || '',
            jumlah_ready: readyCounts[cat.item_name] || 0,
        }))
        .sort((a, b) => b.harga_jual - a.harga_jual);
}

// ── Generate Gambar ────────────────────────────────────────────────────────────
async function generateCatalogImage(products) {
    const WIDTH  = 800;
    const HEIGHT = 1200;

    // Buat image dengan background biru gelap
    const image = await Jimp.create(WIDTH, HEIGHT, 0x1a1a2eff);

    // Load fonts bawaan Jimp
    const fontLarge  = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontSmall  = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);

    let yPos = 40;

    // ── Header Brand ───────────────────────────────────────────────────────
    image.print(fontLarge, 0, yPos, {
        text: 'BAGASKARA CELL',
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, WIDTH, 50);
    yPos += 60;

    // Garis biru muda
    const bar1 = await Jimp.create(700, 2, 0x4fc3f7ff);
    image.composite(bar1, 50, yPos);
    yPos += 15;

    // Subtitle
    image.print(fontMedium, 0, yPos, {
        text: `\u2705 ${products.length} Produk Ready Stok`,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, WIDTH, 30);
    yPos += 50;

    // ── Daftar Produk ──────────────────────────────────────────────────────
    const maxProducts = Math.min(products.length, 6);
    for (let i = 0; i < maxProducts; i++) {
        if (yPos > HEIGHT - 150) break;
        const prod = products[i];

        // Nama produk
        image.print(fontMedium, 60, yPos, `${i + 1}. ${prod.item_name}`, WIDTH - 120);
        yPos += 30;

        // Harga + kondisi + stok
        image.print(fontSmall, 75, yPos,
            `${formatRupiah(prod.harga_jual)}  |  ${prod.kondisi}  |  ${prod.jumlah_ready} unit ready`,
            WIDTH - 150
        );
        yPos += 42;
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    const bar2 = await Jimp.create(700, 2, 0x4fc3f7ff);
    image.composite(bar2, 50, HEIGHT - 100);

    image.print(fontMedium, 0, HEIGHT - 80, {
        text: 'DM untuk Order & Info lebih lanjut \uD83D\uDCF1',
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, WIDTH, 30);

    const dateStr = new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric'
    });
    image.print(fontSmall, 0, HEIGHT - 40, {
        text: dateStr,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, WIDTH, 20);

    // ── Simpan ─────────────────────────────────────────────────────────────
    const outputPath = path.join(IMAGES_DIR, `catalog_${formatTimestamp()}.jpg`);
    await image.quality(85).writeAsync(outputPath);
    console.log(`[CATALOG-GEN] Gambar katalog disimpan: ${path.basename(outputPath)}`);
    return outputPath;
}

// ── Main Export ────────────────────────────────────────────────────────────────
export async function runCatalogGenerator() {
    console.log('[CATALOG-GEN] Mengambil data dari Google Sheets...');

    let products;
    try {
        products = await getCatalogWithStock();
    } catch (err) {
        console.error(`[CATALOG-GEN] Gagal ambil data: ${err.message}`);
        return null;
    }

    if (products.length === 0) {
        console.warn('[CATALOG-GEN] Tidak ada produk Ready di Catalog. Skip.');
        return null;
    }

    console.log(`[CATALOG-GEN] ${products.length} produk akan digenerate.`);

    try {
        return await generateCatalogImage(products);
    } catch (err) {
        console.error(`[CATALOG-GEN] Gagal generate gambar: ${err.message}`);
        return null;
    }
}
