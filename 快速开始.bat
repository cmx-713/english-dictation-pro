@echo off
chcp 65001 >nul
title 英语听写练习系统 - 启动器
color 0A

echo.
echo ========================================
echo   🎧 英语听写练习系统
echo   English Dictation Pro
echo ========================================
echo.
echo 正在启动开发服务器...
echo.
echo 提示：
echo - 服务器启动后会自动打开浏览器
echo - 如未自动打开，请手动访问 http://localhost:5173
echo - 按 Ctrl+C 可停止服务器
echo.
echo ========================================
echo.

cd /d "%~dp0"
call npm run dev

pause

