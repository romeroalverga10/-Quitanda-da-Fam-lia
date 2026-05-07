@echo off
cd /d "%~dp0"
start "PDV-Server" /min node server.js
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
