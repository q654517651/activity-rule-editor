@echo off
chcp 65001 >nul
title Activity Rule Editor - 停止脚本
color 0C

echo ====================================
echo   Activity Rule Editor 停止脚本
echo ====================================
echo.

echo 正在停止所有服务...
echo.

:: 停止 Python (后端)
echo [1/3] 停止后端服务...
taskkill /F /IM python.exe >nul 2>&1
if errorlevel 1 (
    echo [提示] 未找到运行中的 Python 进程
) else (
    echo [成功] 后端服务已停止
)
echo.

:: 停止 Node (前端)
echo [2/3] 停止前端服务...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo [提示] 未找到运行中的 Node 进程
) else (
    echo [成功] 前端服务已停止
)
echo.

:: 停止 cloudflared
echo [3/3] 停止 cloudflared 隧道...
taskkill /F /IM cloudflared.exe >nul 2>&1
if errorlevel 1 (
    echo [提示] 未找到运行中的 cloudflared 进程
) else (
    echo [成功] cloudflared 服务已停止
)
echo.

echo ====================================
echo   所有服务已停止！
echo ====================================
echo.
pause

