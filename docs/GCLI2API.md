# 在 peachcat.fun/gcli2api 部署 gcli2api

[gcli2api](https://github.com/su-kaka/gcli2api) 是一个把 Gemini / Antigravity
封装成 OpenAI、Gemini、Anthropic 三种兼容接口的服务，自带一个 Web 控制面板。
它原本只支持部署在域名根路径，本文档记录如何把它挂到 `peachcat.fun/gcli2api`。

---

## 一、最终拓扑

```
Cloudflare Tunnel (peachcat.fun)
            │
            ▼
  peachcade-gateway  (nginx, 监听 0.0.0.0:3000)
     ├── /gcli2api/  ──►  gcli2api:7861   (FastAPI，剥离前缀)
     └── /           ──►  pixelplay:3000  (Peachcade 游戏站)
```

- 隧道目标仍然是 `localhost:3000`，**Cloudflare 侧无需任何改动**。
- 两个业务容器都只在内网 `edge` 网络暴露，宿主机不再直接发布 3000 以外的端口。
- 游戏站额外映射 `127.0.0.1:3001`，仅用于本机排障。

---

## 二、服务器上的文件

```
/home/ubuntu/pixelplay/          Peachcade（docker-compose.yml 已改为 3001 + edge 网络）
/home/ubuntu/gcli2api/
  ├── docker-compose.yml
  ├── .env                       PASSWORD / PORT / HOST / LOG_LEVEL（chmod 600）
  └── data/creds/                凭证与 SQLite（挂载到 /app/creds）
/home/ubuntu/gateway/
  ├── docker-compose.yml         nginx:1.27-alpine
  └── nginx.conf                 子路径路由 + 登录限流 + noindex
```

`edge` 网络是外部网络，首次部署需手动创建一次：

```bash
docker network create edge
```

---

## 三、子路径是怎么实现的

gcli2api 的路由全部挂在根路径（`prefix=""`），自身不支持 `ROOT_PATH`。
它之所以能挂在 `/gcli2api`，依赖两点：

1. **前端用相对路径**：面板 HTML 里是 `./front/common.js`，`common.js` 里是
   `./creds/status`、`./auth/start` 这类相对请求。浏览器在 `/gcli2api/` 下解析后
   自然带上前缀。
2. **nginx 剥前缀**：`proxy_pass http://gcli2api:7861/;`（结尾有斜杠）会把
   `/gcli2api/creds/status` 转发成 `/creds/status`。

因此**必须带尾斜杠访问**：`/gcli2api` 会 301 到 `/gcli2api/`，否则相对资源会
解析成 `peachcat.fun/front/...` 而 404。

---

## 四、安全设置

| 项 | 值 | 说明 |
|---|---|---|
| 面板密码 | 见 `/home/ubuntu/gcli2api/.env` 的 `PASSWORD` | 28 位随机串，未写入本仓库 |
| 搜索引擎 | `X-Robots-Tag: noindex, nofollow` | 面板不属于游戏站内容，避免被索引 |
| 登录限流 | `10r/m`，burst 5 | 第 7 次连续尝试开始返回 429 |
| API 限流 | `30r/s`，burst 60 | 防止脚本刷接口 |
| 端口暴露 | 仅 `0.0.0.0:3000` | 7861 / 3001 只在容器网络与回环 |

---

## 五、常用运维命令

```bash
# 状态
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
cd /home/ubuntu/gateway && docker compose exec -T gateway nginx -t

# 更新 gcli2api
cd /home/ubuntu/gcli2api
docker compose pull && docker compose up -d

# 看日志
docker logs -f --tail 100 gcli2api

# 改面板密码
vim /home/ubuntu/gcli2api/.env      # 修改 PASSWORD
cd /home/ubuntu/gcli2api && docker compose up -d
```

### 接口地址

| 用途 | 地址 |
|---|---|
| 控制面板 | `https://peachcat.fun/gcli2api/` |
| OpenAI 兼容 | `https://peachcat.fun/gcli2api/v1/chat/completions` |
| 模型列表 | `https://peachcat.fun/gcli2api/v1/models` |
| Gemini 原生 | `https://peachcat.fun/gcli2api/v1beta/...`（以面板文档为准） |

请求头：`Authorization: Bearer <面板密码>`。

---

## 六、回滚

如果网关出问题，把入口交还给游戏站即可（约 15 秒）：

```bash
cd /home/ubuntu/gateway && docker compose down
cd /home/ubuntu/pixelplay
cp docker-compose.yml.bak docker-compose.yml   # 备份文件为改动前的版本
docker compose up -d
```

备份文件 `docker-compose.yml.bak` 就是切换到网关之前的配置（`3000:3000`，无 edge 网络）。

---

## 七、已知限制

- **OAuth 回调**：gcli2api 在容器内随机端口起回调服务，公网无法直接访问。
  使用面板里的「粘贴回调 URL」方式完成授权即可（浏览器地址栏里的
  `http://localhost:xxxx/...` 整段复制回面板）。
- **WebSocket**：当前没有用到，nginx 未开启 Upgrade 透传；若后续需要，在
  `/gcli2api/` 的 location 里补 `proxy_set_header Upgrade` / `Connection` 与
  `proxy_http_version 1.1`。
- **SSE 流式输出**：已设置 `proxy_buffering off`，流式响应不会被缓冲。
