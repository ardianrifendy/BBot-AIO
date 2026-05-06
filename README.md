<div align="center">

# 🤖 BagaskaraBot v2.0
**Ekosistem Bot Terpusat & Dashboard Premium untuk Reseller HP**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![Dashboard](https://img.shields.io/badge/Web-Dashboard-6366F1?style=for-the-badge&logo=next.js&logoColor=white)](http://localhost:3001)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://web.whatsapp.com)
[![Facebook](https://img.shields.io/badge/Facebook-Auto--Poster-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://facebook.com)

> Solusi All-in-one: WhatsApp Management + Auto-Post Facebook + **Real-time Web Dashboard** untuk pengelolaan stok dan penjualan yang profesional.

---

[🚀 Quick Start](#-quick-start-5-menit) • [💻 Web Dashboard](#-web-dashboard-ui) • [✨ Fitur](#-fitur-unggulan) • [⚙️ Konfigurasi](#%EF%B8%8F-konfigurasi) • [📊 Google Sheets](#-setup-google-sheets) • [❓ FAQ](#-faq--troubleshooting)

</div>

---

## 🧭 Arsitektur Baru
BagaskaraBot v2.0 kini berfokus pada stabilitas dan kemudahan kontrol manual via Web UI, menghilangkan modul otomasi pihak ketiga yang berisiko (seperti Shopee/AI legacy) untuk memastikan operasional 24/7 tanpa gangguan.

```
                    ┌─────────────────────────────────────┐
                    │           BAGASKARABOT v2.0          │
                    │      (node main.js — Web UI)         │
                    └──────────────┬──────────────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
    ┌──────────▼──────────┐ ┌──────▼──────────┐ ┌──────▼──────────┐
    │    Web Dashboard    │ │   WhatsApp Bot   │ │  FB Auto-Poster  │
    │  (Port 3001 - UI)   │ │  (Real-time)     │ │  (Shared Session)│
    └──────────┬──────────┘ └──────┬──────────┘ └──────┬──────────┘
               │                   │                   │
    ┌──────────▼──────────┐ ┌──────▼──────────┐ ┌──────▼──────────┐
    │ • Live Monitoring   │ │• Cek Resi        │ │• Auto-Posting    │
    │ • Stock Management  │ │• Manual Sales    │ │• Manual Post UI  │
    │ • Manual Post UI    │ │• Stock Sync      │ │• Catalog Image   │
    │ • Catalog & Pricing │ │• Daily Report    │ │• Price Scraper   │
    └──────────┬──────────┘ └──────┬──────────┘ └──────┬──────────┘
               │                   │                   │
               └───────────────────▼───────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      Google Sheets           │
                    │  (Single Source of Truth)    │
                    └──────────────────────────────┘
```

---

## 💻 Web Dashboard UI
Dashboard premium yang memungkinkan Anda mengontrol seluruh bot dari browser:

*   📊 **Overview**: Statistik stok, unit ready, unit di jalan, dan omzet potensial.
*   📦 **Stok Manager**: Tambah, pindahkan, atau hapus stok langsung dari web (sinkron ke Google Sheets).
*   📤 **Auto Post UI**: Fitur baru untuk posting manual ke grup FB dengan status login yang sudah disinkronkan dengan background agent.
*   🏷️ **Katalog & Harga**: Bandingkan harga modal, harga jual, dan rata-rata harga kompetitor di marketplace secara real-time.
*   🔍 **Cek Resi Massal**: Input banyak resi sekaligus dan pantau statusnya dalam satu tabel.

---

## 🚀 Quick Start (5 Menit)

<details>
<summary><b>📋 Prasyarat — Klik untuk expand</b></summary>

Pastikan hal-hal berikut sudah terinstall di PC Anda:

| Software | Versi Minimum | Link Download |
|----------|--------------|---------------|
| Node.js  | v18.0.0+     | [nodejs.org](https://nodejs.org) |
| Google Chrome | Terbaru | [google.com/chrome](https://google.com/chrome) |

Dan Anda butuh akun/credentials berikut:
- ✅ **Service Account** Google (file `credentials.json`)
- ✅ **API Key Binderbyte** — [daftar gratis di binderbyte.com](https://binderbyte.com)
- ✅ Akun **Facebook** untuk posting.

</details>

### Langkah 1 — Install
```bash
git clone https://github.com/ardianrifendy/BBot-AIO.git
cd BBot-AIO
npm install
```

### Langkah 2 — Setup .env
Salin file `.env.example` menjadi `.env` dan isi data Anda:
```env
GOOGLE_SHEETS_ID=   # ID Spreadsheet dari URL
BINDERBYTE_API_KEY= # API Key untuk resi
```

### Langkah 3 — Jalankan!
```bash
node main.js
```
Akses dashboard di: **[http://localhost:3001](http://localhost:3001)**

---

## ✨ Fitur Unggulan

### 1. Unified Facebook Session
Berbeda dengan bot lain, BagaskaraBot menggunakan satu sesi browser yang sama untuk **Auto-Posting** dan **Manual Posting**. Jika Anda sudah login di dashboard, bot otomatis bisa memposting tanpa perlu login ulang.

### 2. WhatsApp Command Center
Kendalikan inventori via chat WhatsApp:
*   `!list` / `!l`: Lihat semua stok aktif.
*   `!terjual <no>`: Tandai barang sebagai laku (mengurangi stok & masuk histori penjualan).
*   `!omzet <bulan>`: Laporan total penjualan bulanan.
*   `!track <kurir> <resi>`: Pantau resi pengiriman secara otomatis.

### 3. Marketplace Intelligence
Scraper otomatis yang berjalan setiap 4 jam untuk mengambil harga kompetitor di Facebook Marketplace, memastikan harga jual Anda selalu bersaing.

---

## 📊 Setup Google Sheets
Bot ini menggunakan Google Sheets sebagai database utama. Struktur sheet akan dibuat otomatis saat pertama kali dijalankan.

**Sheet Utama:**
*   `Catalog`: Daftar produk, harga modal, dan harga jual.
*   `Stocks`: Inventori fisik unit yang tersedia.
*   `SalesHistory`: (Baru) Data transaksi penjualan yang sukses.
*   `MarketplacePrices`: Hasil scraping harga kompetitor.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>❌ "dash is not defined" atau Error Port 3001</b></summary>
Pastikan tidak ada proses Node.js lain yang berjalan. Gunakan file `STOP_BOT.bat` untuk membersihkan semua proses sebelum menjalankan ulang.
</details>

<details>
<summary><b>❌ Nama Facebook tidak muncul di Dashboard</b></summary>
Klik tombol **"Cek Status Login"** di halaman Posting Manual. Bot akan mampir sejenak ke profil Anda untuk mengambil nama asli dan menyimpannya di cache.
</details>

---

<div align="center">

Made with ❤️ for **Bagaskara Cell** 📦
*Dashboard & Bot Terintegrasi v2.0*

</div>
