/**
 * ============================================================
 * COMMAND: !cekresi — Advanced WhatsApp Logistic Assistant
 * ============================================================
 * Mendukung:
 *  - Single check  : !cekresi [kurir] [AWB] (opsional: [HP khusus JNE])
 *  - Bulk check    : !cekresi diikuti baris-baris resi (khusus admin)
 *
 * Fitur utama:
 *  ✅ Anti-typo kurir mapper (J&T → jnt, sicepat, dll)
 *  ✅ Validasi khusus JNE (wajib 5 digit terakhir nomor HP)
 *  ✅ Simple caching 30 menit (hemat kuota API)
 *  ✅ Rate limiting 2000ms antar request bulk
 *  ✅ Output minimalis anti-spam grup
 *  ✅ Bulk check khusus admin dengan emoji status
 *  ✅ Masking nama penerima (Bu***)
 *  ✅ Footer branding: Bagaskara Cell
 * ============================================================
 */

const db            = require('../db');
const binderbyte    = require('../binderbyte');
const cache         = require('../cache');
const { reply }     = require('../utils/helpers');
const { normalizeKurir, getKurirExamples } = require('../kurirMapper');
const dotenv        = require('dotenv');

dotenv.config();

// ─── Konfigurasi Admin ──────────────────────────────────────────────────────
/**
 * Daftar nomor admin yang berhak menggunakan fitur Bulk Check.
 * Format: '628xxxxxxxxxx@c.us' (kode negara tanpa tanda +)
 *
 * ⚠️  WAJIB DIISI sebelum deploy!
 *     Contoh: '6281234567890@c.us'
 */
const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(n => n.trim())
    .filter(n => n.length > 0);

// ─── Konstanta ──────────────────────────────────────────────────────────────
const FOOTER        = '\n\n_— *Bagaskara Cell* 📦_';
const DELAY_BULK_MS = 2000;   // Jeda antar request bulk (anti-ban & anti-limit API)

// ─── Utilitas ────────────────────────────────────────────────────────────────

/**
 * Delay helper — menunda eksekusi selama n milidetik
 * @param {number} ms
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Memeriksa apakah pengirim adalah admin yang terdaftar
 * Menggabungkan: nomor di ADMIN_NUMBERS + msg.fromMe + admin grup
 *
 * @param {Object} msg   - Objek pesan whatsapp-web.js
 * @param {Object} chat  - Objek chat (diperlukan untuk cek admin grup)
 * @returns {boolean}
 */
const isAdmin = async (msg, chat) => {
    const sender = msg.author || msg.from;

    // Dari bot sendiri
    if (msg.fromMe) return true;

    // Nomor terdaftar di env
    if (ADMIN_NUMBERS.includes(sender)) return true;

    // Admin/superadmin grup
    if (chat.isGroup) {
        const participant = chat.participants?.find(p => p.id._serialized === sender);
        if (participant && (participant.isAdmin || participant.isSuperAdmin)) return true;
    }

    return false;
};

/**
 * Sensor (masking) nama penerima agar menjaga privasi
 * Contoh: "Budi Santoso" → "Bu**** S******"
 *         "Bu" → "Bu"
 *
 * @param {string} name - Nama asli
 * @returns {string} Nama yang sudah disamarkan
 */
const maskName = (name) => {
    if (!name || name.trim() === '-' || name.trim() === '') return '-';

    return name.trim().split(' ').map(word => {
        if (word.length <= 2) return word;                   // Kata pendek biarkan
        const visible = word.slice(0, 2);                    // Tampilkan 2 karakter pertama
        const hidden  = '*'.repeat(word.length - 2);         // Sisanya disamar
        return visible + hidden;
    }).join(' ');
};

/**
 * Menentukan emoji status berdasarkan status pengiriman API
 * Digunakan pada output bulk check (satu baris per resi)
 *
 * @param {string} status - Status dari API (delivered, process, returned, dll)
 * @returns {string} Emoji representatif
 */
const getStatusEmoji = (status) => {
    if (!status) return '⚠️';
    const s = status.toLowerCase();
    if (s === 'delivered')                   return '✅';
    if (s === 'returned' || s === 'problem') return '⚠️';
    return '🚚';
};

