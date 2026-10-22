@echo off
chcp 65001 > nul
cd /d %~dp0
if not exist node_modules (
  echo 初回セットアップ中...
  call npm install
)
set /p TTUSER=TikTokのユーザー名を入力:kbsnpi
node server.js %TTUSER%
pause
