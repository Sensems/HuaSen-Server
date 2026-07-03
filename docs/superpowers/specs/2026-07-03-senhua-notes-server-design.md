# 森华笔记服务 - 技术设计文档

## 概述

森华笔记是一个个人笔记系统。核心流程：用户通过微信公众号发送消息作为临时笔记，后续在 App 端进行分类、编辑和管理。初期为单用户，后续扩展为多用户。

## 技术栈

| 层面 | 选型 |
|------|------|
| 运行时 | Node.js |
| 框架 | NestJS（Fastify 底层适配器） |
| 语言 | TypeScript |
| 数据库 | PostgreSQL |
| ORM | Prisma |
| 缓存/队列 | Redis + BullMQ |
| 对象存储 | 七牛云 Kodo |
| 认证 | 微信 OAuth + JWT |
| API 风格 | RESTful（仅 GET / POST） |
| 实时通信 | 暂无（Phase 1-3 不做，WebSocket 预留到后续） |

## 整体架构

```
                       ┌──────────────────────────────┐
                       │        NestJS Application      │
                       │         (Fastify adapter)       │
                       │                                 │
 微信公众号 ──► POST     │  ┌─────────────────────────┐  │
 服务器回调        /wechat/callback  │  WechatModule            │  │
                       │  │  - 消息解密 (AES)       │  │
                       │  │  - 类型分发              │  │
                       │  │  - 多媒体→下载→七牛云     │  │
                       │  └───────────┬─────────────┘  │
                       │              │                 │
                       │  ┌───────────▼─────────────┐  │
 App ──► HTTP REST     │  │  NotesModule             │  │
                       │  │  - CRUD + 分类 + 标签    │  │
                       │  │  - 临时笔记→正式笔记      │  │
                       │  └─────────────────────────┘  │
                       │              │                 │
                       │  ┌───────────▼─────────────┐  │
                       │  │  AuthModule              │  │
                       │  │  - 微信OAuth              │  │
                       │  │  - JWT 签发+刷新          │  │
                       │  └─────────────────────────┘  │
                       │              │                 │
                       │  ┌───────────▼─────────────┐  │
                       │  │  StorageModule           │  │
                       │  │  - 七牛云上传Token        │  │
                       │  │  - 上传回调处理           │  │
                       │  │  - 文件删除               │  │
                       │  └───────────┬─────────────┘  │
                       │              │                 │
                       └──────────────┼─────────────────┘
                                      │
                   ┌──────────────────┼──────────────────┐
                   │                  │                  │
              ┌────▼────┐      ┌─────▼─────┐      ┌────▼────┐
              │PostgreSQL│      │ 七牛云 Kodo │      │  Redis  │
              │ (主数据)  │      │ (多媒体)    │      │(+BullMQ)│
              └─────────┘      └───────────┘      └─────────┘
```

### 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `AppModule` | 根模块，注册全局中间件（CORS、Helmet、请求日志） | 所有模块 |
| `AuthModule` | 微信 OAuth、JWT 签发/验证/刷新、Guard | User |
| `WechatModule` | 公众号消息回调、XML 解析/AES 解密、消息类型路由、BullMQ 任务入队 | Storage, Notes |
| `NotesModule` | 笔记 CRUD、临时→正式转换、分类、标签 | Storage |
| `StorageModule` | 七牛云上传 Token 生成、上传回调验证、文件删除 | — |
| `CommonModule` | 全局异常过滤器、响应拦截器、日志、常量、DTO | — |
| `QueueModule` | BullMQ 注册，Worker 处理器 | — |
| `CategoriesModule` | 分类 CRUD、树形管理、排序 | — |
| `TagsModule` | 标签 CRUD、多对多关联 | — |

### 外部依赖

- **PostgreSQL** — 所有业务数据（用户、笔记、分类、标签、设备注册）
- **Redis + BullMQ** — JWT 黑名单/刷新令牌存储，多媒体消息异步处理队列
- **七牛云 Kodo** — 语音/图片/视频/文件存储

### 微信异步处理流程

微信要求 5 秒内响应回调，多媒体消息（下载+上传七牛云）耗时较长，通过 BullMQ 异步处理：

```
微信 POST 消息 → 解密/签名验证 → 入队 → 立即返回 "success"
                                        ↓
                              后台 Worker 逐个处理：
                              下载微信素材 → 上传七牛云 → 创建笔记
```

- 文本消息也入队处理，保持统一的消息处理入口
- 消息去重：`meta.wechat_msg_id` 建唯一索引

## 数据模型

### 实体关系图

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│   User   │1─────*│     Note     │*─────*│   Tag    │
└──────────┘       └──────────────┘       └──────────┘
                         │
                         │1
                         │
                    ┌────┴─────┐
                    │*        │*
              ┌─────┴──┐ ┌───┴──────┐
              │Category│ │NoteMedia │
              └────────┘ └──────────┘
