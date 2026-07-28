# 远控画面冻结排查

本文适用于远控画面卡住、鼠标和键盘输入仍可正常使用的情况。

## 浏览器诊断信息

打开会话面板，进入 **设置 → 调试信息 → 远控调试日志**，记录冻结前后的条目。

使用 Chromium 时：

1. 在复现问题前打开 `chrome://webrtc-internals`。
2. 复现画面冻结。
3. 画面冻结后导出 WebRTC dump。

## macOS 被控端日志

UU 远程的安装版本不同，被控 Mac 上的日志可能位于以下一个或多个位置：

- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Server/UURemoteServer.log`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/streamer_log.txt`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/connection_log.txt`
- `~/Library/Application Support/com.netease.uuremote/Logs/`

## 网关日志

Node 网关会将日志写入 `/tmp/uurc-web-backend.log`。使用 Docker Compose 时也可以执行：

```bash
docker compose logs uurc-web
```

Cloudflare Workers Logs 只记录信令相关信息。信令完成后，音视频和输入由浏览器通过 WebRTC 传输，因此网关日志不包含浏览器解码和画面呈现状态。

## 分享诊断文件前

请从日志和 WebRTC dump 中移除 Token、设备 ID、IP 地址、账号信息、房间信息和会话信息。
