@echo off
title One Thing - local server
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist .env (
  echo No .env file found. Copy .env.example to .env and fill in APP_KEY first.
  pause
  exit /b 1
)

echo.
echo Starting One Thing...  Close this window to stop it.
echo Your access key is the APP_KEY line in the .env file.
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
