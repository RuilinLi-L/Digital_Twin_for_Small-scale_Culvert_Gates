# 涵闸智维 · Vercel 独立部署版

此目录使用最新 Next.js 三维界面，检修记录保存到 Vercel 专用 PostgreSQL。相邻的 hanzha-aliyun 目录继续使用自己的 JSON 数据卷，两份部署不共享检修记录。

6 个构件档案与三维示意模型随源码发布，数据库初始检修记录为空。页面原有两条“演示样例”仍明确标注，不写入数据库。

## 本机运行

使用 Node.js 22：

```bash
npm ci
cp .env.example .env.local
# 在 .env.local 中配置独立数据库的连接串。
npm run db:init
npm run typecheck
npm run build
npm run dev
```

建表脚本自动加载项目根目录 .env.local，进程已有环境变量优先。它只创建 public.hanzha_repair_records 表及索引，重复执行保留已有记录。

| 环境变量 | 用途 |
| --- | --- |
| DATABASE_URL | 应用连接串，Neon 使用 pooled 地址 |
| DATABASE_URL_UNPOOLED | 可选，建表优先使用此直连地址 |
| HANZHA_DB_SSL | 默认 verify-full；仅本机开发允许显式设为 disable |

连接串保存在服务端环境变量中，生产连接验证 TLS 证书与主机名。缺少数据库配置时构建仍能完成，记录接口返回 503，不回退到临时文件或本地 JSON。

## Vercel 发布

1. 将此目录作为 Next.js 项目根目录。若使用原 GitHub 仓库的独立部署分支，选择该分支；旧 Vue 分支仍是 Vite 应用。
2. 新建独立 Vercel 项目，Framework 选择 Next.js，Node.js 选择 22.x，安装命令 npm ci，构建命令 npm run build，输出目录采用框架默认值。
3. 在 Vercel Marketplace 添加 Neon，选择套餐和地域并连接新项目。集成会注入 DATABASE_URL 等变量；Production 和 Preview 环境按用途分别连接。
4. 将目标环境变量下载到本机 .env.local，运行 npm run db:init 建表，数据库凭据不进入 Git。
5. 发布后运行下面的只读验收，并在浏览器检查三维模型、构件选择、记录加载和扫码网址。

应用的 /api/records 与页面使用同一域名。Vercel 直接构建 Next.js 源码，无需上传 ECS 的 Docker 数据卷或 Nginx 配置。

官方参考：[Next.js 部署](https://vercel.com/docs/frameworks/full-stack/nextjs)、[Marketplace 数据库](https://vercel.com/docs/marketplace-storage)、[Neon](https://vercel.com/marketplace/neon)。

## 端到端验收

公开部署默认只读：

```bash
python3 deploy/verify-vercel.py --base-url https://YOUR-PROJECT.vercel.app \
  --output .deployment/evidence/vercel-read.json
```

专用测试库写入和并发验收：

```bash
python3 deploy/verify-vercel.py --base-url http://127.0.0.1:3000 \
  --write-test --phase seed --manifest .deployment/evidence/test-manifest.json \
  --output .deployment/evidence/postgres-seed.json
```

保持同一测试数据库，重启或重新构建应用后验证持久化：

```bash
python3 deploy/verify-vercel.py --base-url http://127.0.0.1:3000 \
  --phase check --manifest .deployment/evidence/test-manifest.json \
  --output .deployment/evidence/postgres-after-restart.json
```

--write-test 仅用于专用测试库，生成 9 条带唯一标记的样例。脚本输出可重复核对的 JSON 报告，不删除数据。缺少或错误数据库配置的测试实例可加 --expect-unavailable 验证 503 响应。

当前接口允许访客提交和查看演示记录，页面演示说明继续保留。正式工程应用可另行接入身份认证和权限。
