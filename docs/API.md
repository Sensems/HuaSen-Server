# 花森笔记 · 服务端接口文档

> 基于当前代码整理（NestJS + Fastify）。交互式文档：启动服务后访问 `/api/docs`（Swagger）。

---

## 1. 功能总览

花森笔记是**微信公众号驱动的个人笔记系统**：用户给公众号发消息 → 服务端异步创建笔记；App 端通过 JWT 管理笔记、分类、标签、媒体与账号绑定。

| 模块 | 能力 |
|------|------|
| **认证** | 微信 OAuth / 邮箱注册登录 / 验证码重置密码 / JWT 刷新与登出 |
| **用户** | 资料查询与更新、微信空壳 ↔ App 账号绑定 |
| **微信** | 公众号服务器校验、消息接收 → 入队创建笔记；文本绑定码同步合并账号 |
| **笔记** | CRUD、发布/归档、置顶、列表筛选、分享信息、关联媒体 |
| **分类** | 最多 3 层树形结构、拖拽排序、删除时解绑笔记 |
| **标签** | 全局标签列表、同名复用创建、删除 |
| **存储** | 七牛云直传 Token、服务端 multipart 上传并建 Media、删文件 |
| **媒体** | 批量校验媒体归属与 PENDING 状态 |
| **队列管理** | BullMQ 状态查询、失败重试/清理、暂停/恢复（运维用） |

### 核心业务流

```
微信发消息 → POST /wechat/callback
  ├─ 文本为 6 位绑定码 → 同步绑定 App 账号，被动回复结果
  └─ 其他消息 → BullMQ 异步：下载媒体 → 七牛云 → 创建笔记 → 客服消息确认

App 邮箱注册 → 拿到 bindingCode
  ├─ App：输入微信空壳码 → POST /user/bind
  └─ 微信：发送 App 绑定码 → 回调内同步绑定
```

---

## 2. 通用约定

### 请求方法

仅使用 **GET**（读）和 **POST**（写）。写操作路径以动作结尾，如 `/create`、`/update`、`/delete`。

### 认证

| 类型 | 说明 |
|------|------|
| **需登录** | Header：`Authorization: Bearer <accessToken>` |
| **公开** | 路由标 `@Public()`：`/auth/*`（除 logout）、`/wechat/*`、`/admin/queues/*` |

- `accessToken` 有效期约 **2 小时**
- `refreshToken` 有效期约 **7 天**
- 登出后 accessToken 进入内存黑名单

### 统一响应

成功与业务错误均返回 HTTP 200，用 `code` 区分：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

| code | 含义 |
|------|------|
| `0` | 成功 |
| `1xxxx` | 通用（参数错误、未授权、限流、不存在） |
| `2xxxx` | 认证 / 邮箱 / 绑定码 |
| `3xxxx` | 笔记 |
| `4xxxx` | 分类 |
| `5xxxx` | 媒体 |
| `6xxxx` | 存储 |

常用错误码：

| code | 说明 |
|------|------|
| 10001 | 请求参数有误 |
| 10002 | 未登录或登录已过期 |
| 10003 | 请求过于频繁 |
| 20010 | 该邮箱已注册 |
| 20011 | 该邮箱未注册 |
| 20012 | 验证码错误 |
| 20013 | 验证码已过期 |
| 20014 | 密码错误 |
| 20016 | 绑定码无效 |
| 30001 | 笔记不存在 |
| 30003 | 不允许的操作（如草稿不可归档） |
| 40002 | 分类层级超过限制（最多 3 层） |

> **例外**：`/wechat/*` 不返回上述 JSON，须返回纯文本 / XML（微信协议）。

### Base URL

本地默认：`http://localhost:3000`

---

## 3. 认证 ` /auth`

### `POST /auth/wechat/callback` · 公开

用微信授权 `code` 换取 JWT（OAuth 登录）。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 微信授权回调 code |

**返回 `data`**：`{ accessToken, refreshToken, expiresIn }`

---

### `POST /auth/email/send-code` · 公开 · 限流 1 次/分钟

发送邮箱验证码。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| purpose | string | 是 | `register` \| `reset_password` |

**行为要点**

- `register`：邮箱已注册 → `EMAIL_ALREADY_REGISTERED`
- `reset_password`：邮箱未注册 → `EMAIL_NOT_FOUND`

---

### `POST /auth/email/register` · 公开

邮箱注册。成功后 `data` 为 `null`，需再调用登录接口获取 JWT。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| password | string | 是 | ≥8 位，须含字母和数字 |
| code | string | 是 | 6 位验证码 |

**返回 `data`**：`null`

---

### `POST /auth/email/login` · 公开

邮箱密码登录。

**Body**：`email`、`password`

**返回 `data`**：`{ accessToken, refreshToken, expiresIn }`

---

### `POST /auth/email/reset-password` · 公开

用验证码重置密码。成功只返回提示，**不签发 JWT**。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| password | string | 是 | 新密码（规则同注册） |
| code | string | 是 | 6 位验证码 |

未知邮箱 → `EMAIL_NOT_FOUND`

---

### `POST /auth/refresh` · 公开

