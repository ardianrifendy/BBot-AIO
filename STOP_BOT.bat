@echo off
title Kill BagaskaraBot
color 0C

echo.
echo  ================================================
echo   STOP BAGASKARABOT — Kill All Processes
echo  ================================================
echo.

echo [1/3] Menghentikan semua proses Node.js...
taskkill /F /IM node.exe /T >nul 2>&1
if %errorlevel%==0 (echo      [OK] Node.js dihentikan.) else (echo      [INFO] Tidak ada proses Node.js.)

echo [2/3] Menghentikan semua proses Chrome...
taskkill /F /IM chrome.exe /T >nul 2>&1
if %errorlevel%==0 (echo      [OK] Chrome dihentikan.) else (echo      [INFO] Tidak ada Chrome yang berjalan.)

echo [3/3] Membebaskan port 3001 dan 3002...
powershell -Command "$ports = @(3001,3002); foreach($p in $ports){ $pid = (Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue).OwningProcess; if($pid){ Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue; Write-Host \"     [OK] Port $p dibebaskan.\" } }" 2>nul

echo.
echo  ================================================
echo   ✅ Semua proses BagaskaraBot sudah dihentikan.
echo   Jalankan MULAI_BOT.bat untuk memulai ulang.
echo  ================================================
echo.

timeout /t 3 /nobreak >nul
