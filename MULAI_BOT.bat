@echo off
title BagaskaraBot v2.0 - Bagaskara Cell
color 0A

echo.
echo  ================================================
echo   BAGASKARABOT v2.0 - One Click Start
echo   WhatsApp + FB Auto-Poster + Dashboard Web UI
echo  ================================================
echo.

cd /d "%~dp0"

:: Cek .env
if not exist ".env" (
    echo [ERROR] File .env belum ada!
    echo Salin .env.example ke .env dan isi nilainya.
    pause & exit /b 1
)

:: Cek credentials.json
if not exist "credentials.json" (
    echo [ERROR] File credentials.json belum ada!
    pause & exit /b 1
)

:: Kill sisa proses dari run sebelumnya
echo [CLEANUP] Membersihkan proses lama...
taskkill /F /IM chrome.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 3001,3002 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1
timeout /t 3 /nobreak >nul

echo [START] Memulai BagaskaraBot...
echo [INFO]  Dashboard akan terbuka otomatis di browser
echo [INFO]  Scan QR WhatsApp yang muncul di terminal ini
echo.

node main.js

echo.
echo Bot berhenti. Tekan tombol apapun untuk keluar.
pause
