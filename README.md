# 小型涵闸数字孪生项目

## Vercel + MySQL 数据库接入

当前目标为 Vercel 托管 Vue 前端和查询 API，Cloudflare 管理域名，独立云 MySQL 保存数据。
初始内容仅为项目已有的 6 条构件映射，维修记录留空，不生成虚构维修历史。

### 接口和数据表

- `GET /api/component/{id}`：返回 `base_info` 与 `maintenance_history`，保持原后端的返回结构。
- `GET /api/health`：同时检查两张表及所需字段是否可查询。就绪返回 200，否则返回 503。
- `Components`：构件 ID、名称、材质、规格。
- `MaintenanceRecords`：构件 ID、维修时间、问题、措施、责任人，按时间倒序显示。
- 当前 API 只提供查询，不开放新增、修改或删除接口。
- 未建档构件返回 404；非法 ID 返回 400；非 GET 请求返回 405；数据库故障返回不含连接详情的 503。

### 初始化真实数据库

选择非中国内地的 MySQL 服务。Aiven 提供无需绑卡的免费 MySQL 方案，额度与可用地域以控制台显示为准：
[免费服务说明](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)。

1. 创建服务并确认方案为 Free，保存主机、端口、数据库名和连接账号，下载 CA 证书。
2. 将 `.env.database.example` 复制为 `.env.database.local`，填写连接信息。
   默认强制 TLS 验证；需要自有 CA 的服务必须提供 `MYSQL_SSL_CA` 或 `MYSQL_SSL_CA_BASE64`。
3. 执行 `npm run db:init`。脚本只创建缺失的表并补充缺失的 6 条构件映射，
   不覆盖已有构件，不添加维修记录，也不删除数据。

初始化需要建表和插入权限。上线时为 API 使用只读数据库账号，只授予两张表的 SELECT 权限；
管理员连接仅用于初始化或导入资料，不交给浏览器。

### Vercel 配置

沿用现有的 `digital-twin-for-small-scale-culvert-gates` 项目，框架为 Vite，
构建命令 `npm run build`，输出目录 `dist`。`api/` 下的两个函数会作为后端部署。

在 Vercel 的服务端 Environment Variables 填写以下值，配置到需要连接数据库的环境：

| 变量 | 内容 |
| --- | --- |
| `MYSQL_HOST` | 数据库服务主机 |
| `MYSQL_PORT` | 数据库端口 |
| `MYSQL_USER` | API 的只读账号 |
| `MYSQL_PASSWORD` | 该账号密码 |
| `MYSQL_DATABASE` | 实际数据库名称 |
| `MYSQL_SSL` | `true` |
| `MYSQL_SSL_CA_BASE64` | CA 证书的 base64 内容，如服务商使用公共可信证书可留空 |

后端以连接池复用连接，每个函数实例最多 3 个连接，并接入 Vercel 的连接池清理机制。
在项目设置中尽量将 Functions Region 选在数据库所在地区附近。
上述 MYSQL 变量不得添加 `VITE_` 前缀，也不要上传 `.env.database.local` 或 CA 文件。

生产构建默认请求同域 `/api/component/{id}`。如果项目中仍有旧的
`VITE_COMPONENT_QUERY_API_BASE_URL` / `VITE_COMPONENT_ID_API_URL` 环境变量，
将查询地址设为 `/api/component` 并移除旧局域网地址，再重新部署。
纯展示模式仍可显式设置 `VITE_COMPONENT_QUERY_API_BASE_URL` 为空后构建。

配置完毕后先部署 Preview，检查 `/api/health` 为 200，再点击模型构件验证返回信息，
通过后再发布 Production。Cloudflare DNS 使用 Vercel 对域名给出的具体记录值。

### 本地运行及重复验收

Node.js 使用 20.19+ 或 22.12+；安装依赖后执行：

```bash
npm ci --no-audit --no-fund
npm run db:init
VITE_COMPONENT_QUERY_API_BASE_URL=/api/component npm run dev:database
```

或者先 `npm run build`，再使用生产前端与同一套 API 进行本地预览：

```bash
node --env-file=.env.database.local node_modules/vite/bin/vite.js preview --host 127.0.0.1
node scripts/verify-api.mjs http://127.0.0.1:4173 deployment/evidence/api-verification.json
```

`verify-api.mjs` 对运行中的 HTTP 服务和真实 MySQL 验证查询、404/400/405、并发访问，
并保存 JSON 验收报告。设置 `EXPECT_DATABASE_UNAVAILABLE=1` 可验证未配置或连接失败场景。
测试使用的维修记录只能放入隔离测试数据库，不得导入正式数据库。

浏览器需验证点击构件后显示数据库基础信息、维修记录为空时的展示，以及查询过程中
切换或清除选择后旧响应不会重新打开已关闭面板。验证截图保存在 `deployment/evidence/`。

以下为此前 ECS 私有预览准备记录；Vercel 上线不需要启用这些 Nginx 配置。

