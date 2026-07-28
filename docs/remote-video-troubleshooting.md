# Troubleshooting Frozen Remote Video

[简体中文](remote-video-troubleshooting.zh-CN.md)

Use this guide when the remote video freezes while mouse and keyboard input still work.

## Browser diagnostics

Open the session panel and go to **Settings → Debug info → Remote control debug log**. Record the entries around the freeze.

When using Chromium:

1. Open `chrome://webrtc-internals` before reproducing the problem.
2. Reproduce the freeze.
3. Export the WebRTC dump after the video freezes.

## macOS controlled-device logs

Depending on the installed UU Remote version, logs may appear in one or more of these locations on the controlled Mac:

- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Server/UURemoteServer.log`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/streamer_log.txt`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/connection_log.txt`
- `~/Library/Application Support/com.netease.uuremote/Logs/`

## Gateway logs

The Node gateway writes to `/tmp/uurc-web-backend.log`. Docker Compose users can also run:

```bash
docker compose logs uurc-web
```

Cloudflare Workers Logs cover signal traffic only. After signaling, video, audio, and input travel over browser-negotiated WebRTC. Gateway logs therefore do not include browser decoding or rendering state.

## Before sharing diagnostic files

Remove tokens, device IDs, IP addresses, account details, and room or session information from logs and WebRTC dumps.
