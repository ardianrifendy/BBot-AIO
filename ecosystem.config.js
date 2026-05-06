// ============================================================
// PM2 Ecosystem Config — BagaskaraBot
// ============================================================
// Cara pakai:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   ← ikuti instruksi untuk auto-start saat boot
// ============================================================

module.exports = {
    apps: [
        {
            name:          'BagaskaraBot',
            script:        'main.js',
            cwd:           __dirname,
            node_args:     '--max-old-space-size=512',

            // Restart otomatis jika crash, dengan exponential backoff
            restart_delay:  5000,          // tunggu 5 detik sebelum restart
            max_restarts:   10,            // maks 10 restart dalam satu periode
            min_uptime:     '30s',         // anggap stable jika jalan > 30 detik

            // Jangan restart jika exit code 0 (shutdown bersih)
            autorestart:    true,
            watch:          false,         // jangan watch file (bisa trigger loop)

            // Environment variables
            env: {
                NODE_ENV:         'production',
                DASHBOARD_PORT:   '3001',
            },

            // Log output ke file
            out_file:      './reports/logs/pm2_out.log',
            error_file:    './reports/logs/pm2_error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs:    true,

            // Graceful shutdown
            kill_timeout:  5000,
            listen_timeout: 10000,
        }
    ]
};