## 阿里云部署准备（纯三维展示）

2026-10-27 确认当前阶段只展示三维模型和构件信息，不接数据库。
部署构建会明确清空两个后端环境变量，避免继承开发环境的局域网接口地址。

### 构建部署包

需要 Node.js 20.19+ 或 22.12+、npm、Python 3。

```bash
npm ci --no-audit --no-fund
bash deployment/scripts/build_release.sh display
```

输出位于 `deployment/releases/<发布编号>.tar.gz`，包括静态文件、Nginx 配置、
验证及停止预览脚本，以及 `SHA256SUMS` 文件校验清单。生成文件已加入忽略规则。

### 在服务器准备私有预览

将部署包上传并解压到 `/srv/smartsluice/releases/`，然后执行：

```bash
bash /srv/smartsluice/releases/<发布编号>/deployment/scripts/prepare_preview.sh
```

预览运行在服务器的 `127.0.0.1:18080`，使用独立的 Nginx 配置和 PID，
不会启用正式站点或修改现有 80/443 站点。服务器重启后需要重新运行预览脚本。
当前前端可选择构件并展示模型属性；`/api/` 明确返回 JSON 503，表示数据服务未配置。

本机建立 SSH 转发后，通过 `http://127.0.0.1:18180/` 预览：

```bash
ssh -N -L 127.0.0.1:18180:127.0.0.1:18080 root@39.106.170.157
```

SSH 密码仅在交互提示中输入，不写入项目或部署包。

### 重复验证及停止预览

```bash
python3 deployment/scripts/verify_http.py http://127.0.0.1:18180 \
  --output deployment/evidence/http-verification.json
```

验证首页、生产 JS/CSS、模型及其二进制、Draco 解码器、健康检查、
不存在的资源返回 404，以及未启用的数据接口返回 JSON 503。
验证报告包括响应状态、资源字节数和 SHA-256，保存在本地；服务器报告位于
`/srv/smartsluice/preview/http-verification.json`。
浏览器另行验证模型渲染、点击构件、清除选择和复位视角。

停止时只退出预览使用的 Nginx：

```bash
bash /srv/smartsluice/releases/<发布编号>/deployment/scripts/stop_preview.sh
```

### 正式切换前仍需完成

- 当前预览未修改域名、阿里云安全组或正式站点。`smartsluice-http.conf` 是待启用的配置。
- 确认服务器地域和 ICP 备案状态；中国内地服务器公开提供网站服务需要完成相应备案。
- 在正式切换时，将 `/srv/smartsluice/current` 指向通过验证的发布目录，
  备份 `/etc/nginx`，安装待启用配置并通过 `nginx -t` 后才 reload。
- Cloudflare 中将 `@` 的 A 记录指向 `39.106.170.157`，将 `www` 的 CNAME 指向 `smartsluice.cn`。
- 核对安全组 80/443、申请并配置 TLS 证书，然后开启 HTTP 到 HTTPS 跳转。
- 上线后需要回退时，恢复前一个 `current` 指向及备份的 Nginx 配置，验证后 reload；
  若恢复原 Vercel 站点，还需恢复切换前的 DNS 记录。正式切换前应保存当时的记录值。

服务器旧文件 `/srv/culvert-api/app.py` 未启用。MySQL 当前只有系统数据库，
没有旧代码要求的 `sluice_db`。将来接数据时需提供真实数据库，
使用专用数据库账号和独立服务，通过同源 `/api/component/{id}` 对接。
`build_release.sh api` 只生成带接口地址的前端，不能代替后端、数据库及 Nginx 代理配置。

参考：[Cloudflare 修改 DNS 记录](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)、
[阿里云备案要求](https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/for-the-record-process-faq)。

## 项目简介

这是一个面向**小型涵闸数字孪生场景**的前端初版项目，目前主要完成了基础框架搭建，用于验证 3D 模型展示与交互功能是否可行。

现阶段项目的重点不是还原完整业务，而是先把数字孪生系统中最基础的可视化能力跑通，包括：

- 3D 场景初始化与渲染
- 模型加载与展示
- 视角旋转、缩放、平移
- 模型部件点击选中
- 选中部件信息显示与高亮反馈

当前主场景加载 `public/models/simple-test.gltf` 简化涵闸模型，用于验证构件选择、统一 ID 和数据库信息展示。后续可进一步接入工程级精细模型和监测数据。

## 当前版本定位

当前项目处于**最初版本 / 原型阶段**，目标是先搭建一个可扩展的数字孪生前端基础框架，为后续接入真实工程模型、监测数据、状态动画和业务面板打基础。

当前版本已实现：

- 基于 Three.js 的 3D 场景搭建
- 基于 GLTF 的模型加载
- 基于 OrbitControls 的交互操作
- 基于 Raycaster 的点击拾取
- 模型部件选中后的高亮与信息展示
- 页面尺寸变化时的自适应渲染
- Vercel 查询 API、MySQL 构件及维修记录查询（需配置真实云数据库连接）

