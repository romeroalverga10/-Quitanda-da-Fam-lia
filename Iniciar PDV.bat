@echo off
title Quitanda da Familia - PDV
echo.
echo  Iniciando PDV Quitanda da Familia...
echo.

cd /d "%~dp0"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
node server.js
pause
