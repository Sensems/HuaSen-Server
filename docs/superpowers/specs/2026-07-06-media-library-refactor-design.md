# Media Library Refactor — 独立媒体表 + 多对多关联

## 目标

将媒体从"笔记附属"提升为"独立实体"，建立 `Media` 表 + `NoteMedia` 关联表的多对多架构，实现上传即入库、返回 mediaId、提交笔记时关联 mediaIds 的业务流。

## 现状

- `NoteMedia` 表作为笔记的附属子表，`noteId` 非空，无 `userId`/`status` 字段
- `POST /storage/upload` 只推文件到七牛云，不创建数据库记录，返回 `{ key, url, mimeType, size }`
- `POST /notes/create` 通过 Prisma nested create 一次性创建 Note + NoteMedia，客户端需提前准备好 `qiniuKey`/`qiniuUrl`
- 微信流程 `WechatMessageProcessor` 同样是 download → upload Qiniu → atomic note+media create
- 已完成计划：`note-media-association`（微信端）、`app-media-association`（App 端 media 字段）、`add-upload-api`（multipart 上传端点）

## 新数据模型

### Prisma Schema

```prisma
enum MediaStatus {
  PENDING
  ATTACHED
  ORPHAN
}

model Media {
  id         String       @id @default(uuid()) @db.Uuid
  userId     String       @map("user_id") @db.Uuid
  type       MediaType
  qiniuKey   String       @map("qiniu_key") @db.VarChar(512)
  qiniuUrl   String       @map("qiniu_url") @db.VarChar(512)
  wxMediaId  String?      @map("wx_media_id") @db.VarChar(128)
  fileSize   Int?         @map("file_size")
  mimeType   String?      @map("mime_type") @db.VarChar(64)
  status     MediaStatus  @default(PENDING)
  uploadedAt DateTime     @default(now()) @map("uploaded_at")
  createdAt  DateTime     @default(now()) @map("created_at")

  user  User        @relation(fields: [userId], references: [id])
  notes NoteMedia[]

  @@index([userId, status])
  @@map("media")
}

model NoteMedia {
  noteId  String @map("note_id") @db.Uuid
  mediaId String @map("media_id") @db.Uuid

  note  Note  @relation(fields: [noteId], references: [id])
  media Media @relation(fields: [mediaId], references: [id])

  @@id([noteId, mediaId])
  @@map("note_media")
}
```

### 关键约束

- `Media.noteId` 不直接存储，通过 `NoteMedia` 关联表实现多对多
- `Media.status` 追踪生命周期：PENDING → ATTACHED → ORPHAN
- `Media.userId` 记录上传者，支持按用户隔离和后续"媒体库"功能
- Migration 允许数据丢失（当前 WeChat 流程的旧 `note_media` 数据量小，不迁移）

### Note 模型变动

- `media NoteMedia[]` 关系不变
- 查媒体详情走 `include: { media: { include: { media: true } } }`，Service 层拍平返回

---

## API 变更

### Storage

| 接口 | 变更 |
|------|------|
| `POST /storage/upload` | 上传后创建 `Media` (status=PENDING)，返回值新增 `mediaId` |
| `GET /storage/upload-token` | 不变 |
| `POST /storage/delete` | 不变 |

**upload 响应格式**：
```json
{
  "mediaId": "uuid",
  "key": "uploads/xxx.jpg",
  "url": "http://cdn.example.com/uploads/xxx.jpg",
  "mimeType": "image/jpeg",
  "size": 204800
}
```

### Notes

| 接口 | 变更 |
|------|------|
| `POST /notes/create` | `media` 改为 `mediaIds?: string[]`（UUID 数组），创建后调用 MediaService.attachToNote |
| `POST /notes/update` | 同上，先 detach 旧媒体再 attach 新媒体，旧 Media → ORPHAN |
| `GET /notes/detail` | media 嵌套结构调整，Service 层拍平后返回 |
| `GET /notes` | mediaType 筛选 where 条件穿透一层 |
| `GET /notes/media` | 走 MediaService.findByNoteId |

