# 一键启动脚本使用说明

## 启动方式

**启动：**
```cmd
start.bat
```

**停止：**
- 关闭控制台窗口，或
- 运行 `stop.bat`

**特点：**
- ✅ 简单易用
- ✅ 单个终端窗口
- ✅ 所有服务在后台运行
- ⚠️ 关闭窗口会停止所有服务

---

## 服务地址

启动后可访问：

- **后端 API**: http://127.0.0.1:8000
- **前端页面**: http://localhost:5173
- **cloudflared 公网地址**: 启动后在控制台输出中查找（格式：https://xxx.trycloudflare.com）

---

## 前置要求

1. **Python 虚拟环境**
   ```cmd
   python -m venv .venv
   .venv\Scripts\activate
   pip install openpyxl fastapi uvicorn python-multipart
   ```

2. **前端依赖**
   ```cmd
   cd web
   pnpm install
   ```

3. **cloudflared** 
   - 确保 `cloudflared.exe` 在项目根目录或系统 PATH 中

---

## 常见问题

**Q: 启动后没反应？**
- 检查 `.venv` 虚拟环境是否存在
- 检查 `pnpm` 是否安装
- 查看控制台输出的错误信息

**Q: cloudflared 公网地址在哪？**
- 启动后会在控制台输出
- 查找类似 `https://xxx.trycloudflare.com` 的地址

**Q: 如何只停止某个服务？**
- 使用任务管理器找到对应进程手动结束
- 或使用 `taskkill` 命令

**Q: 想看详细的启动日志？**
- 可以分别手动启动三个服务来查看详细输出
- 或修改 `start.bat` 去掉 `start /B` 参数