/**
 * Format balasan SINGLE CHECK — ringkas, max ~7 baris, anti-spam grup
 * Hanya menampilkan status perjalanan TERAKHIR (history[0])
 *
 * @param {Object} data       - Data dari Binderbyte API
 * @param {string} awb        - Nomor resi
 * @param {boolean} fromCache - Apakah data berasal dari cache?
 * @returns {string} Teks pesan yang siap dikirim
 */
const formatSingleResult = (data, awb, fromCache = false) => {
    const summary = data.summary || {};
    const detail  = data.detail  || {};

    // Ambil hanya 1 riwayat terakhir (anti-spam)
    const lastHistory = data.history?.[0] || null;

    const status   = summary.status || 'Tidak diketahui';
    const kurir    = summary.courier?.toUpperCase() || '-';
    const resiNum  = summary.awb || awb;
    const tujuan   = detail.destination || '-';
    const penerima = maskName(detail.receiver || '-');

    const statusEmoji = getStatusEmoji(status);
    const cacheTag    = fromCache ? ' _(dari cache)_' : '';

    // Riwayat terakhir
    let historyLine = '';
    if (lastHistory) {
        const desc  = lastHistory.desc  || '-';
        const date  = lastHistory.date  || '-';
        const lokasi = lastHistory.location || '';
        historyLine = `📍 *${desc}*` + (lokasi ? ` — _${lokasi}_` : '') + `\n🕐 ${date}`;
    } else {
        historyLine = '📍 _Belum ada riwayat perjalanan._';
    }

    return (
        `${statusEmoji} *${kurir}* — Resi: \`${resiNum}\`` +
        `\n👤 Penerima: ${penerima} — ${tujuan}` +
        `\n${historyLine}` +
        `${cacheTag}` +
        FOOTER
    ).trim();
};

/**
 * Format balasan BULK CHECK — satu baris per resi, khusus admin
 *
 * @param {Array<{awb:string, courier:string, status:string|null, error:string|null}>} results
 * @returns {string} Teks pesan ringkas berbentuk daftar
 */
