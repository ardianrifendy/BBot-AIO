/**
 * ============================================================
 * LOGGER — Centralized Logging (Winston)
 * ============================================================
 * Output: Console (berwarna) + File harian di reports/logs/
 * Format: [TIMESTAMP] [LEVEL] message
 * Rotasi: Harian, simpan 7 hari terakhir
 * ============================================================
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Pastikan folder logs ada
const logsDir = path.resolve(__dirname, '../reports/logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// ── Format Custom ──────────────────────────────────────────────────────────────
const timestampFormat = winston.format.timestamp({
    format: () => new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
});

const consoleFormat = winston.format.combine(
    timestampFormat,
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} ${level}: ${message}`;
    })
);

const fileFormat = winston.format.combine(
    timestampFormat,
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
);

// ── Transport: Console ──────────────────────────────────────────────────────────
const consoleTransport = new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
});

// ── Transport: File Harian ─────────────────────────────────────────────────────
const fileTransport = new DailyRotateFile({
    filename: path.join(logsDir, '%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxFiles: '7d',  // Simpan 7 hari
    format: fileFormat,
    level: 'info'
});

// ── Create Logger ──────────────────────────────────────────────────────────────
const logger = winston.createLogger({
    transports: [consoleTransport, fileTransport],
    exitOnError: false
});

// ── Helper Methods ─────────────────────────────────────────────────────────────
// Shortcut untuk log per modul: logger.module('SCRAPER').info('...')
logger.module = (moduleName) => ({
    debug: (msg) => logger.debug(`[${moduleName}] ${msg}`),
    info:  (msg) => logger.info(`[${moduleName}] ${msg}`),
    warn:  (msg) => logger.warn(`[${moduleName}] ${msg}`),
    error: (msg) => logger.error(`[${moduleName}] ${msg}`),
});

module.exports = logger;
