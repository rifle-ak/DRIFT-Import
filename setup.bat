@echo off
title DRIFT-Import Setup

echo.
echo  ========================================
echo   DRIFT-Import Setup
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
    echo  After installing, run this setup again.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found
for /f "tokens=*" %%i in ('node -v') do echo       Version: %%i
echo.

:: Install dependencies
echo  [*] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)
echo  [OK] Dependencies installed
echo.

:: Create .env if it doesn't exist
if not exist ".env" (
    echo  [*] Creating .env file...
    copy .env.example .env >nul
    echo  [OK] .env file created
    echo.
    echo  ----------------------------------------
    echo   IMPORTANT: You need to add your bot token!
    echo  ----------------------------------------
    echo.
    echo  Opening .env in Notepad...
    echo  Replace "your_bot_token_here" with your actual Discord bot token.
    echo.
    timeout /t 2 >nul
    notepad .env
) else (
    echo  [OK] .env file already exists
)

echo.
echo  ========================================
echo   Setup Complete!
echo  ========================================
echo.
echo  Next steps:
echo    1. Make sure your bot token is in .env
echo    2. Edit config.json with your export file path and forum channel ID
echo    3. Double-click run.bat to start the import
echo.
pause
