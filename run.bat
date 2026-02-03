@echo off
title DRIFT-Import

echo.
echo  ========================================
echo   DRIFT-Import
echo   Discord Chat Exporter to Forum Posts
echo  ========================================
echo.

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo  [*] Installing dependencies...
    echo.
    call npm install
    echo.
)

:: Check if .env exists
if not exist ".env" (
    echo  [ERROR] .env file not found!
    echo.
    echo  Please copy .env.example to .env and add your bot token:
    echo    1. Copy .env.example to .env
    echo    2. Open .env in notepad
    echo    3. Replace "your_bot_token_here" with your actual bot token
    echo.
    pause
    exit /b 1
)

:: Run the import
echo  [*] Starting import...
echo.
node import.js --config
echo.
pause
