/**
 * ============================================================
 * KURIR MAPPER - Anti-Typo & Normalisasi Kode Kurir
 * ============================================================
 * Mengkonversi berbagai variasi input nama kurir dari pengguna
 * (termasuk typo umum, singkatan, dan format campuran) menjadi
 * kode API resmi yang diterima oleh Binderbyte.
 *
 * Cara penggunaan:
 *   const { normalizeKurir } = require('./kurirMapper');
 *   normalizeKurir('J&T Express') // → 'jnt'
 *   normalizeKurir('si cepat')    // → 'sicepat'
 *   normalizeKurir('posindo')     // → 'pos'
 * ============================================================
 */

/**
 * Tabel pemetaan: kunci = variasi input user (lowercase, tanpa spasi berlebih)
 *                 nilai = kode API Binderbyte yang valid
 *
 * Menambahkan entri baru sangat mudah — cukup tambah baris baru
 * dengan format: 'variasi_input': 'kode_api'
 */
const KURIR_MAP = {
    // ── JNT / J&T Express ──────────────────────────────────
    'jnt':            'jnt',
    'j&t':            'jnt',
    'j & t':          'jnt',
    'jnt express':    'jnt',
    'j&t express':    'jnt',
    'jnt expresss':   'jnt',   // common typo
    'jandt':          'jnt',
    'jet':            'jnt',

    // ── JNE ────────────────────────────────────────────────
    'jne':            'jne',
    'jne express':    'jne',
    'jne reg':        'jne',
    'jneexpress':     'jne',

    // ── SiCepat ────────────────────────────────────────────
    'sicepat':        'sicepat',
    'si cepat':       'sicepat',
    'sicepatt':       'sicepat',  // common typo
    'sc':             'sicepat',

    // ── Shopee Express / SPX ───────────────────────────────
    'spx':            'spx',
    'shopee':         'spx',
    'shopee express': 'spx',
    'shopeeexpress':  'spx',
    'shp':            'spx',

    // ── AnterAja ───────────────────────────────────────────
    'anteraja':       'anteraja',
    'antar aja':      'anteraja',
    'ante raja':      'anteraja',
    'aa':             'anteraja',

    // ── Wahana ─────────────────────────────────────────────
    'wahana':         'wahana',
    'wahana express': 'wahana',
    'whn':            'wahana',

    // ── ID Express ─────────────────────────────────────────
    'idexpress':      'idexpress',
    'id express':     'idexpress',
    'idx':            'idexpress',
    'id':             'idexpress',

    // ── POS Indonesia ──────────────────────────────────────
    'pos':            'pos',
    'posindo':        'pos',
    'pos indonesia':  'pos',
    'posindonesia':   'pos',

    // ── Ninja Express ──────────────────────────────────────
    'ninja':          'ninja',
    'ninjaxpress':    'ninja',
    'ninja express':  'ninja',
    'ninja xpress':   'ninja',

    // ── Lion Parcel ────────────────────────────────────────
    'lion':           'lion',
    'lion parcel':    'lion',
    'lionparcel':     'lion',
    'lp':             'lion',

    // ── TIKI ───────────────────────────────────────────────
    'tiki':           'tiki',

    // ── SAP Express ────────────────────────────────────────
    'sap':            'sap',
    'sap express':    'sap',

    // ── Grab Express ───────────────────────────────────────
    'grab':           'grab',
    'grab express':   'grab',
    'grabexpress':    'grab',

    // ── GoSend ─────────────────────────────────────────────
    'gosend':         'gosend',
    'go send':        'gosend',
    'gojek':          'gosend',

    // ── Lalamove ───────────────────────────────────────────
    'lalamove':       'lalamove',
    'lala':           'lalamove',

    // ── RPX ────────────────────────────────────────────────
    'rpx':            'rpx',

    // ── Pahala Express ─────────────────────────────────────
    'pahala':         'pahala',
    'pahala express': 'pahala',

    // ── JET / Jet Express ──────────────────────────────────
    'jetexpress':     'jetexpress',
    'jet express':    'jetexpress',

    // ── First Logistics ────────────────────────────────────
    'first':          'first',
    'firstlogistics': 'first',
    'first logistics':'first',
};

/**
 * Menormalisasi input kurir dari pengguna menjadi kode API
 *
 * @param {string} rawInput - Input mentah dari pengguna (contoh: 'J&T Express')
 * @returns {{ code: string|null, original: string, isValid: boolean }}
 *          code     : kode API yang valid (atau null jika tidak dikenali)
 *          original : input asli sebelum normalisasi
 *          isValid  : true jika berhasil dipetakan
 */
const normalizeKurir = (rawInput) => {
    if (!rawInput || typeof rawInput !== 'string') {
        return { code: null, original: rawInput, isValid: false };
    }

    // Normalisasi: lowercase + trim + hapus tanda baca yang umum diubah (tapi jaga &)
    const normalized = rawInput.toLowerCase().trim()
        .replace(/\s+/g, ' ');   // Ganti multi-spasi jadi satu spasi

    const code = KURIR_MAP[normalized] || null;

    return {
        code,
        original: rawInput,
        isValid: code !== null
    };
};

/**
 * Mengembalikan daftar kode kurir yang valid (untuk pesan error)
 * @returns {string[]}
 */
const getValidKurirList = () => {
    // Ambil nilai unik dari KURIR_MAP
    return [...new Set(Object.values(KURIR_MAP))].sort();
};

/**
 * Mengembalikan contoh cara tulis kurir yang umum dipakai
 * @returns {string} Teks siap tampil
 */
const getKurirExamples = () => {
    return [
        'jne, jnt, sicepat, spx',
        'wahana, anteraja, pos',
        'idexpress, ninja, lion',
        'tiki, sap, grab, gosend'
    ].join(' | ');
};

module.exports = {
    normalizeKurir,
    getValidKurirList,
    getKurirExamples,
    KURIR_MAP
};
