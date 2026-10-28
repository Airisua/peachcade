# Peachcade 部署文档

本文档面向把 Peachcade 部署到服务器的场景，推荐使用 Docker 一键部署。

> 生产环境当前是「nginx 网关 + 两个容器」的结构：网关占用 3000 端口（Cloudflare
> Tunnel 的目标），游戏站以 `127.0.0.1:3001` 映射并加入 `edge` 网络，同一域名下的
> `/gcli2api` 由网关分发。首次部署前需执行 `docker network create edge`。
> 详见 [GCLI2API.md](./GCLI2API.md)。

## 1. 服务器准备

- 一台可访问外网的 Linux 服务器（Ubuntu/Debian/CentOS 均可），已安装 Docker 与 Docker Compose 插件。
- 开放 80/443 端口（HTTPS 反代）与 3000 端口（或仅本机访问，由反代转发）。
- 一个域名（可选，用于 HTTPS）。

安装 Docker（Ubuntu 示例）：

    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER   # 重新登录生效

验证：

    docker --version
    docker compose version

## 2. 一键部署

把项目上传到服务器（git clone 或 scp 整个目录），在项目根目录执行：

    cp .env.example .env
    # 编辑 .env：至少修改 JWT_SECRET 与 ADMIN_PASSWORD
    docker compose up -d --build

首次构建会拉取 node:24-slim 并安装依赖，视网络约 1-5 分钟。

验证：

    curl http://127.0.0.1:3000/healthz        # 应返回 {"ok":true,...}
    docker compose ps                          # 状态应为 running/healthy

浏览器访问 http://服务器IP:3000 。默认管理员 mqx / mqx331606110（由 .env 决定，
首次启动建库时写入；请务必在 .env 中改成强密码后再首次启动）。

提示：初始管理员账号只在数据库为空时创建。若先启动过再改 .env，需要删除
./data/app.db 后重启（会重置数据），或在登录后到后台修改密码。

## 3. HTTPS 反向代理

### Nginx 示例

    server {
      listen 80;
      server_name game.example.com;
      location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }
    }

用 certbot 申请证书：sudo certbot --nginx -d game.example.com

### Caddy 示例（自动 HTTPS）

    game.example.com {
      reverse_proxy 127.0.0.1:3000
    }

应用已开启 trust proxy，反代后仍能正确读取客户端 IP（限流 / 日志）。

## 4. 备份与恢复

需要备份两处（docker compose 已把它们挂载到宿主机）：

- ./data          -> SQLite 数据库（app.db，含 WAL 文件）
- ./public/uploads -> 后台上传的缩略图

备份示例：

    tar czf pixelplay-backup-$(date +%F).tar.gz data public/uploads

恢复：停止容器（docker compose down），解压覆盖这两个目录，再启动。

## 5. 升级流程

    git pull            # 或上传新代码
    docker compose up -d --build
    docker compose logs -f --tail=100

数据库结构为自动建表 + 幂等种子，直接升级不会清空数据。

## 6. 常用运维命令

    docker compose logs -f            # 查看日志
    docker compose restart            # 重启
    docker compose down               # 停止并删除容器（数据保留在 ./data）
    docker compose up -d --build      # 重建并启动

## 7. 常见问题

- 国内服务器拉取基础镜像缓慢或失败：给 Docker 配置镜像加速（例如使用
  docker.m.daocloud.io 等镜像源），或为 Docker Desktop / 服务器 Docker
  配置 HTTP(S) 代理。better-sqlite3 在无法下载预编译二进制时会自动本地编译
  （Dockerfile 的构建阶段已内置 python3 / make / g++，构建完成后不会留在最终镜像里）。
- 端口被占用：修改 docker-compose.yml 的 ports（如 "8080:3000"）或释放 3000 端口。
- 500 错误：docker compose logs 查看堆栈；确认 ./data、./public/uploads 目录可写。
- 忘记管理员密码：删除 ./data/app.db 后重启会用 .env 中的 ADMIN_PASSWORD 重建
  （会清空全部数据）；或事先用另一个管理员账号在后台重置。
- 想彻底重置：docker compose down && rm -rf data/app.db* public/uploads/* && docker compose up -d
- 中文 / 英文内容：站点默认英文；点击页头右上角 EN/中文 切换。后台双语文案可随时编辑。
- 广告不显示：确认 /wyj/settings 中 ads_enabled 已开启，且对应广告位有启用的广告
  （未配置的广告位现在整段不输出，不会留占位框，见 `views/partials/ad.ejs`）。

## 8. 网关容器（Cloudflare Tunnel 拓扑）

生产环境用 `peachcade-gateway`（nginx:1.27-alpine）占用宿主机 3000 端口，作为
Cloudflare Tunnel 的唯一源站；配置文件是 `/home/ubuntu/gateway/nginx.conf`，
仓库内的副本是 `deploy/gateway/nginx.conf`（改完记得同步到服务器）。

一条必须记住的规则：**上游用变量 + Docker DNS 解析**。

    resolver 127.0.0.11 valid=10s ipv6=off;   # server 块内

    location / {
        set $app_upstream pixelplay:3000;
        proxy_pass http://$app_upstream;      # 不再写死 http://pixelplay:3000
    }

原因：nginx 默认只在启动时解析一次 `proxy_pass` 里的主机名。这带来两个生产事故：

1. `docker compose up -d --build` 重建游戏站后容器 IP 变了，nginx 仍打旧 IP → 全站 502，
   必须重启网关才恢复；
2. 某个可选上游（如 `gcli2api`）被停掉后，网关**直接启动失败**
   （`host not found in upstream "gcli2api"`），整站跟着挂——2026-10-22 就这样发生过一次。

改成变量后，解析推迟到每次请求，`valid=10s` 让新 IP 在 10 秒内生效；停掉的上游只影响
它自己的 location（返回 502），游戏站照常。

改完后的验证：

    docker run --rm -v /home/ubuntu/gateway/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t
    docker restart peachcade-gateway
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/

### 8.1 cloudflared（隧道客户端）

隧道由宿主机上的 systemd 服务跑，二进制在 `/usr/bin/cloudflared`
（`/usr/local/bin/cloudflared` 是指向它的软链），启动参数来自
`/etc/cloudflared/token`。

**这台机器没有配置 Cloudflare 的 apt 源**，`apt upgrade` 不会带上它，需要手动升：

    curl -L -o /tmp/cloudflared.deb \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo cp -a /usr/bin/cloudflared /root/cloudflared-$(cloudflared --version | awk '{print $3}').bak
    sudo dpkg -i /tmp/cloudflared.deb
    sudo systemctl restart cloudflared
    systemctl is-active cloudflared                       # active
    sudo journalctl -u cloudflared -n 20 --no-pager | grep "Registered tunnel connection"
    curl -s -o /dev/null -w '%{http_code}\n' https://peachcat.fun/

重启会断几条连接，Cloudflare 会在几秒内重新注册（正常看到 4 条
`Registered tunnel connection`）。回滚：把 `/root` 下的备份拷回
`/usr/bin/cloudflared` 再 restart。

2026-10-28 已从 2026.10.0 升到 **2026.10.5**（Cloudflare 公告：2026.10.2 以下
仍信任已泄露私钥的 eMudhra 中间证书）。
