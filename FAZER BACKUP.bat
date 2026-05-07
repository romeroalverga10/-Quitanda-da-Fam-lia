@echo off
echo ================================================
echo        BACKUP - Quitanda da Familia
echo ================================================
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0backup.ps1"
echo.
pause
