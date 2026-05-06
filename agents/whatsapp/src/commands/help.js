const { reply } = require('../utils/helpers');

// ─── Teks help per kategori ───────────────────────────────────────────────────

const HELP_TRACKING = `\
📦 *PANDUAN TRACKING RESI*
━━━━━━━━━━━━━━━━━━━━━━━

*Single Check:*
\`!cekresi [kurir] [resi]\`
• \`!cekresi jnt 987654321\`
• \`!cekresi sicepat 1234567890\`
• \`!cekresi jne JX12345 89123\` _(JNE wajib +5 digit HP)_

🔤 *Anti-Typo Kurir:*
_J&T, JNT, jnt express → jnt_
_si cepat, SC → sicepat_
_shopee, Shopee Express → spx_
_posindo, pos indonesia → pos_

*Bulk Check (Admin):*
\`\`\`!cekresi
jnt 987654321
sicepat 1234567890
jne JX12345 89123\`\`\`

*History Resi:*
• \`!h\` / \`!history\` — Lihat semua resi Anda
• \`!ch 1\` — Cek ulang resi no.1
• \`!h delete 1\` — Hapus histori no.1

💡 _Ketik_ \`!help stok\` _atau_ \`!help admin\` _untuk topik lain._`;

const HELP_STOK = `\
📦 *PANDUAN STOK OPNAME*
━━━━━━━━━━━━━━━━━━━━━━━

*Lihat Stok:*
• \`!l\` / \`!list\` — Semua user
• \`!l Ardian\` — Filter user tertentu
• \`!s\` / \`!summary\` — Ringkasan angka saja

*Tambah Stok (Admin):*
• \`!addready Ardian Poco F7 White\` — Tambah ke Gudang
• \`!addnotready Ardian Poco F7 White\` — Tambah ke Di Jalan
_Multi-baris juga bisa:_
\`\`\`!addready Ardian
Poco F7 White
Samsung A26 Indri\`\`\`

*Kelola Stok (Admin):*
• \`!move Ardian 1 3 5\` — Pindah status (Ready↔Di Jalan)
• \`!renameready Ardian 1 Nama Baru\` — Ganti nama item Ready
• \`!renamenotready Ardian 1 Nama Baru\` — Ganti nama item Di Jalan
• \`!ds Ardian 1\` — Hapus item (bisa multi: \`!ds Ardian 1 3 5\`)

*Auto Track Resi Stok (Admin):*
• \`!addtrack Ardian 5 jnt 987654321\` — Link resi ke stok Di Jalan
• \`!lt\` / \`!listtrack\` — Lihat track aktif

💡 _Ketik_ \`!help jual\` _atau_ \`!help tracking\` _untuk topik lain._`;

const HELP_JUAL = `\
💰 *PANDUAN PENJUALAN*
━━━━━━━━━━━━━━━━━━━━━━━

*Input Terjual (Admin):*
• \`!terjual [user] [no] [harga] [pembeli] [catatan]\`
_Contoh: !terjual Ardian 1 1500000 Budi Cash_
_(No diambil dari list stok !l user)_

*Laporan Penjualan:*
• \`!penjualan\` — Ringkasan bulan ini
• \`!penjualan 03\` — Ringkasan bulan Maret
• \`!omzet\` — Sama dengan !penjualan

💡 _Ketik_ \`!help stok\` _atau_ \`!help tracking\` _untuk topik lain._`;

const HELP_ADMIN = `\
🛠️ *PANDUAN ADMIN*
━━━━━━━━━━━━━━━━━━━━━━━

*Manajemen User Stok (Admin):*
• \`!adduser Nama\` — Daftarkan user stok baru

*Utilitas (Admin):*
• \`!c\` / \`!clear\` — Hapus pesan bot + command di chat
• \`!del\` — Reply + hapus pesan tertentu
• \`!restartbot\` — Restart bot

*Info Bot:*
• \`!status\` / \`!ping\` — Uptime, stok, track, cache

💡 _Ketik_ \`!help tracking\` _atau_ \`!help stok\` _untuk topik lain._`;

const HELP_MAIN = `\
🤖 *PANDUAN BOT — Bagaskara Cell*
━━━━━━━━━━━━━━━━━━━━━━━

Pilih topik panduan:

📦 \`!help tracking\` — Cek resi & pelacakan
📋 \`!help stok\` — Manajemen stok barang
💰 \`!help jual\` — Input & Laporan Penjualan
🛠️ \`!help admin\` — Panduan khusus admin
⚙️ \`!status\` — Info status & kesehatan bot

━━━━━━━━━━━━━━━━━━━━━━━
💡 _Notifikasi resi otomatis setiap 1 jam._
💾 _Cache hasil cek: 30 menit._

_— *Bagaskara Cell* 📦_`;

// ─── Execute ──────────────────────────────────────────────────────────────────

const execute = async (msg, args) => {
    const kategori = (args[1] || '').toLowerCase().trim();

    let text;
    switch (kategori) {
        case 'tracking':
        case 'track':
        case 'resi':
            text = HELP_TRACKING; break;
        case 'stok':
        case 'stock':
        case 'barang':
            text = HELP_STOK; break;
        case 'jual':
        case 'penjualan':
        case 'shopee':
            text = HELP_JUAL; break;
        case 'admin':
        case 'adm':
            text = HELP_ADMIN; break;
        default:
            text = HELP_MAIN;
    }

    return reply(msg, text.trim());
};

module.exports = { execute };
