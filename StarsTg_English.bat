@echo off
setlocal
title IT English Telegram Stars

set "PROJECT=C:\Users\HYPERPC\Documents\Проект_по_умолчанию\IT_ENGLISH_TG_2"
set "TELEGRAM_WEBAPP_URL=https://arthur404-max.github.io/IT_ENGLISH_TG_2/"
set "PORT=8788"

if "%TELEGRAM_BOT_TOKEN%"=="" set /p TELEGRAM_BOT_TOKEN=Telegram bot token: 
if "%TELEGRAM_BOT_TOKEN%"=="" (
  echo Telegram bot token is required.
  pause
  exit /b 1
)

cd /d "%PROJECT%" || (
  echo Project folder not found: %PROJECT%
  pause
  exit /b 1
)

echo Starting Telegram Stars server...
node bot\server.mjs

if errorlevel 1 (
  echo.
  echo Telegram Stars server stopped with an error.
  pause
)
