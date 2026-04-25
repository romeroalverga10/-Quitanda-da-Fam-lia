@echo off
title Instalador - PDV Quitanda da Familia
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo =========================================
echo   Instalador PDV Quitanda da Familia
echo =========================================
echo.

:: ── 1. Verificar Node.js ──────────────────
echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERRO: Node.js nao encontrado!
    echo  Instale o Node.js antes de continuar.
    echo  Acesse: https://nodejs.org  (versao LTS)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK - Node.js %NODE_VER% encontrado.
echo.

:: ── 2. Instalar dependencias ──────────────
echo [2/5] Instalando dependencias do sistema...
if exist node_modules (
    echo  Dependencias ja instaladas. Pulando...
) else (
    npm install
    if errorlevel 1 (
        echo.
        echo  ERRO ao instalar dependencias!
        pause
        exit /b 1
    )
    echo  OK - Dependencias instaladas.
)
echo.

:: ── 3. Detectar porta da balanca ─────────
echo [3/5] Detectando porta da balanca (FTDI)...
set PORTA_BALANCA=COM3

for /f "skip=1 tokens=*" %%i in ('wmic path Win32_PnPEntity where "Name like '%%(COM%%' and (Manufacturer like '%%FTDI%%' or Manufacturer like '%%Future Technology%%')" get Name 2^>nul') do (
    for /f "tokens=*" %%a in ("%%i") do (
        set LINHA=%%a
        if not "!LINHA!"=="" (
            for /f "tokens=2 delims=()" %%p in ("%%a") do set PORTA_BALANCA=%%p
        )
    )
)

echo  Porta da balanca: %PORTA_BALANCA%
echo.

:: ── 4. Detectar impressora ───────────────
echo [4/5] Detectando impressora...
set IMPRESSORA=EPSON TM-T20X Receipt6

for /f "skip=2 tokens=*" %%i in ('wmic printer get Name 2^>nul') do (
    set LINHA=%%i
    echo !LINHA! | findstr /i "EPSON TM-T20" >nul
    if not errorlevel 1 set IMPRESSORA=%%i
)

:: Remove espacos extras do final
for /f "tokens=* delims= " %%a in ("%IMPRESSORA%") do set IMPRESSORA=%%a
echo  Impressora: %IMPRESSORA%
echo.

:: ── 5. Atualizar config.json ─────────────
echo [5/5] Configurando sistema...
(
echo {
echo   "nomeLoja": "Quitanda da Familia",
echo   "portaBalanca": "%PORTA_BALANCA%",
echo   "baudRateBalanca": 9600,
echo   "chavePix": "romero.alverga@gmail.com",
echo   "porta": 3000,
echo   "impressora": "%IMPRESSORA%"
echo }
) > config.json

echo  config.json atualizado.
echo.

:: ── Concluido ────────────────────────────
echo =========================================
echo   Instalacao concluida com sucesso!
echo =========================================
echo.
echo   Balanca configurada em: %PORTA_BALANCA%
echo   Impressora configurada: %IMPRESSORA%
echo.
echo   Para iniciar o PDV, clique duas vezes em:
echo   "Iniciar PDV.bat"
echo.
pause
