const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

// Mengambil dan memisahkan banyak API keys menjadi array
const keysString = process.env.BINDERBYTE_API_KEYS || process.env.BINDERBYTE_API_KEY || '';
const API_KEYS = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
const BASE_URL = 'https://api.binderbyte.com/v1';

let currentKeyIndex = 0;

/**
 * Mendapatkan API Key saat ini
 */
const getCurrentKey = () => API_KEYS[currentKeyIndex];

/**
 * Pindah ke API key berikutnya (Fallback)
 */
const switchKey = () => {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[API] Berpindah ke API Key index: ${currentKeyIndex}`);
};

/**
 * Memeriksa resi ke API BinderByte dengan fitur fallback
 * @param {string} awb - Nomor Resi
 * @param {string} courier - Kode kurir (jne, jnt, sicepat, dll)
 * @param {string} hp - Nomor HP khusus untuk resi tertentu seperti JNE (opsional)
 * @returns {Promise<Object>} Data hasil tracking atau throw error jika gagal
 */
const trackReceipt = async (awb, courier, hp = '', retryCount = 0) => {
    if (API_KEYS.length === 0 || API_KEYS[0] === 'your_api_key_1') {
        throw new Error("API Key BinderByte belum dikonfigurasi secara benar di file .env. Silakan isi terlebih dahulu.");
    }

    try {
        const queryParams = {
            api_key: getCurrentKey(),
            courier: courier.toLowerCase(),
            awb: awb
        };

        if (hp && hp.trim() !== '') {
            queryParams.number = hp.trim();
        }

        const response = await axios.get(`${BASE_URL}/track`, {
            params: queryParams
        });

        if (response.data && response.data.status === 200) {
            return response.data.data;
        } else {
            // Error dari API tapi HTTP 200 (misal: Resi tidak ditemukan)
            throw new Error(response.data.message || 'Gagal melacak resi.');
        }

    } catch (error) {
        let isApiLimitOrAuthError = false;

        if (error.response) {
            const status = error.response.status;
            // Status 400 biasanya bad request (kurir salah/resi salah), jangan switch key.
            // Status 403 / 429 terkait otorisasi dan limit
            if (status === 403 || status === 429 || status === 401) {
                isApiLimitOrAuthError = true;
            } else if (status === 400) {
                throw new Error("Nomor resi/kurir tidak valid, atau JNE HP diwajibkan.");
            } else if (status >= 500) {
                throw new Error("Server BinderByte sedang maintenance (Gangguan internal).");
            }
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || !error.response) {
            isApiLimitOrAuthError = true;
        }

        // Coba key lain jika memungkinkan
        if (isApiLimitOrAuthError && retryCount < API_KEYS.length - 1) {
            console.log(`[API] Gagal dengan key index ${currentKeyIndex} (Limit/Koneksi). Mencoba fallback key...`);
            switchKey();
            return await trackReceipt(awb, courier, hp, retryCount + 1); // Coba lagi dengan key baru
        }

        // Jika semua gagal, berikan pesan error manusiawi berdasarkan limit/auth status
        if (isApiLimitOrAuthError) {
            throw new Error("Sistem terlalu sibuk atau kuota harian pelacakan Anda sudah habis.");
        }

        if (error.response && error.response.data && error.response.data.message) {
            throw new Error(error.response.data.message);
        }
        throw new Error("Gagal menghubungi server pelacakan saat ini.");
    }
};

/**
 * Format data tracking lengkap (untuk notifikasi scheduler / cron job)
 * Menampilkan 2 riwayat terakhir.
 *
 * @param {Object} data - Data objek dari fungsi trackReceipt
 * @returns {string} String yang diformat untuk notifikasi otomatis
 */
const formatTrackingResult = (data) => {
    const summary = data.summary;
    const detail  = data.detail;
    const currentStatus = summary.status;

    const isDelivered = currentStatus.toLowerCase() === 'delivered';
    const isProcess   = !isDelivered && currentStatus.toLowerCase() !== 'returned';

    let statusHeader = '';
    if (isDelivered)   statusHeader = '🟢 *PAKET DITERIMA*';
    else if (isProcess) statusHeader = '🟡 *PAKET DI PERJALANAN*';
    else statusHeader = `🔴 *STATUS:* ${currentStatus.toUpperCase()}`;

    let statusLabel = 'Dikirim';
    if (isDelivered) statusLabel = 'Diterima';
    else if (currentStatus.toLowerCase() === 'returned') statusLabel = 'Dikembalikan';

    // Sensor nama penerima untuk privasi
    const rawReceiver = detail.receiver || '-';
    const maskedReceiver = rawReceiver.split(' ').map(word => {
        if (word.length <= 2 || word === '-') return word;
        return word.slice(0, 2) + '*'.repeat(word.length - 2);
    }).join(' ');

    // Ambil 2 riwayat terakhir (untuk notif scheduler)
    const recentHistory = data.history.slice(0, 2);
    let historyText = '';
    recentHistory.forEach((h) => {
        historyText += `> ${h.date}\n> ${h.desc}\n\n`;
    });

    return `
📦 *TRACKING PENGIRIMAN*
━━━━━━━━━━━━━━━━━━
${statusHeader}

📤 ${detail.shipper || '-'} — ${detail.origin || '-'}
📥 ${maskedReceiver} — ${detail.destination || '-'}

📍 Status Pengiriman: *${statusLabel}*

🕐 *RIWAYAT PERJALANAN*
━━━━━━━━━━━━━━━━━━
${historyText.trim()}

_— *Bagaskara Cell* 📦_`.trim();
};

module.exports = {
    trackReceipt,
    formatTrackingResult
};
