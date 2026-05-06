/**
 * ============================================================
 * FB AUTO POSTER — Programmatic Mode (Non-Interactive)
 * ============================================================
 * Versi refactored dari FB-Auto-Poster/index.js.
 * Dihilangkan: inquirer prompts (tidak ada input manual).
 * Ditambahkan: export function runAutoPosting() yang dipanggil
 * dari main.js secara otomatis.
 *
 * Konfigurasi: posting_config.json di root folder
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { postToGroup } from './src/poster.js';
import { parseSpintax } from './src/spintax.js';
import { runCatalogGenerator } from './src/catalogGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG_FILE    = path.resolve(__dirname, '../../posting_config.json');
const CAMPAIGNS_FILE = path.resolve(__dirname, 'campaigns.json');
const TEMPLATE_FILE  = path.resolve(__dirname, 'spintax_template.txt');
const SUCCESS_LOG    = path.resolve(__dirname, '../../reports/logs/fb_success.txt');
const FAILED_LOG     = path.resolve(__dirname, '../../reports/logs/fb_failed.txt');

// ── Load Config ────────────────────────────────────────────────────────────────

function loadPostingConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        // Buat default config jika belum ada
        const defaultConfig = {
            active: true,
            campaign_name: '',
            interval_hours: 6,
            use_catalog_image: true,
            custom_text_override: ''
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        console.log('[FB-POSTER] posting_config.json dibuat dengan nilai default.');
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function loadCampaigns() {
    if (fs.existsSync(CAMPAIGNS_FILE)) {
        return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
    }
    return {};
}

function loadTemplate() {
    if (fs.existsSync(TEMPLATE_FILE)) {
        return fs.readFileSync(TEMPLATE_FILE, 'utf8');
    }
    return 'Ready stok HP! DM untuk info & harga 🔥';
}

function logResult(file, message) {
    const logDir = path.dirname(file);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(file, `[${new Date().toLocaleString('id-ID')}] ${message}\n`);
}

// ── Main Export: runAutoPosting ────────────────────────────────────────────────

/**
 * Jalankan auto-posting ke semua grup dalam kampanye yang dikonfigurasi.
 * Dipanggil dari main.js. Tidak ada input manual sama sekali.
 *
 * @param {import('playwright').BrowserContext} browserContext - Browser session yang sudah login
 * @returns {Promise<{success: number, fail: number, skipped: boolean}>}
 */
export async function runAutoPosting(browserContext) {
    const config = loadPostingConfig();

    // ── Cek apakah posting aktif ──────────────────────────────────────────
    if (!config.active) {
        console.log('[FB-POSTER] Posting dinonaktifkan di posting_config.json (active: false). Skip.');
        return { success: 0, fail: 0, skipped: true };
    }

    // ── Load Kampanye Target ──────────────────────────────────────────────
    const campaigns = loadCampaigns();
    const campaignName = config.campaign_name;

    if (!campaignName || !campaigns[campaignName]) {
        console.warn(`[FB-POSTER] Campaign "${campaignName}" tidak ditemukan di campaigns.json. Skip.`);
        console.warn('[FB-POSTER] Isi "campaign_name" di posting_config.json dengan nama campaign yang ada.');
        return { success: 0, fail: 0, skipped: true };
    }

    const targetGroups = campaigns[campaignName];
    console.log(`[FB-POSTER] Campaign: "${campaignName}" | ${targetGroups.length} grup target.`);

    // ── Siapkan Teks Postingan ────────────────────────────────────────────
    let postText;
    if (config.custom_text_override && config.custom_text_override.trim()) {
        postText = config.custom_text_override;
        console.log('[FB-POSTER] Menggunakan custom_text_override dari config.');
    } else {
        postText = parseSpintax(loadTemplate());
        console.log('[FB-POSTER] Menggunakan spintax_template.txt.');
    }

    // ── Generate Gambar Katalog (jika diaktifkan) ─────────────────────────
    let catalogImagePath = null;
    if (config.use_catalog_image) {
        console.log('[FB-POSTER] Membuat gambar katalog otomatis...');
        try {
            catalogImagePath = await runCatalogGenerator();
            if (catalogImagePath) {
                console.log(`[FB-POSTER] Gambar katalog siap: ${path.basename(catalogImagePath)}`);
            } else {
                console.log('[FB-POSTER] Tidak ada gambar katalog (stok kosong atau catalog belum diisi). Posting tanpa gambar.');
            }
        } catch (err) {
            console.error(`[FB-POSTER] Gagal generate katalog: ${err.message}. Lanjut posting tanpa gambar.`);
        }
    }

    const selectedImages = catalogImagePath ? [path.basename(catalogImagePath)] : [];

    // ── Mulai Posting ke Semua Grup ───────────────────────────────────────
    console.log(`\n[FB-POSTER] 🔥 Mulai auto-posting ke ${targetGroups.length} grup...`);

    let successCount = 0;
    let failCount    = 0;

    for (let i = 0; i < targetGroups.length; i++) {
        const group = targetGroups[i];
        console.log(`\n[FB-POSTER] Progress: [${i + 1}/${targetGroups.length}] → ${group.name}`);

        // Apply spintax ulang setiap posting (variasi teks berbeda tiap grup)
        const finalText = config.custom_text_override?.trim() || parseSpintax(loadTemplate());

        try {
            const result = await postToGroup(browserContext, group, '', '', finalText, selectedImages);

            if (result.success) {
                successCount++;
                const icon = result.verified ? '✅' : '⚠️';
                const modeLabel = result.mode === 'marketplace' ? '[Marketplace]' : '[Normal]';
                console.log(`${icon} Berhasil ${modeLabel} → ${group.name}`);
                logResult(SUCCESS_LOG, `${icon} ${modeLabel} ${group.name} | URL: ${result.postUrl || '-'}`);
            } else {
                failCount++;
                console.log(`❌ Gagal → ${group.name}: ${result.error}`);
                logResult(FAILED_LOG, `❌ ${group.name} | Error: ${result.error}`);
            }
        } catch (err) {
            failCount++;
            console.error(`❌ Error di grup ${group.name}: ${err.message}`);
            logResult(FAILED_LOG, `❌ ${group.name} | Exception: ${err.message}`);
        }

        // Delay antar grup (anti-ban) — 15-30 detik
        if (i < targetGroups.length - 1) {
            const delayMs = Math.floor(Math.random() * 15000 + 15000);
            console.log(`[FB-POSTER] Menunggu ${(delayMs / 1000).toFixed(0)} detik...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    // ── Ringkasan Sesi ────────────────────────────────────────────────────
    const summary = `\n========== SESI ${new Date().toLocaleString('id-ID')} ==========\nCampaign: ${campaignName} | Total: ${targetGroups.length} | Sukses: ${successCount} | Gagal: ${failCount}\n`;
    logResult(SUCCESS_LOG, summary);

    console.log(`\n[FB-POSTER] ✅ Selesai! Sukses: ${successCount} | Gagal: ${failCount}`);
    return { success: successCount, fail: failCount, skipped: false };
}
