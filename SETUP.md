# 森华笔记服务 - 部署运行指南

## 环境要求

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | >= 18 | 运行时 |
| PostgreSQL | >= 14 | 主数据库 |
| Redis | >= 6 | 消息队列（BullMQ）+ 缓存 |
| 微信公众号 | 已认证订阅号 | 消息接收入口 |

## 一、安装 PostgreSQL

### Windows（推荐）

1. 下载安装器：https://www.postgresql.org/download/windows/
2. 安装时记住设置的**端口**（默认 5432）、**超级用户密码**
3. 安装完成后打开 **pgAdmin** 或命令行创建数据库：

```sql
-- 使用 psql 或 pgAdmin 执行
CREATE DATABASE senhua_notes;
```

### 验证安装

```bash
psql -U postgres -d senhua_notes -c "SELECT 1;"
# 输出 1 即成功
```

---

## 二、安装 Redis

### Windows

1. 下载 Redis for Windows：https://github.com/tporadowski/redis/releases
2. 下载 `.msi` 安装包并安装
3. 安装后 Redis 会作为 Windows 服务自动启动

### 验证安装

```bash
redis-cli ping
# 输出 PONG 即成功
```

---

## 三、配置环境变量

编辑项目根目录的 `.env` 文件（复制 `.env.example`）：

```ini
# 服务端口
PORT=3000

# PostgreSQL 数据库连接（替换为你的实际信息）
# 格式: postgresql://用户名:密码@主机:端口/数据库名?schema=public
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/senhua_notes?schema=public

# Redis 连接
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 微信公众平台配置（在 https://mp.weixin.qq.com 获取）
WECHAT_TOKEN=         # 公众号 → 开发 → 基本配置 → 服务器配置 → Token
WECHAT_APP_ID=        # 公众号 → 开发 → 基本配置 → 开发者ID(AppID)
WECHAT_APP_SECRET=    # 公众号 → 开发 → 基本配置 → 开发者密码(AppSecret)
WECHAT_ENCODING_AES_KEY=  # 公众号 → 开发 → 基本配置 → 服务器配置 → EncodingAESKey

# JWT 密钥（随机字符串，可以自己生成）
JWT_SECRET=your_jwt_secret_change_me
JWT_REFRESH_SECRET=your_refresh_secret_change_me

# 七牛云配置（Phase 2 使用，Phase 1 可留空）
QINIU_ACCESS_KEY=
QINIU_SECRET_KEY=
QINIU_BUCKET=
QINIU_DOMAIN=
```

> 生成随机密钥：在终端执行 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 四、初始化数据库

```bash
# 1. 安装依赖（首次执行）
npm install

# 2. 生成 Prisma Client
npx prisma generate

# 3. 创建数据库表结构
npx prisma migrate dev --name init

# 4. 插入默认用户数据
npx prisma db seed

# 5. 创建微信消息去重索引（可选，但建议执行）
# 连接数据库后执行以下 SQL：
```

```sql
-- 连接 PostgreSQL 后执行
-- psql -U postgres -d senhua_notes
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_wechat_msg_id_unique
  ON notes ((meta->>'wechat_msg_id'))
  WHERE meta->>'wechat_msg_id' IS NOT NULL
    AND deleted_at IS NULL;
```

---

## 五、构建并启动

```bash
# 构建项目
npx tsc --project tsconfig.build.json

# 启动服务
node dist/main.js
```

启动成功后会看到：
```
[Nest] xxx  - LOG [NestApplication] Nest application successfully started
Application is running on: http://0.0.0.0:3000
```

### 开发模式（文件变更自动重启）：

```bash
npx tsc --project tsconfig.build.json --watch   # 终端 1：监听编译
node --watch dist/main.js                        # 终端 2：监听运行（Node 22+）
```

---

## 六、配置微信公众号服务器

1. 登录 https://mp.weixin.qq.com
2. 进入 **开发 → 基本配置**
3. 点击 **服务器配置 → 修改配置**
4. 填写：
   - **URL**: `https://你的域名/wechat/callback`（必须是公网可访问的 HTTPS 地址）
   - **Token**: 与 `.env` 中 `WECHAT_TOKEN` 一致
   - **EncodingAESKey**: 与 `.env` 中 `WECHAT_ENCODING_AES_KEY` 一致
   - 消息加解密方式：**安全模式**
5. 点击提交，微信会发送 GET 请求验证服务器
6. 验证通过后，用户给公众号发消息即可自动创建笔记

> 本地开发可使用 [ngrok](https://ngrok.com/) 将 localhost:3000 暴露为公网 HTTPS：
> ```bash
> ngrok http 3000
> ```

---

## 七、验证 API

```bash
# 1. 健康检查 - 应该返回 401（需要认证）
curl http://localhost:3000/notes

# 2. 微信 OAuth 登录（需要先在微信开放平台配置）
# POST /auth/wechat/callback  body: { "code": "微信授权code" }

# 3. 使用 JWT Token 访问受保护接口
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/notes
```

### 所有 API 端点

| 方法 | 路径 | 需要认证 | 说明 |
|------|------|---------|------|
| `GET` | `/notes` | ✅ | 笔记列表 |
| `GET` | `/notes/detail?id=` | ✅ | 笔记详情 |
| `POST` | `/notes/create` | ✅ | 创建笔记 |
| `POST` | `/notes/update` | ✅ | 更新笔记 |
| `POST` | `/notes/delete` | ✅ | 删除笔记 |
| `POST` | `/notes/publish` | ✅ | 发布笔记 |
| `POST` | `/notes/archive` | ✅ | 归档/取消归档 |
| `GET` | `/notes/media?note_id=` | ✅ | 笔记多媒体 |
| `GET` | `/notes/share?id=` | ✅ | 分享链接 |
| `GET` | `/categories` | ✅ | 分类列表 |
| `POST` | `/categories/create` | ✅ | 创建分类 |
| `POST` | `/categories/update` | ✅ | 更新分类 |
| `POST` | `/categories/delete` | ✅ | 删除分类 |
| `POST` | `/categories/reorder` | ✅ | 拖拽排序 |
| `GET` | `/tags` | ✅ | 标签列表 |
| `POST` | `/tags/create` | ✅ | 创建标签 |
| `POST` | `/tags/delete` | ✅ | 删除标签 |
| `GET` | `/storage/upload-token` | ✅ | 七牛云上传 Token |
| `POST` | `/storage/delete` | ✅ | 删除文件 |
| `GET` | `/wechat/callback` | ❌ | 微信服务器验证 |
| `POST` | `/wechat/callback` | ❌ | 接收微信消息 |
| `POST` | `/auth/wechat/callback` | ❌ | 微信 OAuth 登录 |
| `POST` | `/auth/refresh` | ❌ | 刷新 Token |
| `POST` | `/auth/logout` | ✅ | 登出 |

---

## 八、常见问题

### 编译失败
```bash
# 删除构建缓存重试
rm -rf dist tsconfig.build.tsbuildinfo
npx tsc --project tsconfig.build.json
```

### 数据库连接失败
- 确认 PostgreSQL 服务已启动
- 检查 `.env` 中 `DATABASE_URL` 格式正确
- 确认用户名、密码、数据库名正确

### Redis 连接失败
- 确认 Redis 服务已启动：`redis-cli ping` 应返回 `PONG`
- 检查 `.env` 中 `REDIS_HOST` 和 `REDIS_PORT`

### 微信验证失败
- 确认 URL 是公网可访问的 HTTPS 地址
- 确认 Token 和 EncodingAESKey 与 `.env` 配置一致
- 检查服务器日志是否有报错