当前版本暂未实现：

- 真实涵闸模型接入
- 闸门开闭状态动画
- 传感器数据联动
- 水位、流量、设备状态等业务信息展示
- 传感器实时通信与远程控制

## 技术栈

- Vue 3
- Vite
- Three.js
- GLTFLoader
- OrbitControls
- JavaScript ES Modules

## 项目结构

```text
Digital_Twin_for_Small-scale_Culvert_Gates/
├─ public/
│  └─ models/                  # 当前用于演示的 GLTF 模型资源
├─ src/
│  ├─ components/
│  │  └─ ThreeScene.vue        # Three.js 场景、模型加载与交互逻辑
│  ├─ styles/
│  │  └─ main.css              # 全局样式
│  ├─ App.vue                  # 页面主界面与信息面板
│  └─ main.js                  # 应用入口
├─ index.html
├─ vite.config.js
├─ package.json
└─ README.md
```

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

启动后默认访问：

```text
http://localhost:3000
```

### 3. 构建生产版本

```bash
npm run build
```

### 4. 预览构建结果

```bash
npm run preview
```

## 后端接入配置

当前版本支持两种后端接入方式，默认优先级如下：

1. 如果配置了 `VITE_COMPONENT_QUERY_API_BASE_URL`，前端会优先使用按构件 ID 查询的接口：

```text
GET {VITE_COMPONENT_QUERY_API_BASE_URL}/{partInfo.id}
```

示例：

```env
VITE_COMPONENT_QUERY_API_BASE_URL=http://172.20.10.14:5000/api/component
```

当点击统一 ID 为 `1` 的构件时，前端会请求：

```text
http://172.20.10.14:5000/api/component/1
```

2. 如果未配置上面的查询接口，但配置了 `VITE_COMPONENT_ID_API_URL`，前端会回退到旧的固定地址同步方式：

```text
POST {VITE_COMPONENT_ID_API_URL}
```

示例：

```env
VITE_COMPONENT_ID_API_URL=http://127.0.0.1:8000/component-id
```

旧接口的请求体会继续保持当前结构：

```json
{
  "ID": "1",
  "commentId": "1",
  "elementId": "12345",
  "uniqueId": "xxxxx-xxxxx",
  "modelName": "Mesh_xxxx",
  "componentName": "闸门",
  "material": "混凝土",
  "position": {
    "x": 1.234,
    "y": 2.345,
    "z": 3.456
  }
}
```

3. 开发环境未配置接口时仅输出 payload。生产构建默认使用同域 `/api/component`；
   若需要纯三维展示，请显式将 `VITE_COMPONENT_QUERY_API_BASE_URL` 设为空后重新构建。

推荐在项目根目录创建 `.env.local`，按需写入以下任意一种配置：

```env
# 新接口，优先使用
VITE_COMPONENT_QUERY_API_BASE_URL=http://172.20.10.14:5000/api/component

# 旧接口，作为兼容方案保留
# VITE_COMPONENT_ID_API_URL=http://127.0.0.1:8000/component-id
```

## 交互说明

- 鼠标左键拖动：旋转视角
- 鼠标滚轮：缩放视角
- 鼠标右键拖动：平移视角
- 点击模型部件：显示当前选中部件的信息，并进行高亮

## 当前实现说明

项目目前已经具备一个数字孪生可视化系统的基础雏形：

- 能够在浏览器中完成 3D 模型加载与显示
- 能够对模型进行基本观察和交互
- 能够识别被点击的模型部件
- 能够通过界面反馈当前选中对象的信息

这意味着项目已经完成了从“静态页面”到“可交互 3D 场景”的第一步，后续可以在这个框架上继续叠加真实业务能力。

## 后续规划

后续可以围绕“小型涵闸数字孪生”继续扩展以下方向：

1. 完善当前简化涵闸模型，接入工程级精细 3D 模型。
2. 增加闸门启闭动画，模拟设备运行过程。
3. 接入水位、流量、闸位、设备状态等监测数据。
4. 增加设备信息面板、告警面板和运行状态面板。
5. 建立模型部件与业务对象之间的映射关系。
6. 对接后端接口，实现实时数据刷新与远程控制展示。

## 示例模型说明

仓库仍保留前期框架验证使用的车辆模型资源；当前主场景已使用简化涵闸模型。历史车辆模型的来源信息如下。

示例模型信息如下：

- 模型名称：`2022 Mercedes-Benz E-Class AMG Line`
- 来源：Sketchfab
- 作者：`tonielpro520`
- 许可协议：`CC-BY-4.0`

如继续公开分发或展示该示例模型，请保留原作者署名信息。详细说明见 [public/models/license.txt](./public/models/license.txt)。

## 项目说明

这个仓库目前更适合作为一个**数字孪生前端原型工程**来看待。它已经验证了 3D 可视化链路和基础交互逻辑，后续只需要在现有结构上逐步替换模型、补充数据、扩展业务界面，就可以继续向“小型涵闸数字孪生系统”演进。
