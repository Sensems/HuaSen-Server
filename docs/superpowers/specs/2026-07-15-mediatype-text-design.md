# MediaType TEXT + 微信纯文本标记

**日期**: 2026-07-15  
**状态**: 已确认，待实现  
**模块**: `prisma` / `src/common/enums` / `src/queue/processors` / `docs/API.md`

---

## 1. 需求概述

在 `MediaType` 增加 `TEXT`。微信回调为纯文本（`MsgType=text`）时，创建笔记的同时创建并关联一条 `type=TEXT` 的 Media，使 `GET /notes?mediaType=TEXT` 可筛到纯文本笔记。

### 1.1 功能范围

- Prisma `MediaType` 与 DTO 校验枚举 `src/common/enums` 同步增加 `TEXT`
- `WechatMessageProcessor.processText`：事务内创建 Note + Media(`TEXT`) + NoteMedia
- Media 占位字段（无七牛上传）：`qiniuKey=text/wechat/{msgId}`，`qiniuUrl=""`，`mimeType=text/plain`，`status=ATTACHED`
- `Note.meta` 增加 `media_type: "text"`（与多媒体笔记对齐）
- 更新 `docs/API.md` 的 `mediaType` 枚举说明；同步 `src/queue/AGENTS.md` 处理链路描述

### 1.2 不包含

- 历史纯文本笔记回填
- 将正文上传七牛
- 修改 Storage `inferMediaType`（`text/plain` 仍可为 `FILE`；`TEXT` 专供微信纯文本路径）
- App 手动创建笔记自动挂 TEXT Media
- 强制 E2E；以 Processor 单测 + 迁移/生成校验为主

---

## 2. 技术决策

| 决策点 | 选择 | 理由 |
| ------ | ---- | ---- |
| 标记落点 | 创建 `Media.type=TEXT` + NoteMedia | 用户确认 A；现有 `mediaType` 筛选项基于关联 Media |
| 云存储字段 | 约定占位，不上传七牛 | 正文已在 `Note.content`；避免重复与失败点 |
| `qiniuKey` | `text/wechat/{msgId}` | msgId 稳定、可追踪；创建前即可确定 |
| `qiniuUrl` | 空串 `""` | 无真实 URL；字段非空约束仍满足 |
| 事务 | `$transaction` 与 `processMedia` 一致 | Note/Media/NoteMedia 原子写入 |
| 历史数据 | 不回填 | YAGNI；仅新消息生效 |

曾考虑但未采用：仅写 `meta.media_type`（筛不到）；正文上传七牛（与 Note.content 重复）。

---

## 3. 数据模型

```prisma
enum MediaType {
  IMAGE
  VOICE
  VIDEO
  FILE
  TEXT
}
```

- `Media` 表结构不变；`TEXT` 行语义为「类型标记」，`qiniuUrl` 可为空串
- Migration：PostgreSQL 枚举追加值（Prisma migrate 生成）

---

## 4. 行为

### 4.1 `processText`

1. 标题/正文提取逻辑不变（首行标题、余下正文）
2. 事务内：
   - `note.create`（`source=WECHAT`，`meta` 含 `wechat_msg_id` / `wechat_create_time` / `from_user_name` / `media_type: "text"`）
   - `media.create`：`type=TEXT`，`status=ATTACHED`，`mimeType=text/plain`，`fileSize=Buffer.byteLength(rawText, 'utf8')`，占位 key/url
   - `noteMedia.create` 关联
3. 客服确认文案不变（仍用标题确认）

### 4.2 列表筛选

- 现有 `findAll` 的 `mediaType` 条件无需改逻辑；生成 Client 后传入 `TEXT` 即可

### 4.3 Storage / 其它路径

- 图片/语音/视频/文件路径不变
- 客户端上传 MIME 推断不新增 `TEXT` 分支

---

## 5. 验收标准

- [ ] Prisma Client 含 `MediaType.TEXT`
- [ ] 微信纯文本 Job 处理后，笔记关联恰好一条 `Media.type=TEXT` 且 `status=ATTACHED`
- [ ] `qiniuKey === text/wechat/{msgId}`，`qiniuUrl === ""`，`mimeType === text/plain`
- [ ] `GET /notes?mediaType=TEXT` 可返回该笔记（手工或单测断言 where 条件）
- [ ] 多媒体消息处理行为不变
- [ ] `docs/API.md` 列出 `TEXT`

---

## 6. 风险与缓解

| 风险 | 缓解 |
| ---- | ---- |
| 前端误把 TEXT Media 当可下载 URL | 文档注明 `qiniuUrl` 可为空；前端按 `type` 分支 |
| 孤儿 TEXT Media（笔记创建失败） | 事务保证 |
| 枚举迁移在部分 PG 版本需独占锁 | 标准 `ALTER TYPE ... ADD VALUE`；低流量可接受 |
