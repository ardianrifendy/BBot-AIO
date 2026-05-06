const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let model = null;

const SYSTEM_PROMPT = `Kamu adalah asisten bot WhatsApp yang ramah dan helpful. Kamu membantu pengguna dalam:
1. Melacak paket/resi pengiriman di Indonesia (JNE, J&T, SiCepat, dll)
2. Mengelola stok barang gudang (Stock Opname)

Panduan command bot:
- !cekresi <kurir> <noresi> — Melacak resi
- !h — Lihat histori resi
- !ch <no> — Cek ulang resi dari histori
- !list — Lihat semua stok barang
- !addready <Nama> <Barang> — Tambah stok Ready
- !addnotready <Nama> <Barang> — Tambah stok Dalam Pengiriman
- !move <Nama> <No> — Pindahkan status barang
- !ds <Nama> <No> — Hapus barang dari stok
- !help — Panduan lengkap

Aturan:
- Jawab dalam bahasa Indonesia
- Jawab singkat, padat, dan jelas (maks 3-4 kalimat)
- Jika ditanya hal di luar konteks bot, tetap jawab dengan sopan tapi arahkan kembali ke fitur bot
- Gunakan emoji secukupnya untuk membuat respon lebih menarik
- Jangan gunakan format markdown yang berat, hanya *bold* dan _italic_ yang didukung WhatsApp`;

/**
 * Inisialisasi Gemini Pro model
 */
const init = () => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        console.warn('[GEMINI] API Key belum dikonfigurasi di .env');
        return false;
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: SYSTEM_PROMPT
        });
        console.log('[GEMINI] Google Gemini Pro berhasil diinisialisasi.');
        return true;
    } catch (error) {
        console.error('[GEMINI] Gagal menginisialisasi:', error.message);
        return false;
    }
};

/**
 * Kirim pesan ke Gemini Pro dan dapatkan respons
 * @param {string} userMessage - Pesan dari user
 * @returns {Promise<string>} Respons dari AI
 */
const chat = async (userMessage) => {
    if (!model) {
        if (!init()) {
            return null;
        }
    }

    try {
        const result = await model.generateContent(userMessage);
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error('[GEMINI] Gagal mendapatkan respons:', error.message);

        if (error.message.includes('quota') || error.message.includes('limit')) {
            return '⚠️ Maaf, kuota AI sedang habis. Silakan coba lagi nanti.';
        }

        return '⚠️ Maaf, saya sedang mengalami gangguan. Silakan coba lagi nanti atau ketik *!help* untuk panduan bot.';
    }
};

/**
 * Cek apakah Gemini sudah aktif
 */
const isActive = () => {
    return model !== null;
};

module.exports = {
    init,
    chat,
    isActive
};
