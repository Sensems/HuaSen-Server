# 用户资料更新与微信绑定

**日期**: 2026-07-14  
**状态**: 已确认，待实现  
**模块**: `src/user`, `src/wechat`, `src/queue/processors`, `src/auth`（绑定码生成复用）

---

## 1. 需求概述

### 1.1 功能范围

1. **更新用户资料**：仅允许更新 `nickname`、`avatar`（头像为 URL 字符串，客户端先上传再提交）。
2. **微信 ↔ App 绑定**（共用 `User.bindingCode`）：
   - **情况 1（微信先到）**：未 App 注册的用户给公众号发消息 → 生成/复用绑定码并回复，提示去 App 绑定；消息仍照常存为草稿（挂在微信空壳用户上）。用户在 App 登录/注册后调用绑定接口输入该码完成绑定，草稿迁到 App 账号。
   - **情况 2（App 先到）**：已注册 App 用户已有绑定码，将该码发给公众号 → 回调检测到是绑定码则绑定，并同步该 openid 下空壳草稿；该条文本**不**存成笔记。
3. **冲突覆盖**：允许覆盖已有绑定；覆盖时返回/回复明确提示信息。

### 1.2 不包含

- 独立解绑 API（覆盖即断开旧关联）
- 头像文件直传更新接口
- Pending 表或双套绑定码体系
- 绑定码过期/定时作废（本期码长期有效，直至被合并掉的空壳删除）
- 换绑审批流、多微信绑定同一 App 账号
- 将微信 OAuth 用户视为 App 注册 / 为其生成情况 2 绑定码
- 合并时迁移 `categories`（改为清空笔记 `categoryId`）

---

## 2. 技术决策

| 决策点 | 选择 | 理由 |
| ------ | ---- | ---- |
| 架构 | 双用户合并 | 贴合现有 `findOrCreateByWechat` + 笔记按 `userId` 归属 |
| 绑定码 | 共用 `User.bindingCode` | 邮箱注册已生成；微信空壳首次发消息生成/复用 |
| 未绑前消息 | 照常存草稿，绑定后迁移 | 不丢用户内容 |
| 冲突 | 允许覆盖 + 提示（仅操作方） | 产品选择；本期不做显式解绑 |
| 头像 | 仅 URL 字符串 | 复用现有存储上传链路 |
| Schema | 不改表 | `nickname` / `avatar` / `bindingCode` / `wxOpenid` 已存在 |
| 绑定文案 | 回调内同步判码 + 被动回复 | 避免「先正在保存再绑定成功」错位 |
| App 身份 | 仅 `email` | 微信 OAuth 本期不计入 App 注册 |
| 分类 | 合并时 `categoryId` 置空 | 不迁移空壳分类树 |

曾考虑但未采用：Pending 笔记表（改动大）；仅 App→微信单向（不满足情况 1 + 草稿保留）。

---

## 3. 数据模型与身份判定

沿用现有 `User`，本期无 migration。

| 状态 | 条件 |
| ---- | ---- |
| 微信空壳（未 App 注册） | 有 `wxOpenid`，无 `email` |
| 已 App 注册未绑微信 | 有 `email`，无 `wxOpenid` |
| 已绑定 | 有 `email` 且有 `wxOpenid` |

**说明：** 「已 App 注册」**仅**以 `email` 为准。微信 OAuth 登录用户（有 `wxOpenid`、无 `email`）本期**不算** App 注册账号，不为其补发 `bindingCode` 走情况 2；若需绑定微信与邮箱账号，走情况 1（空壳码）或先邮箱注册再绑。

### 3.1 合并规则（绑定成功时）

在同一事务内：

1. 将空壳用户下的 `notes`、`media` 的 `userId` 更新为目标 App 用户；迁出笔记的 `categoryId` **一律置空**（不迁移分类）。
2. 若目标 App 用户已有其他 `wxOpenid`，先清空该旧 openid 在库中的占用（见覆盖规则），再写入新 `wxOpenid`。
3. 若目标 openid 已绑在另一已注册 App 用户上，先清空该用户的 `wxOpenid`，再绑到当前目标用户，并标记覆盖提示。
4. 删除已无业务数据的空壳用户行（空壳上残留的 `categories` 随用户删除或先删分类；笔记已清空 `categoryId`，不保留空壳分类树）。
5. App 用户保留自己的 `bindingCode`；空壳上的码随空壳删除而失效。