```

### User

```
id            UUID        PK
wx_openid     VARCHAR(64) UNIQUE   微信用户在公众号下的唯一标识
wx_unionid    VARCHAR(64)          微信开放平台统一标识（跨应用，nullable）
nickname      VARCHAR(64)
avatar        VARCHAR(512)         头像 URL
role          ENUM('admin','user') 单用户阶段默认 admin
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

### Note

```
id            UUID          PK
user_id       UUID          FK → User
category_id   UUID          FK → Category (nullable，临时笔记为空)
type          ENUM('draft','published','archived')  临时/正式/归档
source        ENUM('wechat','app_clipboard','app_manual')
title         VARCHAR(256)  自动截取 content 前 100 字符
content       TEXT          文本内容 / 语音识别结果 / 链接描述
raw_content   TEXT          微信原始消息内容（保留回溯）
deleted_at    TIMESTAMP     nullable，软删除标记
meta          JSONB         灵活扩展字段
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

#### meta JSONB 字段说明

```
{
  "wechat_msg_id": "xxx",          // 微信消息 ID（去重）
  "wechat_create_time": 123456,    // 微信侧发送时间
  "link_url": "https://...",       // 链接消息
  "link_desc": "...",              // 链接描述
  "clipboard_device": "iPhone 15"  // 剪贴板来源设备（预留）
}
```

### NoteMedia

```
id            UUID        PK
note_id       UUID        FK → Note
type          ENUM('image','voice','video','file')
qiniu_key     VARCHAR(512)  七牛云对象 Key
qiniu_url     VARCHAR(512)  访问 URL
wx_media_id   VARCHAR(128)  微信临时素材 ID（处理完可废弃）
file_size     INTEGER      字节数
mime_type     VARCHAR(64)
created_at    TIMESTAMP
```

### Category

```
id            UUID        PK
user_id       UUID        FK → User
name          VARCHAR(64)
parent_id     UUID        FK → Category (支持子分类，nullable)
sort_order    INTEGER     排序
created_at    TIMESTAMP
```

### Tag

```
id            UUID        PK
name          VARCHAR(32) UNIQUE
created_at    TIMESTAMP

NoteTag (多对多关联表)
note_id       UUID        FK → Note
tag_id        UUID        FK → Tag
```

### 关键设计决策

- **Note.type 三元状态**：`draft`（公众号消息自动创建）→ `published`（用户分类编辑后）⇄ `archived`（归档，可取消归档回到 published）。未分类的 draft 即临时笔记
- **软删除**：`Note.deleted_at` 字段，查询列表默认过滤已删除笔记（`WHERE deleted_at IS NULL`）。`POST /notes/delete` 设置该字段时间戳
- **title 自动生成**：从 `content` 截取前 100 字符，去除换行后作为默认标题
- **分类排序**：`sort_order` 为同级（相同 `parent_id`）内的排序，全局排序通过树形递归构建
- **meta JSONB**：不同来源（微信/App/剪贴板）笔记字段差异大，JSONB 可按路径建索引，查询性能不输结构化字段
- **NoteMedia 独立表**：一条笔记可关联多张图片等多媒体，一对多关系用独立表而非 JSON 内嵌
- **微信消息去重**：`meta.wechat_msg_id` 建唯一索引，防止微信重试推送产生重复笔记

## API 设计

所有接口仅使用 GET 和 POST 方法。

### 统一响应格式

```typescript
// 成功
{ "code": 0, "data": { ... }, "message": "ok" }

// 分页
{ "code": 0, "data": { "items": [...], "total": 100, "page": 1, "size": 20 } }