const formatBulkResult = (results) => {
    const lines = results.map((r, i) => {
        const no     = String(i + 1).padStart(2, '0');
        const emoji  = r.error ? '❌' : getStatusEmoji(r.status);
        const label  = r.error
            ? `_${r.error}_`
            : r.statusLabel || r.status || '-';
        return `${emoji} *${no}.* ${r.courier?.toUpperCase()} \`${r.awb}\` — ${label}`;
    });

    return (
        `📋 *HASIL BULK CHECK RESI* (${results.length} resi)\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        lines.join('\n') +
        FOOTER
    );
};

// ─── Execute ─────────────────────────────────────────────────────────────────

/**
 * Fungsi utama command !cekresi
 * Dipanggil oleh index.js setiap kali ada pesan yang cocok
 *
 * @param {Object} msg    - Objek pesan
 * @param {Array}  args   - Argumen yang diparsing dari baris pertama
 * @param {Object} client - Client whatsapp-web.js
 * @param {string} text   - Teks pesan lengkap
 * @param {Array}  lines  - Teks yang sudah dipecah per baris
 */
const execute = async (msg, args, client, text, lines) => {
    const chat    = await msg.getChat();
    const sender  = msg.author || msg.from;
    const adminOk = await isAdmin(msg, chat);

    // ── Deteksi mode: Single vs Bulk ─────────────────────────────────────────
    const isMultiLine = lines.length > 1;

    // ── BULK MODE (Admin Only) ────────────────────────────────────────────────
    if (isMultiLine) {
        // Blokir non-admin
        if (!adminOk) {
            return reply(msg,
                `🔒 *Akses Ditolak*\n` +
                `Fitur bulk check hanya tersedia untuk admin.\n` +
                `Gunakan format single: \`!cekresi [kurir] [AWB]\`` +
                FOOTER
            );
        }

        // Parsing baris mulai dari index 1 (baris 0 adalah !cekresi)
        const trackRequests = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/);
            if (parts.length < 2) continue;  // Skip baris tidak valid

            const rawKurir = parts[0];
            const awb      = parts[1];
            const hp       = parts[2] || '';

            // Normalisasi kurir
            const { code, isValid } = normalizeKurir(rawKurir);

            if (!isValid) {
                trackRequests.push({
                    awb,
                    courier: rawKurir,
                    hp,
                    error: `Kurir "${rawKurir}" tidak dikenali`
                });
                continue;
            }

            // Validasi khusus JNE: wajib HP 5 digit
            if (code === 'jne' && (!hp || hp.trim().length < 5)) {
                trackRequests.push({
                    awb,
                    courier: 'jne',
                    hp,
                    error: 'JNE butuh 5 digit HP terakhir'
                });
                continue;
            }

            trackRequests.push({ awb, courier: code, hp, error: null });
        }

        if (trackRequests.length === 0) {
            return reply(msg,
                `❌ Tidak ada baris resi yang valid.\n` +
                `Format: satu resi per baris, contoh:\n` +
                `\`\`\`!cekresi\njnt 987654321\njne JX12345 89123\`\`\`` +
                FOOTER
            );
        }

        // Kirim pesan "sedang proses"
        await reply(msg, `⏳ Memproses *${trackRequests.length} resi*...\nMohon tunggu sebentar.`);

        const bulkResults = [];

        for (const req of trackRequests) {
            // Jika sudah ada error dari parsing, skip API call
            if (req.error) {
                bulkResults.push({ ...req, status: null, statusLabel: null });
                await delay(500); // jeda pendek tetap ada
                continue;
            }

            // Cek cache dulu sebelum hit API
            const cached = cache.get(req.courier, req.awb, req.hp);
            if (cached) {
                const status = cached.data?.summary?.status || 'Tidak diketahui';
                bulkResults.push({
                    awb:         req.awb,
                    courier:     req.courier,
                    hp:          req.hp,
                    status,
                    statusLabel: status + ' _(cache)_',
                    error:       null
                });
                await delay(300); // jeda minimal untuk entry cache
                continue;
            }

            // Hit API Binderbyte
            try {
                const data   = await binderbyte.trackReceipt(req.awb, req.courier, req.hp);
                const status = data?.summary?.status || 'Tidak diketahui';

                // Simpan ke cache
                cache.set(req.courier, req.awb, req.hp, data);

                // Simpan ke history DB
                try {
                    await db.addHistory(sender, data.summary.courier, data.summary.awb, req.hp);
                    if (status.toLowerCase() !== 'delivered') {
                        await db.addActiveTrack(sender, data.summary.courier, data.summary.awb, req.hp, status);
                    } else {
                        await db.removeActiveTrack(sender, data.summary.courier, data.summary.awb);
                    }
                } catch (dbErr) {
                    // Error DB tidak menghentikan proses tracking
                    console.warn('[DB] Gagal update history bulk:', dbErr.message);
                }

                bulkResults.push({
                    awb:     req.awb,
                    courier: req.courier,
                    hp:      req.hp,
                    status,
                    error:   null
                });
            } catch (err) {
                bulkResults.push({
                    awb:     req.awb,
                    courier: req.courier,
                    hp:      req.hp,
                    status:  null,
                    error:   err.message || 'Gagal melacak'
                });
            }

            // ⏱️ Rate limiting: jeda 2 detik antar request untuk hindari ban API/WA
            await delay(DELAY_BULK_MS);
        }

        // Kirim hasil bulk dalam SATU pesan ringkas
        return reply(msg, formatBulkResult(bulkResults));
    }

    // ── SINGLE MODE ───────────────────────────────────────────────────────────

    // Validasi argumen minimal: !cekresi [kurir] [AWB]
    if (args.length < 3) {
        return reply(msg,
            `❌ *Format Tidak Lengkap*\n\n` +
            `*Penggunaan:*\n` +
            `\`!cekresi [kurir] [AWB]\`\n\n` +
            `*Contoh:*\n` +
            `• \`!cekresi jnt 987654321\`\n` +
            `• \`!cekresi sicepat 1234567890\`\n` +
            `• \`!cekresi jne JX12345 89123\` _(JNE wajib +5 digit HP)_\n\n` +
            `*Kurir tersedia:* ${getKurirExamples()}` +
            FOOTER
        );
    }

    const rawKurir = args[1];
    const awb      = args[2];
    const hp       = args[3] || '';

    // ── Normalisasi kurir (Anti-Typo) ─────────────────────────────────────────
    const { code: kurirCode, isValid: kurirValid } = normalizeKurir(rawKurir);

    if (!kurirValid) {
        return reply(msg,
            `❌ *Kurir Tidak Dikenali:* \`${rawKurir}\`\n\n` +
            `Coba gunakan salah satu dari:\n` +
            `_${getKurirExamples()}_\n\n` +
            `Contoh: \`!cekresi jnt 987654321\`` +
            FOOTER
        );
    }

    // ── Validasi Khusus JNE ───────────────────────────────────────────────────
    /**
     * JNE memerlukan parameter tambahan: 5 digit terakhir nomor HP penerima.
     * Jika tidak ada, bot wajib memberikan pesan edukatif kepada pengguna.
     */
    if (kurirCode === 'jne' && (!hp || hp.trim().length < 5)) {
        return reply(msg,
            `📋 *Info Penting untuk JNE*\n\n` +
            `Pelacakan resi *JNE* memerlukan *5 digit terakhir* nomor HP penerima.\n\n` +
            `*Format yang benar:*\n` +
            `\`!cekresi jne [AWB] [5-digit-HP]\`\n\n` +
            `*Contoh:*\n` +
            `\`!cekresi jne JX12345678 89123\`\n\n` +
            `💡 _Angka HP adalah 5 digit terakhir nomor penerima._\n` +
            `_Contoh HP 0812-3456-*89123* → masukkan \`89123\`_` +
            FOOTER
        );
    }

    // ── Cek Cache ─────────────────────────────────────────────────────────────
    const cachedEntry = cache.get(kurirCode, awb, hp);
    if (cachedEntry) {
        const { data, cachedAt } = cachedEntry;
        const formattedText = formatSingleResult(data, awb, true);

        return reply(msg,
            formattedText +
            `\n\n💾 _Data dari cache (diperbarui: ${cachedAt})_`
        );
    }

    // ── Hit API Binderbyte ────────────────────────────────────────────────────
    try {
        const data = await binderbyte.trackReceipt(awb, kurirCode, hp);

        // Simpan ke cache untuk 30 menit
        cache.set(kurirCode, awb, hp, data);

        // Format balasan minimalis
        const formattedText = formatSingleResult(data, awb, false);

        // Simpan ke history & active tracks DB
        try {
            await db.addHistory(sender, data.summary.courier, data.summary.awb, hp);
            const status = data.summary.status?.toLowerCase() || '';

            if (status !== 'delivered') {
                await db.addActiveTrack(sender, data.summary.courier, data.summary.awb, hp, status);
            } else {
                await db.removeActiveTrack(sender, data.summary.courier, data.summary.awb);
            }
        } catch (dbErr) {
            // Error DB tidak menghentikan response ke user
            console.warn('[DB] Gagal menyimpan history:', dbErr.message);
        }

        return reply(msg, formattedText);

    } catch (error) {
        // ── Error Handling Profesional ────────────────────────────────────────
        console.error(`[CEKRESI] Error tracking ${kurirCode} ${awb}:`, error.message);

        // Tentukan URL cek manual berdasarkan kurir
        const manualUrls = {
            jne:       'https://www.jne.co.id/id/tracking/trace',
            jnt:       'https://www.jet.co.id/track',
            sicepat:   'https://sicepat.com/checkAwb',
            spx:       'https://shopee.co.id/track',
            anteraja:  'https://anteraja.id/tracking',
            wahana:    'https://wahana.com/tracking',
            pos:       'https://www.posindonesia.co.id/id/tracking',
            idexpress: 'https://idexpress.com/tracking',
            ninja:     'https://www.ninjaxpress.co/id-id/tracking',
            lion:      'https://lionparcel.com/tracking',
            tiki:      'https://tiki.id/id/tracking',
        };
        const manualUrl = manualUrls[kurirCode]
            ? `\n🌐 Cek manual: ${manualUrls[kurirCode]}`
            : '';

        return reply(msg,
            `⚠️ *Pelacakan Gagal*\n\n` +
            `*Kurir:* ${kurirCode.toUpperCase()}\n` +
            `*Resi:* \`${awb}\`\n\n` +
            `*Keterangan:* _${error.message || 'Terjadi kesalahan tidak terduga.'}_\n` +
            `${manualUrl}\n\n` +
            `💡 _Coba beberapa saat lagi atau hubungi ekspedisi terkait._ ` +
            FOOTER
        );
    }
};

module.exports = { execute };
