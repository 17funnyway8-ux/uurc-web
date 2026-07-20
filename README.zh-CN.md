# UU Remote Web

[English](README.md)

[![CI](https://github.com/iola1999/uurc-web/actions/workflows/ci.yml/badge.svg)](https://github.com/iola1999/uurc-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

UU 远程网页主控端。打开浏览器即可连接和控制自己的 UU 远程设备。

## 在线体验

公共实例：[https://uurc.678234.xyz](https://uurc.678234.xyz)

这个入口适合查看界面和体验基本流程。UU Remote Web 会处理短信登录、账号凭证和带鉴权的 UU API 请求，日常使用建议自行部署，并且只在自己控制或完全信任的实例中输入验证码、登录账号或导入凭证。

Cloudflare Worker + Durable Object 是较方便的自部署方式。Worker 负责页面、UU API 转发和信令网关；远控画面、声音与输入仍由浏览器通过 WebRTC 协商。自动路径会优先尝试局域网或 P2P 直连，条件不满足时再使用 UU 中转，Cloudflare 部署不会关闭直连能力。

## 功能

- 短信登录
- 账号凭证导入导出
- 设备列表
- 远控画面、声音、输入与剪贴板同步
- 多屏切换、连接诊断与自动重连
- 伙伴远程协助与接管控制
- 账号管理
- Node 与 Cloudflare 两套 UU API / 信令网关

## 自行部署

### Cloudflare（推荐）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iola1999/uurc-web)

支持 Cloudflare Worker + Durable Object，不依赖 Cloudflare Containers。通过上方按钮可以快速创建自己的部署，也可以在本地执行：

```bash
npm ci
npx wrangler login
npm run deploy:cloudflare
```

部署要求、信任边界和直连说明见 [Cloudflare 部署指南](cloudflare/README.zh-CN.md)。

### Docker

```bash
docker run -d \
  --name uurc-web \
  -p 8787:8787 \
  iola1999/uurc-web:latest
```

或者：

```bash
curl -O https://raw.githubusercontent.com/iola1999/uurc-web/main/compose.yml
docker compose up -d
```

信令 API 会给每个浏览器标签页生成随机会话凭据，隔离不同访问者的进程内信令连接。公网实例还需要 Cloudflare Access、带身份验证的反向代理或其他访问网关。

前端当前固定使用本地代理传输，因此 Wisp 默认关闭。只有测试可选的 WASM curl 传输时，才需要设置 `ENABLE_WISP=true`。

## 安全

账号登录状态保存在当前浏览器中，UU API 请求会经过你正在使用的部署。共享实例的运营方在技术上可以观察其代理的请求。请优先自行部署，公开日志和截图前移除短信验证码、账号凭证、Token、设备 ID、房间信息和网络地址。

完整说明和私下报告方式见 [安全政策](SECURITY.zh-CN.md)。

## 开发

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
docker build -t iola1999/uurc-web:local .
```

## 参与贡献

- [贡献指南](CONTRIBUTING.zh-CN.md)
- [社区行为准则](CODE_OF_CONDUCT.md#社区行为准则)
- [安全政策](SECURITY.zh-CN.md)

## 致谢

Cloudflare 部署架构参考并致谢 [AssppWeb](https://github.com/Lakr233/AssppWeb)，尤其是 Cloudflare 部署入口体验，以及本地网关 / relay 的架构思路。

## 许可证

[MIT](LICENSE)
