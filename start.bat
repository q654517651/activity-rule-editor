@echo off
chcp 65001 >nul
title Activity Rule Editor - 主控制台
color 0A

echo ====================================
echo   Activity Rule Editor 启动脚本
echo ====================================
echo.

:: 启动后端
echo [1/3] 启动后端服务...
start /B "" cmd /c "cd /d %~dp0 && .venv\Scripts\activate && python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
echo [成功] 后端服务已在后台启动 (http://127.0.0.1:8000)
echo.

:: 启动前端
echo [2/3] 启动前端服务...
start /B "" cmd /c "cd /d %~dp0\web && pnpm dev"
timeout /t 3 /nobreak >nul
echo [成功] 前端服务已在后台启动 (http://localhost:5173)
echo.

:: 启动 cloudflared
echo [3/3] 启动 cloudflared 隧道...
start /B "" cmd /c "cd /d %~dp0 && cloudflared tunnel --url http://localhost:5173 --config NUL --no-autoupdate --protocol http2 --edge-ip-version auto"
timeout /t 3 /nobreak >nul
echo [成功] cloudflared 隧道已在后台启动
echo.

echo ====================================
echo   所有服务已启动！
echo ====================================
echo.
echo 后端服务: http://127.0.0.1:8000
echo 前端服务: http://localhost:5173
echo.
echo cloudflared 公网地址将显示在上方日志中（查找 https://xxx.trycloudflare.com）
echo.
echo 提示：
echo - 所有服务运行在后台
echo - 关闭此窗口将停止所有服务
echo - 或运行 stop.bat 停止所有服务
echo.
pause
