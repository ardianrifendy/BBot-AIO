<div align="center">

# 🤖 BagaskaraBot v2.0

**Ekosistem Bot Otonom Terpusat untuk Reseller HP**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://web.whatsapp.com)
[![Facebook](https://img.shields.io/badge/Facebook-Auto--Poster-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://facebook.com)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Database-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)](https://sheets.google.com)

> Satu file, satu klik — WhatsApp Bot + FB Auto-Poster + Smart Recommendation + Marketplace Scraper berjalan otomatis 24/7.

---

[🚀 Quick Start](#-quick-start-5-menit) • [✨ Fitur](#-fitur-lengkap) • [⚙️ Konfigurasi](#%EF%B8%8F-konfigurasi) • [📊 Google Sheets](#-setup-google-sheets) • [🤖 Smart Bot](#-smart-recommendation-bot) • [❓ FAQ](#-faq--troubleshooting)

</div>

---

## 🗺️ Arsitektur Sistem

```
                    ┌─────────────────────────────────────┐
                    │           BAGASKARABOT v2.0          │
                    │     (node main.js — One Click)       │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼──────────────────────┐
              │                    │                      │
   ┌──────────▼──────────┐  ┌──────▼──────────┐  ┌───────▼────────┐
   │   WhatsApp Bot      │  │  FB Auto-Poster  │  │   Scheduler    │
   │  (Event-driven)     │  │  (Setiap ~1 jam) │  │  (Cron 1 jam)  │
   └──────────┬──────────┘  └──────┬──────────┘  └───────┬────────┘
              │                    │                      │
   ┌──────────▼──────────┐  ┌──────▼──────────┐  ┌───────▼────────┐
   │ • Cek Resi          │  │• Catalog Image   │  │• Auto-track    │
   │ • Stock Opname      │  │  Generator       │  │  Resi aktif    │
   │ • Smart Rec Bot     │  │• Marketplace     │  │• Daily Report  │
   │ • Shopee Monitor    │  │  Price Scraper   │  │  08:00 WIB     │
   └──────────┬──────────┘  └──────┬──────────┘  └───────┬────────┘
              │                    │                      │
              └────────────────────▼──────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      Google Sheets           │
                    │  (Single Source of Truth)    │
                    │                              │
                    │  Users │ Stocks │ Catalog    │
                    │  ActiveTracks │ StockTracks  │
                    │  History │ MarketplacePrices │
                    └──────────────────────────────┘
```

---

## 🚀 Quick Start (5 Menit)

<details>
<summary><b>📋 Prasyarat — Klik untuk expand</b></summary>

Pastikan hal-hal berikut sudah terinstall di PC Anda:

| Software | Versi Minimum | Link Download |
|----------|--------------|---------------|
| Node.js  | v18.0.0+     | [nodejs.org](https://nodejs.org) |
| Google Chrome | Terbaru | [google.com/chrome](https://google.com/chrome) |
| Git | Terbaru | [git-scm.com](https://git-scm.com) |

Dan Anda butuh akun/credentials berikut:
- ✅ Akun **Google** dengan akses ke Google Sheets
- ✅ **Service Account** Google (file `credentials.json`)
- ✅ **API Key Binderbyte** — [daftar gratis di binderbyte.com](https://binderbyte.com)
- ✅ **API Key Google Gemini** — [aistudio.google.com](https://aistudio.google.com)
- ✅ Akun **Facebook** yang sudah bergabung ke grup target

</details>

### Langkah 1 — Clone & Install

```bash
cd d:\AntiGravity\BagaskaraBot
npm install
```

### Langkah 2 — Setup Environment

```bash
# Salin template env
copy .env.example .env
```

Buka `.env` dan isi nilai-nilainya:

```env
GOOGLE_SHEETS_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms  ← ID dari URL spreadsheet
BINDERBYTE_API_KEY=xxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxx
REPORT_GROUP_JID=628xxxxxxxxxx-xxxxxxxxxx@g.us  ← opsional
```

### Langkah 3 — Copy Credentials Google

```bash
# Letakkan file credentials.json Service Account di folder ini
copy d:\AntiGravity\WaResiBot\credentials.json d:\AntiGravity\BagaskaraBot\credentials.json
```

> 💡 **Cara dapat credentials.json:** Buka [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts → Create → Download JSON

### Langkah 4 — Setup Posting Config

Buka `posting_config.json` dan isi nama campaign:

```json
{
    "active": true,
    "campaign_name": "Grup Jual Beli HP",
    "use_catalog_image": true,
    "custom_text_override": ""
}
```

> 💡 Nama campaign harus sama persis dengan yang ada di `campaigns.json`

### Langkah 5 — Jalankan!

```bash
# Cara 1: Double-click file ini
MULAI_BOT.bat

# Cara 2: Via terminal
node main.js
```

Pertama kali jalankan → scan QR WhatsApp di terminal, lalu login Facebook di browser yang terbuka.

---

## ✨ Fitur Lengkap

<details>
<summary><b>📦 WhatsApp Bot — Command Tracking Resi</b></summary>

| Command | Fungsi | Contoh |
|---------|--------|--------|
| `!cekresi <kurir> <noresi>` | Cek status resi real-time | `!cekresi jnt JT1234567` |
| `!track <kurir> <noresi>` | Alias cekresi | `!track jne 123456789` |
| `!history` / `!h` | Lihat riwayat resi | `!h` |
| `!ch <no>` | Cek ulang resi dari histori | `!ch 3` |
| `!clear` | Hapus semua histori | `!clear` |
| `!addtrack <nama> <no> <kurir> <resi>` | Auto-track resi ke stok | `!addtrack Ardian 1 jnt JT123` |
| `!listtrack` / `!lt` | Lihat semua auto-track aktif | `!lt` |
| `!removetrack <id>` | Hapus auto-track | `!rmtrack 2` |

**Kurir yang didukung:** JNE, J&T, SiCepat, Anteraja, Pos Indonesia, Wahana, Ninja Express, SAP, Tiki, ID Express, dan 20+ kurir lainnya via Binderbyte.

</details>

<details>
<summary><b>🗃️ WhatsApp Bot — Stock Opname</b></summary>

| Command | Fungsi | Contoh |
|---------|--------|--------|
| `!adduser <nama>` | Daftarkan pemilik stok | `!adduser Ardian` |
| `!addready <nama> <barang>` | Tambah stok Ready | `!addready Ardian Samsung A55` |
| `!addnotready <nama> <barang>` | Tambah stok Di Jalan | `!addnotready Ardian iPhone 13` |
| `!list` / `!l` | Lihat semua stok | `!list` |
| `!move <nama> <no>` | Pindahkan status barang | `!move Ardian 2` |
| `!summary` / `!s` | Ringkasan total stok | `!s` |
| `!deletestock <nama> <no>` | Hapus item dari stok | `!ds Ardian 3` |
| `!renameready <nama> <no> <baru>` | Rename item stok | `!renameready Ardian 1 Samsung A55 8/256` |

</details>

<details>
<summary><b>🤖 Smart Recommendation Bot — AI Sales Assistant</b></summary>

Bot otomatis membalas DM dari prospek yang mengirim kata kunci tertentu. Tidak perlu ada yang online!

**Kata kunci trigger:**
`stok` `beli` `harga` `ada` `mau` `cari` `hp` `handphone` `rekomendasi` `butuh` `jual` `ready` `murah` `second` `baru` `garansi`

**Contoh percakapan:**
```
Prospek : "Kak ada stok hp ga?"
Bot      : "Halo kak! 👋 Ada nih stoknya!
            Boleh tahu budget-nya berapa kak? 💰"

Prospek : "3 juta"
Bot      : "Oke! Budget Rp 3.000.000 ya kak 👍
            Kebutuhannya apa nih kak?
            (Gaming, kamera, sehari-hari, atau yang penting baterai gede?)"

Prospek : "Gaming"
Bot      : "✨ 3 Rekomendasi HP untuk Budget Rp 3.000.000:
            ━━━━━━━━━━━━━━━━━━
            1️⃣ Samsung Galaxy A55 — Rp 2.950.000
               ✅ 2 Unit Ready | Baru
            2️⃣ Xiaomi Redmi Note 13 Pro — Rp 2.800.000
               ✅ 1 Unit Ready | Baru
            3️⃣ Realme 12 Pro — Rp 2.750.000
               ✅ 3 Unit Ready | Baru
            ━━━━━━━━━━━━━━━━━━
            Minat yang mana kak? 😊"
```

> ⚠️ Fitur ini membutuhkan sheet `Catalog` sudah terisi. Lihat [Setup Google Sheets](#-setup-google-sheets).

</details>

<details>
<summary><b>📊 Marketplace Price Scraper</b></summary>

Secara otomatis scraping harga kompetitor di **FB Marketplace** setiap ~4 jam.

- Input: Nama produk dari sheet `Catalog`
- Output: Harga min, max, rata-rata disimpan ke sheet `MarketplacePrices`
- Limit: Maksimal 10 produk per sesi (anti-ban)
- Delay: 5-12 detik acak antar pencarian

Gunakan data ini untuk menentukan harga jual yang kompetitif!

</details>

<details>
<summary><b>🖼️ Catalog Image Generator</b></summary>

Generate gambar katalog produk secara otomatis sebelum setiap sesi posting.

- Ambil data dari sheet `Catalog` + `Stocks` (filter: status = Ready)
- Generate gambar dark mode 800x1200px
- Tampilkan nama produk, harga, jumlah unit ready
- Watermark "Bagaskara Cell" + tanggal
- Gambar otomatis dipakai untuk posting ke grup FB

</details>

<details>
<summary><b>📤 FB Auto-Poster</b></summary>

Posting otomatis ke semua grup FB yang tersimpan di `campaigns.json`.

- Support mode **Normal** (postingan biasa) dan **Marketplace Form** (form jual-beli)
- Spintax: Teks bervariasi otomatis per grup untuk menghindari deteksi spam
- Delay: 15-30 detik acak antar grup
- Log: Semua hasil tersimpan di `reports/logs/`
- Config: Bisa pause/resume via `posting_config.json` tanpa restart bot

</details>

---

## ⚙️ Konfigurasi

### `posting_config.json` — Kontrol Auto-Posting

```json
{
    "active": true,
    "campaign_name": "Grup Jual Beli HP",
    "use_catalog_image": true,
    "custom_text_override": ""
}
```

| Field | Tipe | Keterangan |
|-------|------|-----------|
| `active` | boolean | `false` = pause auto-posting tanpa restart bot |
| `campaign_name` | string | Nama campaign dari `campaigns.json` |
| `use_catalog_image` | boolean | `true` = generate & attach gambar katalog otomatis |
| `custom_text_override` | string | Jika diisi, teks ini yang dipakai (override template) |

### `.env` — Semua API Keys

```env
# ─── Wajib ────────────────────────────────────────────────────
GOOGLE_SHEETS_ID=         # ID spreadsheet (dari URL Google Sheets)
BINDERBYTE_API_KEY=       # API key untuk cek resi

# ─── Opsional tapi direkomendasikan ──────────────────────────
GEMINI_API_KEY=           # AI untuk smart chat (Google Gemini)
REPORT_GROUP_JID=         # JID grup untuk daily report 08:00 WIB

# ─── Shopee Monitor (jika dipakai) ───────────────────────────
SHOPEE_EMAIL=
SHOPEE_PASSWORD=
SHOPEE_TARGET_URL=
```

---

## 📊 Setup Google Sheets

### Cara Dapat `GOOGLE_SHEETS_ID`

```
URL Spreadsheet:
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                       ↑ Bagian ini adalah SPREADSHEET_ID
```

### Sheet yang Digunakan

> 💡 Semua sheet dibuat **otomatis** saat pertama kali bot dijalankan. Anda tidak perlu buat manual.

<details>
<summary><b>📋 Sheet Existing (Tidak Perlu Diubah)</b></summary>

| Sheet | Kolom | Keterangan |
|-------|-------|-----------|
| `Users` | id, name | Daftar pemilik stok |
| `Stocks` | id, user_id, item_name, status, created_at | Inventori per unit |
| `ActiveTracks` | user_jid, courier, awb, hp, last_status, last_checked | Resi yang dilacak |
| `StockTracks` | id, stock_id, user_name, item_name, courier, awb, hp, last_status, added_by_jid, added_at | Resi yang dikaitkan ke stok |
| `History` | user_jid, courier, awb, hp, created_at | Riwayat pengecekan |

</details>

<details>
<summary><b>🆕 Sheet Baru — Wajib Diisi Manual</b></summary>

### Sheet `Catalog` — Data Produk & Harga

> ⚠️ **WAJIB diisi** agar Smart Recommendation Bot dan Catalog Generator bisa bekerja.

| Kolom | Contoh | Keterangan |
|-------|--------|-----------|
| `id` | 1 | Auto (isi 1, 2, 3...) |
| `item_name` | `Samsung Galaxy A55 8/256` | **Harus sama persis** dengan nama di sheet Stocks |
| `harga_beli` | `3000000` | Modal beli (angka, tanpa Rp atau titik) |
| `harga_jual` | `3750000` | Harga jual ke customer |
| `kondisi` | `Baru` | `Baru` atau `Bekas` |
| `deskripsi` | `Layar AMOLED 6.6", baterai 5000mAh` | Deskripsi singkat produk |
| `last_updated` | *(kosongkan)* | Diisi otomatis |

**Contoh isi sheet Catalog:**

| id | item_name | harga_beli | harga_jual | kondisi | deskripsi |
|----|-----------|-----------|-----------|---------|-----------|
| 1 | Samsung Galaxy A55 8/256 | 3000000 | 3750000 | Baru | Layar AMOLED, kamera 50MP |
| 2 | iPhone 13 128GB | 7500000 | 8500000 | Bekas | Mulus, baterai 92% |
| 3 | Xiaomi Redmi Note 13 Pro | 2500000 | 3200000 | Baru | AMOLED 120Hz, charge 67W |

### Sheet `MarketplacePrices` — Hasil Scraping

Diisi otomatis oleh bot. Anda bisa baca hasilnya sebagai referensi harga kompetitor.

</details>

---

## ⏱️ Jadwal Otomatis

| Waktu | Proses | Keterangan |
|-------|--------|-----------|
| Setiap **~60 menit** | Auto-Posting FB | Generate katalog → posting ke semua grup |
| Setiap **~4 jam** | Marketplace Scraping | Scrape harga kompetitor di FB |
| Setiap **jam (menit :00)** | Auto-cek Resi | Update status semua resi aktif |
| Setiap hari **08:00 WIB** | Daily Report Stok | Kirim rangkuman stok ke grup WA |
| **Selalu aktif** | Smart Recommendation | Balas DM prospek yang masuk kapanpun |

---

## 📁 Struktur Folder

```
BagaskaraBot/
│
├── 🚀 MULAI_BOT.bat              ← Klik 2x untuk jalankan bot
├── 🎯 main.js                    ← Orchestrator utama
├── ⚙️  posting_config.json        ← Config auto-posting FB
├── 🔑 .env                       ← API keys (jangan di-share!)
├── 🔑 credentials.json           ← Google Service Account
│
├── core/                         ← Shared utilities
│   ├── googleSheets.js           ← Koneksi Google Sheets
│   ├── sheetConstants.js         ← Definisi semua sheet
│   ├── logger.js                 ← Logging ke file & console
│   └── delay.js                  ← Anti-ban delay helper
│
├── agents/
│   ├── whatsapp/
│   │   ├── index.js              ← Entry point WA Bot
│   │   └── src/
│   │       ├── smartRecommendation.js  ← 🆕 AI Sales Bot
│   │       ├── scheduler.js            ← Cron auto-track resi
│   │       ├── db.js                   ← Data access layer
│   │       ├── binderbyte.js           ← API cek resi
│   │       ├── gemini.js               ← Google Gemini AI
│   │       ├── shopee/                 ← Shopee monitor
│   │       └── commands/               ← 22 command WA
│   │
│   └── facebook/
│       ├── index.js              ← FB Poster (programmatic)
│       ├── campaigns.json        ← Daftar grup target
│       ├── spintax_template.txt  ← Template teks posting
│       └── src/
│           ├── marketplaceScraper.js  ← 🆕 Scraping harga
│           ├── catalogGenerator.js    ← 🆕 Generate gambar
│           ├── poster.js              ← Engine posting FB
│           ├── auth.js                ← Login FB (auto-poll)
│           ├── browser.js             ← Playwright launcher
│           └── spintax.js             ← Variasi teks
│
└── reports/
    └── logs/
        ├── YYYY-MM-DD.log        ← Log harian semua modul
        ├── fb_success.txt        ← Log posting FB berhasil
        └── fb_failed.txt         ← Log posting FB gagal
```

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>❌ WhatsApp QR tidak muncul / bot tidak konek</b></summary>

**Solusi:**
1. Hapus folder session WA lama:
   ```bash
   rmdir /s /q agents\whatsapp\.wwebjs_auth
   ```
2. Restart bot — QR baru akan muncul

</details>

<details>
<summary><b>❌ Facebook session expired / bot tidak bisa posting</b></summary>

**Solusi:**
- Bot otomatis buka browser Chrome untuk login ulang
- Tunggu browser terbuka → login manual di browser tersebut
- Bot akan lanjut otomatis setelah login terdeteksi (max 5 menit)

</details>

<details>
<summary><b>❌ Smart Recommendation Bot tidak membalas</b></summary>

**Penyebab & Solusi:**
1. Sheet `Catalog` belum diisi → Isi sheet Catalog di Google Sheets
2. Tidak ada stok Ready → Pastikan ada item dengan status `Ready` di sheet `Stocks`
3. Pesan dikirim dari grup → Smart Rec hanya aktif di DM/chat pribadi, bukan grup
4. Kata kunci tidak terdeteksi → Coba kirim kata seperti "ada stok?", "mau beli hp", "cari hp"

</details>

<details>
<summary><b>❌ Error: Cannot find module 'googleapis'</b></summary>

**Solusi:**
```bash
cd d:\AntiGravity\BagaskaraBot
npm install
```

</details>

<details>
<summary><b>❌ Error: Playwright / Chrome tidak bisa dibuka</b></summary>

**Solusi:**
```bash
cd d:\AntiGravity\BagaskaraBot
npx playwright install chromium
```

Pastikan Google Chrome sudah terinstall di PC.

</details>

<details>
<summary><b>❌ Auto-posting dinonaktifkan sementara</b></summary>

**Cara pause posting tanpa stop bot:**

Edit `posting_config.json`:
```json
{
    "active": false
}
```

Bot WhatsApp tetap jalan. Posting akan di-skip sampai diubah kembali ke `true`.

</details>

<details>
<summary><b>💡 Cara tambah kampanye grup FB baru</b></summary>

1. Jalankan `node d:\AntiGravity\FB-Auto-Poster\index.js` (bot lama) untuk scrape grup
2. Simpan dengan nama campaign baru
3. Salin `campaigns.json` yang baru ke `agents/facebook/campaigns.json`
4. Update `campaign_name` di `posting_config.json`

</details>

<details>
<summary><b>💡 Cara lihat log bot</b></summary>

Log tersimpan otomatis di:
```
reports/logs/YYYY-MM-DD.log   ← Semua aktivitas hari ini
reports/logs/fb_success.txt   ← Posting FB berhasil
reports/logs/fb_failed.txt    ← Posting FB gagal
```

Untuk melihat log realtime saat bot berjalan, cukup lihat terminal.

</details>

---

## 🔧 Maintenance

### Update Stok & Harga
Edit langsung di Google Sheets — bot akan membaca data terbaru di iterasi berikutnya.

### Ubah Template Posting
Edit file `agents/facebook/spintax_template.txt`. Gunakan format `{Kata1|Kata2}` untuk variasi otomatis.

### Restart Bot
Tekan `Ctrl+C` di terminal → Jalankan `MULAI_BOT.bat` lagi.

---

<div align="center">

---

Made with ❤️ for **Bagaskara Cell** 📦

*Bot ini berjalan di latar belakang. Anda bisa tutup terminal setelah bot berjalan — gunakan `MULAI_BOT.bat` untuk restart.*

</div>