覆盖提示仅反馈给**当前操作方**（调用 `/user/bind` 的 App 用户，或发码的微信用户）；被解除绑定的另一方本期不主动通知。

### 3.2 覆盖提示

- App `POST /user/bind`：成功响应 `data` 含 `overwritten: boolean` 与可读 `message`（覆盖时为 true 且文案说明原绑定已解除）。
- 微信情况 2：在**被动回复**文案中写清覆盖信息（见 §5.0）。

### 3.3 幂等

- 已是「当前 App 用户 ↔ 该 openid」：成功返回，`overwritten: false`，不重复迁移。
- 微信重复发送同一已绑定码：回复「已绑定」，不新建笔记。

---

## 4. API

均需 JWT（全局 Guard），路径遵循项目约定（仅 GET/POST）。

### 4.1 `GET /user/profile`

返回当前用户公开资料：

```json
{
  "id": "uuid",
  "nickname": "string|null",
  "avatar": "string|null",
  "email": "string|null",
  "bindingCode": "string|null",
  "wxBound": true
}
```

`wxBound` = `wxOpenid != null`。

### 4.2 `POST /user/update`

Body（至少一项）：

```json
{ "nickname": "可选", "avatar": "可选 URL" }
```

- `avatar`：校验为合理 URL 字符串（长度 ≤ 512，与库字段一致）。
- `nickname`：长度 ≤ 64。
- 返回更新后的资料（同 profile 字段子集即可）。

### 4.3 `POST /user/bind`

Body：

```json
{ "bindingCode": "ABCDEF" }
```

语义：用**微信空壳下发的码**把该空壳的微信身份合并到**当前登录的 App 用户**。

成功 `data` 示例：

```json
{
  "wxBound": true,
  "syncedDraftCount": 3,
  "overwritten": false,
  "message": "绑定成功"
}
```

覆盖时：`overwritten: true`，`message` 说明已覆盖原绑定。

---

## 5. 微信消息流

改动点：`WechatService.handleMessage`（**回调内同步判码**并构造被动回复）、`UserService.findOrCreateByWechat`（空壳需带 `bindingCode`；存量无码则补生成）、`WechatMessageProcessor`（跳过已在回调完成的绑定消息 / 未注册提示与客服确认对齐）。

### 5.0 回调同步判码（被动回复）

在 `WechatService.handleMessage` 解密得到明文消息后、入队前：

1. 解析 openid；查找或创建空壳（无 `bindingCode` 则补生成）。
2. **仅文本消息**：对 content 做 `trim` + 大写后查 `User.bindingCode`：
   - **匹配已 App 注册用户（有 email）** → **在回调内同步执行绑定合并**；构造对应被动回复（成功 / 覆盖 / 已绑定 / 失败重试）；**该消息不再入队**（或入队但带 `skipNote: true` 且 Worker 直接 no-op），避免落笔记。
   - **匹配当前用户自己的空壳码** → 不入队（或不建笔记）；被动回复绑定引导。
   - **其余** → 照常入队；被动回复按下面规则区分文案。
3. 被动回复文案（同步返回给微信，5 秒内交付）：
   - 情况 2 绑定结果 / 本人空壳码引导 / 未注册引导（含绑定码）/ 已绑定用户的常规「正在保存…」。

Worker 侧客服消息：仅对**实际创建了笔记**的 Job 发「已保存」确认；绑定类消息不发「笔记已保存」。

### 5.1 Worker 处理顺序（入队消息）

1. 按 `fromUserName` 解析用户（应已存在；`findOrCreateByWechat` 仍作兜底，返回至少 `{ id, email, bindingCode }`）。
2. **若当前用户无 `email`（情况 1）：**
   - 照常创建草稿笔记。
   - 客服消息可再补一句绑定引导（可选；主提示已在被动回复给出）。码复用不换新。
3. **若当前用户已绑定（有 email + wxOpenid）：**
   - 维持现有存笔记 + 成功确认；不再提示绑定。
4. 若 Job 标记为绑定已完成 / skipNote：直接返回，不建笔记。

### 5.2 绑定码匹配规则