// 错误
{ "code": 40001, "message": "笔记不存在", "details": null }
```

除 `/auth/*` 外全部走 JWT Guard，未登录返回 `401`。

### 微信回调

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/wechat/callback` | 微信服务器 Token 验证 |
| `POST` | `/wechat/callback` | 接收消息事件，解密后入 BullMQ 队列，返回 `success` |

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/auth/wechat/qrcode` | 获取微信扫码登录二维码链接 |
| `POST` | `/auth/wechat/callback` | 微信 OAuth 回调，返回 JWT |
| `POST` | `/auth/refresh` | 刷新 access_token（需 refresh_token） |
| `POST` | `/auth/logout` | 登出，token 加入 Redis 黑名单 |

### 笔记

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/notes` | 列表，`?type=&category=&tag=&page=&size=` |
| `GET` | `/notes/detail` | 详情，`?id=` |
| `POST` | `/notes/create` | 手动创建笔记 |
| `POST` | `/notes/update` | 编辑内容/标题/分类/标签，body 含 `id` |
| `POST` | `/notes/delete` | 软删除，body 含 `id` |
| `POST` | `/notes/publish` | draft → published，body 含 `id` |
| `POST` | `/notes/archive` | 归档，body 含 `id` |
| `GET` | `/notes/media` | 笔记关联的多媒体列表，`?note_id=` |

### 分类

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/categories` | 列表（树形返回） |
| `POST` | `/categories/create` | 创建 |
| `POST` | `/categories/update` | 编辑，body 含 `id` |
| `POST` | `/categories/delete` | 删除，关联笔记归到未分类 |
| `POST` | `/categories/reorder` | 拖拽排序 |

### 标签

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/tags` | 列表 |
| `POST` | `/tags/create` | 创建 |
| `POST` | `/tags/delete` | 删除（解绑所有关联笔记） |

### 存储（七牛云）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/storage/upload-token` | 获取七牛云上传 Token（App 直传用） |
| `POST` | `/storage/callback` | 七牛云上传完成回调 |
| `POST` | `/storage/delete` | 删除文件，body 含 `key` |

## 错误码设计

### 错误码分段

| 范围 | 模块 |
|------|------|
| `1xxxx` | 通用（参数校验 10001、未授权 10002、限流 10003、资源不存在 10004） |
| `2xxxx` | 认证（token 过期 20001、微信授权失败 20002、token 无效 20003） |
| `3xxxx` | 笔记（不存在 30001、已删除 30002、类型不允许操作 30003） |
| `4xxxx` | 分类/标签（重复 40001、层级超限 40002） |
| `6xxxx` | 存储（上传失败 60001、文件超限 60002、签名过期 60003） |

### 异常处理

- 全局 `ExceptionFilter` 统一拦截所有异常，输出统一响应格式
- 业务异常使用 `BusinessException` 类，传入错误码
- Fastify Schema 校验失败 → `BadRequestException`，全局过滤器提取校验详情
- 微信回调异常特殊处理：无论发生什么都返回 `success`，异常通过日志告警 + 重试

## 项目目录结构

```
senhua-notes-server/
├── src/
│   ├── main.ts                    # 入口，FastifyAdapter 启动
│   ├── app.module.ts              # 根模块
│   │
│   ├── common/                    # 通用层
│   │   ├── dto/                   # 通用 DTO（分页、ID 等）
│   │   ├── decorators/            # @CurrentUser, @Public 等
│   │   ├── filters/               # 全局异常过滤器
│   │   ├── guards/                # JWT Guard
│   │   ├── interceptors/          # 响应包装、日志
│   │   ├── pipes/                 # 参数校验管道
│   │   ├── enums/                 # 枚举常量
│   │   └── constants/             # 错误码、配置 key
│   │
│   ├── config/                    # 配置模块
│   │   └── configuration.ts       # env 变量类型安全读取
│   │
│   ├── auth/                      # 认证模块
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── dto/
│   │
│   ├── wechat/                    # 微信对接
│   │   ├── wechat.module.ts
│   │   ├── wechat.controller.ts
│   │   ├── wechat.service.ts      # 消息解密/验证
│   │   ├── dto/
│   │   └── types/                 # 微信消息类型定义
│   │
│   ├── notes/                     # 笔记模块
│   │   ├── notes.module.ts
│   │   ├── notes.controller.ts
│   │   ├── notes.service.ts
│   │   └── dto/
│   │
│   ├── categories/                # 分类模块
│   │   ├── categories.module.ts
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   └── dto/
│   │
│   ├── tags/                      # 标签模块
│   │   ├── tags.module.ts
│   │   ├── tags.controller.ts
│   │   ├── tags.service.ts
│   │   └── dto/
│   │
│   ├── storage/                   # 存储（七牛云）
│   │   ├── storage.module.ts
│   │   ├── storage.controller.ts
│   │   ├── storage.service.ts
│   │   └── dto/
│   │
│   └── queue/                     # 任务队列
│       ├── queue.module.ts        # BullMQ 注册
│       └── processors/
│           └── wechat-message.processor.ts
│
├── prisma/
│   └── schema.prisma              # 数据库 Schema
│
├── test/
│   └── ...
│
├── .env.example
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## 分阶段开发计划

### Phase 1：最简可用（MVP）

- 项目骨架搭建（NestJS + Fastify + Prisma + PostgreSQL）
- 配置管理（环境变量，七牛云 SDK 初始化）
- 数据库 Seed：预先创建一个默认用户（固定 UUID），所有笔记关联到此用户
- 微信回调接入（Token 验证 + 消息解密 + 签名校验）
- 文本消息 → 同步处理直接创建临时笔记（draft），暂不引入 BullMQ
- 笔记列表查询、详情、编辑、删除
- 分类/标签 CRUD

Phase 1 **不做**认证，所有 API 无鉴权直接操作默认用户数据。Phase 3 接入认证后替换为 JWT Guard。

**目标**：公众号发文字 → 服务端生成笔记

### Phase 2：多媒体 + 分享

- 引入 BullMQ + Redis，微信多媒体消息异步下载 + 上传七牛云
- 文本消息同步处理升级为统一入队处理
- 临时笔记手动归类/编辑后转正式笔记
- 笔记分享链接生成

### Phase 3：认证 + App 基础

- 微信 OAuth 登录
- JWT 签发/验证/刷新
- App 端笔记 CRUD API 对接

### 后续（暂不排期）

- 剪贴板同步（WebSocket Gateway + 设备管理）
- 跨设备剪贴板历史
- 多用户扩展
