@echo off
setlocal
title Stop IT English Telegram Stars

echo Stopping Telegram Stars server on port 8788...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$connections = Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue; " ^
  "foreach ($connection in $connections) { " ^
  "  Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue " ^
  "}"

echo Telegram Stars server stopped.
timeout /t 2 /nobreak >nul