- 仅文本消息参与「是否绑定码」判断；判断发生在**回调同步路径**（及 Worker 兜底若需要）。
- `trim` 后转大写，与库中 `bindingCode` 全等（生成规则与现有 `AuthService.generateBindingCode` 一致；抽到 `UserService` 复用）。
- 他人空壳码：不当绑定，按普通文本入队存笔记。

### 5.3 情况 2 合并细节

- 发送者 openid 对应的当前用户若是空壳：将其 notes/media 迁到码所属 App 用户，笔记 `categoryId` 置空，设置 App 用户 `wxOpenid`，删除空壳。
- 若 openid 已直接落在另一已注册用户上：清空旧用户 `wxOpenid`，绑到码所属用户，标记覆盖；无需空壳迁移（或迁移量为 0）。
- 事务失败：回滚，被动回复「绑定失败，请稍后重试」。

---

## 6. 错误处理

| 场景 | 错误码 / 行为 |
| ---- | ------------- |
| `/user/update` 无任何可更新字段 | 参数校验 → `BAD_REQUEST` |
| `/user/bind` 码不存在 | 新增 `BINDING_CODE_INVALID`（建议 `20016`） |
| `/user/bind` 码属于已注册 App 用户（非空壳） | `BINDING_CODE_INVALID`（App 端只能提交微信空壳码） |
| `/user/bind` 码属于空壳但无 `wxOpenid` | `BINDING_CODE_INVALID` |
| `/user/bind` 建议加 Throttle | 防绑码撞库（与登录类似） |
| 微信发码指向无 email 且非本人 | 不当绑定，按普通笔记处理 |
| 微信发送本人空壳绑定码 | 不入队建笔记，被动回复绑定引导 |
| 合并事务失败 | 回滚；被动回复提示重试；App 抛业务异常 |
| 存量空壳无 `bindingCode` | 下次消息/查找时补生成，不单独 migration |

在 `error-codes.ts` 增加：

- `BINDING_CODE_INVALID = 20016` →「绑定码无效」

---

## 7. 模块改动清单

| 位置 | 改动 |
| ---- | ---- |
| `src/user/` | 新增 controller；`updateProfile`、`getProfile`、`bindByCode`（含合并、`categoryId` 置空）；空壳创建/补码；抽取 `generateBindingCode` |
| `src/auth/auth.service.ts` | 邮箱注册改用共享的绑定码生成（OAuth 路径本期不生成码） |
| `src/wechat/wechat.service.ts` | **回调同步判码**、同步绑定合并、按结果构造被动回复；绑定成功则跳过入队 |
| `src/queue/processors/wechat-message.processor.ts` | 未注册/已绑定的笔记与客服确认；忽略 skipNote Job |
| `src/common/constants/error-codes.ts` | 新增绑定错误码 |
| `src/user/AGENTS.md` 或相关 AGENTS | 补充绑定与资料 API 约定 |
| `src/user/user.module.ts` | 注册 `UserController`（`UserModule` 已在 AppModule） |

---

## 8. 测试要点

1. 资料：只改昵称 / 只改头像 / 都改；缺字段校验。
2. 情况 1：未注册发消息 → 被动回复含稳定绑定码 + 草稿入库 → `POST /user/bind` → 草稿归属 App、笔记 `categoryId` 清空、openid 绑定、空壳删除。
3. 情况 2：App 用户发自己的码到公众号 → 回调内绑定成功（被动回复）+ 同步空壳草稿 + 不入队/不建笔记。
4. 覆盖：openid 已绑 A，再绑到 B → B 成功、A 的 `wxOpenid` 清空、操作方有提示。
5. 幂等：重复 bind / 重复发同一码。
6. 已绑定用户正常发消息不再弹绑定提示。
7. 发送他人空壳码：不当绑定，可存为普通笔记；发送自己的空壳码：只被动回复绑定提示，不建笔记。
8. 存量无码空壳：再次发消息后自动补码。
9. `syncedDraftCount`：空壳下 `deletedAt = null` 的笔记数（不限 DRAFT 类型也可计入，实现时统一为未删除笔记数）。

验证方式：单元/服务层测试优先；微信链路可用手工 + 现有队列环境验证。

---

## 9. 成功标准

- App 可查询与更新昵称、头像 URL。
- 微信先到与 App 先到两条绑定路径均可完成，草稿不丢。
- 覆盖场景有明确提示；非法绑定码有明确错误码。
- 无新 Prisma 模型；绑定码生成逻辑单一实现、两处复用。