**detail 响应 media 字段（拍平后）**：
```json
{
  "media": [
    { "id": "uuid", "type": "IMAGE", "qiniuKey": "...", "qiniuUrl": "...", "fileSize": 102400, "mimeType": "image/jpeg" }
  ]
}
```

### Media（新建）

| 接口 | 说明 |
|------|------|
| `POST /media/check` | 批量校验 mediaIds 归属 + status=PENDING |

---

## 业务流

```
用户流程:
  ① POST /notes/create { content: "..." }
     → 创建笔记（DRAFT），此时无媒体关联

  ② POST /storage/upload (multipart file)
     → 服务端：上传七牛云 → 创建 Media(status=PENDING, userId=当前用户)
     → 返回 { mediaId, key, url, mimeType, size }

  ③ POST /notes/update { id, mediaIds: ["uuid1", "uuid2"] }
     → 事务内：
       1. 校验 mediaIds 归属 + PENDING 状态
       2. deleteMany 旧 NoteMedia 关联 → 旧 Media 更新为 ORPHAN
       3. create NoteMedia 新关联 → 新 Media 更新为 ATTACHED

  ④ GET /notes/detail?id=xxx
     → media 数组拍平，每项为 Media 的完整信息
```

### 微信流程适配

`WechatMessageProcessor.processMedia()`:
1. 下载微信媒体 → 上传七牛云
2. 创建 Media (status=ATTACHED, userId=DEFAULT_USER_ID)
3. 创建 Note + NoteMedia 关联

---

## 模块结构

```
src/
├── media/                      # 新建模块
│   ├── media.module.ts
│   ├── media.service.ts        # create / checkOwnership / attachToNote / detachFromNote / findByNoteId
│   ├── media.controller.ts     # POST /media/check
│   └── dto/
│       ├── check-media.dto.ts
│       └── index.ts
├── notes/
│   ├── notes.service.ts        # create/update/findAll/findById/getMedia 适配新模型
│   └── dto/
│       ├── create-note.dto.ts  # media → mediaIds
│       └── update-note.dto.ts  # 同上
├── storage/
│   ├── storage.controller.ts   # upload 注入 MediaService，返回 mediaId
│   └── storage.module.ts       # 引入 MediaModule
└── queue/processors/
    └── wechat-message.processor.ts  # 适配新 Media 创建方式
```

---

## Migration 策略

允许数据丢失。Prisma migrate 三步：
1. 新增 `Media` 模型 + `MediaStatus` 枚举
2. 修改 `NoteMedia` 为纯关联表（删除旧字段，保留 noteId + mediaId）
3. 旧 `note_media` 数据的 WeChat 媒体信息通过微信重新拉取可恢复

---

## Acceptance Criteria

- [ ] `POST /storage/upload` 上传后创建 Media 记录，返回 mediaId
- [ ] `POST /notes/create` 支持 `mediaIds` 关联已有媒体
- [ ] `POST /notes/update` 支持 `mediaIds` 替换媒体关联（旧 Media → ORPHAN）
- [ ] `GET /notes/detail` 正确返回拍平后的媒体列表
- [ ] `POST /media/check` 批量校验 mediaIds 归属
- [ ] WeChat 消息处理适配新 Media 模型
- [ ] `npx tsc --project tsconfig.build.json` 零错误
- [ ] 单元测试覆盖新的 MediaService 核心方法

---

## Notes

- `NoteMediaItemDto` 从请求 DTO 降为响应 DTO（或直接删除，响应由 Prisma 类型驱动）
- 废弃的 `media[]` 字段同时从 `CreateNoteDto` / `UpdateNoteDto` 移除
- 响应拍平在 Service 层做，Controller 不改
- 孤儿清理（ORPHAN 定时清理七牛云文件）不在本次范围，后续单独做