用 `refreshToken` 换新的 access / refresh。

**Body**：`{ refreshToken }`

---

### `POST /auth/logout` · 需登录

将当前 `accessToken` 加入黑名单。

---

## 4. 用户 `/user` · 均需登录

### `GET /user/profile`

获取当前用户资料。

**返回 `data` 示例**

```json
{
  "id": "...",
  "nickname": "花森",
  "avatar": "https://...",
  "email": "user@example.com",
  "bindingCode": "ABC234",
  "wxBound": false
}
```

| 字段 | 说明 |
|------|------|
| bindingCode | 6 位绑定码；App 用户可将此码发到公众号完成绑定 |
| wxBound | 是否已绑定微信 |

---

### `POST /user/update`

更新昵称和/或头像。至少提供一项。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 最长 64 |
| avatar | string | 否 | 完整 URL |

---

### `POST /user/bind`

App 端输入**微信空壳绑定码**，将公众号侧空壳账号合并到当前登录用户（迁移笔记/媒体）。

**Body**：`{ bindingCode }`（6 位）

**返回 `data`**：`{ wxBound, syncedDraftCount, overwritten, message }`

---

## 5. 微信 `/wechat` · 公开（微信服务器回调）

> 返回值不是业务 JSON，而是微信要求的文本 / XML。

### `GET /wechat/callback`

公众号服务器配置时的 Token 校验。校验通过则原样返回 `echostr`。

**Query**：`signature`、`timestamp`、`nonce`、`echostr`

---

### `POST /wechat/callback`

接收用户消息/事件：解密 → 识别用户 →（绑定码则同步绑定）→ 否则入队创建笔记 → 返回加密被动回复 XML。

异常时降级返回纯文本 `success`，避免微信重试风暴。

---

## 6. 笔记 `/notes` · 均需登录

### 状态机

```
DRAFT ──publish──→ PUBLISHED ←──archive(toggle)──→ ARCHIVED
```

- 草稿只能发布，不能归档
- 删除为软删除（`deletedAt`），不改变 `type`
- 置顶只走 `/notes/pin`，不要通过 update 写 `pinnedAt`

### `GET /notes`

分页列表 + 筛选。

**Query**

