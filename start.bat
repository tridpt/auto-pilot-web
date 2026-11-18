@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo 🤖 Đang khởi động AutoPilot Web (Browser Automator)...
echo 🌐 Mở trình duyệt tại: http://localhost:4095
echo ========================================================
start "" "http://localhost:4095"
node server.js
pause