| 字段 | 说明 |
|------|------|
| page | 页码，默认 1 |
| size | 每页条数，默认 20，最大 100 |
| type | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` |
| category | 分类 ID |
| tag | 标签 ID |
| keyword | 标题/正文模糊搜索 |
| mediaType | `IMAGE` \| `VOICE` \| `VIDEO` \| `FILE` \| `TEXT` |
| view | `pinned`=仅置顶；`recent`=按创建时间；不传=置顶优先再按创建时间 |

> 微信纯文本笔记会关联 `type=TEXT` 的占位 Media（`qiniuUrl` 可为空串，正文在 `Note.content`）。

**返回 `data`**：`{ items, total, page, size }`  
每条 `items[]` 含展平后的 `media`（与详情字段一致；排除 TEXT 占位，纯文本笔记多为 `media: []`）。

---

### `GET /notes/detail?id=`

笔记详情（含分类、标签、媒体）。

---

### `POST /notes/create`

创建笔记（默认草稿）。

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 空则从正文截前 100 字 |
| content | string | 否 | 正文 |
| source | string | 否 | `WECHAT` \| `APP_CLIPBOARD` \| `APP_MANUAL` |
| categoryId | string | 否 | 分类 |
| tagIds | string[] | 否 | 标签 ID |
| mediaIds | UUID[] | 否 | 已上传且 PENDING 的媒体 |

---

### `POST /notes/update`

更新标题、正文、分类、标签、媒体关联。

**Body**：必填 `id`；其余字段可选。`tagIds` 传空数组可清空标签。

---

### `POST /notes/delete`

软删除。**Body**：`{ id }`

---

### `POST /notes/publish`

草稿 → 已发布。**Body**：`{ id }`

---

### `POST /notes/archive`

已发布 ↔ 归档 切换。**Body**：`{ id }`

---

### `POST /notes/pin`

置顶 / 取消置顶（toggle `pinnedAt`）。**Body**：`{ id }`

---

### `GET /notes/media?note_id=`

该笔记关联的媒体列表。

---

### `GET /notes/share?id=`

分享用精简信息：`{ id, title, type, shareUrl }`

---

## 7. 分类 `/categories` · 均需登录

最多 **3 层**树；同级按 `sortOrder`；删除会递归删子孙，并将关联笔记的 `categoryId` 置空（不删笔记）。

### `GET /categories`

返回树形列表（含 `children`）。

---

### `POST /categories/create`

**Body**：`{ name, parentId? }`（顶级 `parentId` 可省略/null）

---

### `POST /categories/update`

**Body**：`{ id, name?, parentId? }`

---

### `POST /categories/delete`

**Body**：`{ id }`

---

### `POST /categories/reorder`

拖拽后批量更新父子关系与顺序。

**Body**

```json
{
  "items": [
    { "id": "uuid1", "parentId": null },
    { "id": "uuid2", "parentId": "uuid1" }
  ]
}
```

---

## 8. 标签 `/tags` · 均需登录

标签**全局共享**（无用户隔离）。创建同名会复用已有标签。

### `GET /tags`

全站标签列表（含关联笔记数量）。

---

### `POST /tags/create`

**Body**：`{ name }`（最长 32）

---

### `POST /tags/delete`

解绑所有笔记关联后删除。**Body**：`{ id }`

---

## 9. 存储 `/storage` · 均需登录

### `GET /storage/upload-token?key=`

获取七牛云直传 Token（约 1 小时）。`key` 可选；不传则 scope 为整个 bucket。

**返回 `data`**：`{ token }`

---

### `POST /storage/upload`

服务端中转上传（`multipart/form-data`），并创建 `PENDING` 媒体记录。

| 字段 | 说明 |
|------|------|
| file | 文件（必填） |
| type | 可选：`IMAGE` \| `VOICE` \| `VIDEO` \| `FILE`；不传则按 MIME 推断 |

**返回**：含 `mediaId`、七牛 key/url、大小、MIME、`originalFilename`（multipart 原始文件名，可空）等

---

### `POST /storage/delete`

按七牛 key 删除文件。**Body**：`{ key }` → `{ success: boolean }`

---

## 10. 媒体 `/media` · 需登录

### `POST /media/check`

创建/更新笔记前，批量校验媒体是否属于当前用户且为 PENDING。

**Body**：`{ mediaIds: string[] }`

**返回**：`{ valid: string[], invalid: string[] }`

---

## 11. 队列管理 `/admin/queues` · 公开（运维）

> 当前无额外鉴权，生产环境请自行加保护。  
> 响应与全局一致：单层 `{ code, message, data }`（由拦截器包装）。

| 方法 | 路径 | 说明 | 返回 `data` |
|------|------|------|-------------|
| GET | `/admin/queues` | 队列统计、失败任务、worker 等 | `{ name, counts, workers, failedJobs }` |
| POST | `/admin/queues/retry` | 重试全部失败任务 | `{ count }` |
| POST | `/admin/queues/clean-failed` | 清空失败任务 | `null` |
| POST | `/admin/queues/pause` | 暂停队列 | `null` |
| POST | `/admin/queues/resume` | 恢复队列 | `null` |

队列主要承载微信消息异步处理：下载微信媒体 → 上传七牛 → 写笔记。Redis 不可用时队列不可用，但 REST API 仍可工作。

---

## 12. 接口速查表

| 方法 | 路径 | 认证 | 一句话说明 |
|------|------|------|------------|
| POST | `/auth/wechat/callback` | 公开 | 微信 code 换 JWT |
| POST | `/auth/email/send-code` | 公开 | 发邮箱验证码 |
| POST | `/auth/email/register` | 公开 | 邮箱注册（不签发 JWT） |
| POST | `/auth/email/login` | 公开 | 邮箱登录 |
| POST | `/auth/email/reset-password` | 公开 | 验证码重置密码 |
| POST | `/auth/refresh` | 公开 | 刷新 Token |
| POST | `/auth/logout` | JWT | 登出 |
| GET | `/user/profile` | JWT | 当前用户资料 |
| POST | `/user/update` | JWT | 更新昵称/头像 |
| POST | `/user/bind` | JWT | 用空壳码绑定微信 |
| GET | `/wechat/callback` | 公开 | 微信服务器校验 |
| POST | `/wechat/callback` | 公开 | 接收公众号消息 |
| GET | `/notes` | JWT | 笔记列表 |
| GET | `/notes/detail` | JWT | 笔记详情 |
| POST | `/notes/create` | JWT | 创建笔记 |
| POST | `/notes/update` | JWT | 更新笔记 |
| POST | `/notes/delete` | JWT | 软删除 |
| POST | `/notes/publish` | JWT | 发布 |
| POST | `/notes/archive` | JWT | 归档切换 |
| POST | `/notes/pin` | JWT | 置顶切换 |
| GET | `/notes/media` | JWT | 笔记媒体列表 |
| GET | `/notes/share` | JWT | 分享信息 |
| GET | `/categories` | JWT | 分类树 |
| POST | `/categories/create` | JWT | 创建分类 |
| POST | `/categories/update` | JWT | 更新分类 |
| POST | `/categories/delete` | JWT | 删除分类 |
| POST | `/categories/reorder` | JWT | 拖拽排序 |
| GET | `/tags` | JWT | 标签列表 |
| POST | `/tags/create` | JWT | 创建标签（同名复用） |
| POST | `/tags/delete` | JWT | 删除标签 |
| GET | `/storage/upload-token` | JWT | 七牛直传 Token |
| POST | `/storage/upload` | JWT | 上传文件并建媒体 |
| POST | `/storage/delete` | JWT | 删七牛文件 |
| POST | `/media/check` | JWT | 校验媒体归属 |
| GET | `/admin/queues` | 公开 | 队列状态 |
| POST | `/admin/queues/retry` | 公开 | 重试失败任务 |
| POST | `/admin/queues/clean-failed` | 公开 | 清空失败任务 |
| POST | `/admin/queues/pause` | 公开 | 暂停队列 |
| POST | `/admin/queues/resume` | 公开 | 恢复队列 |
