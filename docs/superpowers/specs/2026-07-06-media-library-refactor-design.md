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
  updatedAt  DateTime     @updatedAt @map("updated_at")

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
- `Media.status` 追踪生命周期：PENDING → ATTACHED → ORPHAN。**仅在 Media 没有被任何笔记关联时才能设为 ORPHAN**（先 count NoteMedia 行数，为 0 才执行状态变更）
- `Media.userId` 记录上传者，支持按用户隔离和后续"媒体库"功能
- Migration 允许数据丢失。旧 `note_media` 记录的七牛云文件保留（`qiniu_key` 仍有效），但与笔记的关联关系永久丢失

### Note 模型变动

- `media NoteMedia[]` 关系不变
- 查媒体详情：`include: { media: { include: { media: true } } }`，Service 层拍平为 `note.media.map(nm => ({ id: nm.media.id, type: nm.media.type, qiniuKey: nm.media.qiniuKey, ... }))`

### User 模型变动

- 新增 `media Media[]` 关系（Media 的 `user` 反向关联），Prisma 要求 relation 两侧都定义

### Media.type 推断规则

当用户通过 `POST /storage/upload` 上传文件时，`Media.type` 从 MIME 类型自动推断：

| MIME 前缀 | MediaType |
|-----------|-----------|
| `image/` | `IMAGE` |
| `audio/` | `VOICE` |
| `video/` | `VIDEO` |
| 其他 | `FILE` |

若上传端点显式传入 `type` 字段（可选查询参数或 form field），则以传入值为准。

---

## API 变更

### Storage

| 接口 | 变更 |
|------|------|
| `POST /storage/upload` | 添加 `@CurrentUser()`，上传后调用 `mediaService.create()` 创建 Media(status=PENDING)，返回值新增 `mediaId`。`Media.type` 从 file.mimetype 推断或由请求中可选 `type` 字段指定 |
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
| `POST /notes/create` | DTO `media` → `mediaIds?: string[]`（UUID 数组）。创建笔记后调用 `mediaService.attachToNote()`（整个 create + attach 在 `prisma.$transaction` 内），同时支持 create 时直接传入 mediaIds |
| `POST /notes/update` | Controller 新增 `@CurrentUser()`，Service `update(dto, userId)`。DTO `media` → `mediaIds`。先 `detachFromNote` 解绑旧媒体再 `attachToNote` 绑定新媒体，整过程在 `prisma.$transaction` 内 |
| `GET /notes/detail` | `include: { media: { include: { media: true } } }`，Service 层拍平 `note.media.map(nm => nm.media)` |
| `GET /notes` | mediaType 筛选改为 `where.media = { some: { media: { type: mediaType as MediaType } } }` |
| `GET /notes/media` | 委托 `MediaService.findByNoteId()`（NotesService 内部注入 MediaService） |

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
| `POST /media/check` | 批量校验 mediaIds 归属 + status=PENDING。返回 `{ valid: string[], invalid: string[] }`（Controller 层从 `checkOwnership` 返回的 `Media[]` 中提取 `.id`），不抛异常 |

---

## 业务流

```
用户流程:
  ① POST /notes/create { content: "..." }
     → 创建笔记（DRAFT），不传 mediaIds 则无媒体关联
     注：也支持传 mediaIds 一步到位（适用于已上传媒体的场景）

  ② POST /storage/upload (multipart file)
     → 服务端：上传七牛云 → 创建 Media(status=PENDING, userId=当前用户)
     → 返回 { mediaId, key, url, mimeType, size }

  ③ POST /notes/update { id, mediaIds: ["uuid1", "uuid2"] }
     → prisma.$transaction:
        1. 校验 mediaIds 归属 + PENDING 状态
        2. deleteMany 旧 NoteMedia 关联
        3. 遍历旧 mediaId：若 NoteMedia.count({ where: { mediaId } }) === 0，则 UPDATE Media.status=ORPHAN
        4. create NoteMedia 新关联 → UPDATE 新 Media.status=ATTACHED

  ④ GET /notes/detail?id=xxx
     → Service 层拍平：note.media.map(nm => nm.media)
     → 每项返回 Media 完整信息
```

### 微信流程适配

`WechatMessageProcessor.processMedia()`：
1. 下载微信媒体 → 上传七牛云（网络 I/O，在事务外）
2. `prisma.$transaction` 内：
   - 创建 Media (status=ATTACHED, userId=DEFAULT_USER_ID)
   - 创建 Note + NoteMedia 关联

---

## 模块结构

```
src/
├── media/                      # 新建模块
│   ├── media.module.ts         # 导入 UserModule；导出 MediaService
│   ├── media.service.ts        # create / checkOwnership / attachToNote / detachFromNote / findByNoteId / isOrphan
│   ├── media.controller.ts     # POST /media/check
│   └── dto/
│       ├── check-media.dto.ts  # { mediaIds: string[] }
│       └── index.ts
├── notes/
│   ├── notes.module.ts         # 新增导入 MediaModule
│   ├── notes.service.ts        # create/update/findAll/findById/getMedia 适配新模型
│   └── dto/
│       ├── create-note.dto.ts  # media → mediaIds: string[]
│       ├── update-note.dto.ts  # 同上
│       └── index.ts            # 删除 NoteMediaItemDto export
├── storage/
│   ├── storage.module.ts       # 新增导入 MediaModule
│   ├── storage.controller.ts   # upload() 注入 MediaService，返回 mediaId；添加 @CurrentUser()
│   └── dto/
│       ├── upload-file-response.dto.ts  # 新增 mediaId: string 字段
│       └── index.ts
├── wechat/
│   └── wechat.module.ts        # 新增导入 MediaModule
├── queue/processors/
│   └── wechat-message.processor.ts  # 适配新 Media 创建方式，使用 $transaction
├── app.module.ts               # 注册 MediaModule
├── common/decorators/
│   └── current-user.decorator.ts  # 提取 CurrentUserInfo 接口为共享类型（避免 storage.controller.ts 重复定义）
└── common/constants/
    └── error-codes.ts          # 新增 5xxxx 段错误码
```

### MediaService 方法签名

```typescript
class MediaService {
  /** 上传后创建 Media 记录（storage controller 调用） */
  create(params: { userId: string; type: MediaType; qiniuKey: string; qiniuUrl: string; fileSize?: number; mimeType?: string; wxMediaId?: string; status?: MediaStatus }): Promise<Media>;

  /** 批量校验 mediaIds 是否属于 userId 且 status=PENDING，返回有效/无效分组 */
  checkOwnership(mediaIds: string[], userId: string): Promise<{ valid: Media[]; invalid: string[] }>;

  /** 批量关联媒体到笔记（事务内调用），校验归属后创建 NoteMedia + 更新状态 */
  attachToNote(noteId: string, mediaIds: string[], userId: string, tx?: Prisma.TransactionClient): Promise<void>;

  /** 解绑笔记所有媒体关联，孤立无其他关联的 Media */
  detachFromNote(noteId: string, tx?: Prisma.TransactionClient): Promise<void>;

  /** 查询笔记下的媒体列表 */
  findByNoteId(noteId: string): Promise<Media[]>;

  /** 判断 Media 是否为孤儿（无任何 NoteMedia 关联） */
  isOrphan(mediaIds: string[], tx?: Prisma.TransactionClient): Promise<string[]>;
}
```

---

## Migration 策略

允许数据丢失。Prisma migrate 三步：
1. 新增 `Media` 模型 + `MediaStatus` 枚举
2. 修改 `NoteMedia` 为纯关联表（删除旧字段 id/type/qiniuKey/qiniuUrl/wxMediaId/fileSize/mimeType/createdAt，保留 noteId + mediaId）
3. 旧 `note_media` 数据的七牛云文件保留（`qiniu_key` 仍有效），但与笔记的关联关系永久丢失

---

## 错误码定义

在 `common/constants/error-codes.ts` 新增 `5xxxx` 段：

```typescript
MEDIA_NOT_FOUND   = 50001  // 媒体记录不存在
MEDIA_NOT_OWNED   = 50002  // 媒体不属于当前用户
MEDIA_NOT_PENDING = 50003  // 媒体状态不是 PENDING（已关联或已孤立）
```

---

## Acceptance Criteria

- [ ] `POST /storage/upload` 上传后创建 Media(status=PENDING) 记录，返回 mediaId；`UploadFileResponseDto` 新增 mediaId 字段；`@CurrentUser()` 正确获取当前用户
- [ ] `POST /notes/create` 支持 `mediaIds?: string[]` 关联已有媒体（`CreateNoteDto.media` → `mediaIds`）
- [ ] `POST /notes/update` 在 `prisma.$transaction` 内完成 detach + attach，仅无关联的旧 Media 才设为 ORPHAN
- [ ] `GET /notes/detail` 正确返回拍平后的媒体列表（`note.media.map(nm => nm.media)`）
- [ ] `GET /notes` mediaType 筛选穿透一层 `{ some: { media: { type } } }`
- [ ] `POST /media/check` 返回 `{ valid: string[], invalid: string[] }`
- [ ] WeChat 消息处理在 `prisma.$transaction` 内适配新 Media 模型
- [ ] `NotesModule` / `StorageModule` / `WechatModule` / `AppModule` 正确导入 `MediaModule`
- [ ] `MediaService` 新增 `create` / `checkOwnership` / `attachToNote` / `detachFromNote` / `findByNoteId` / `isOrphan` 方法的单元测试
- [ ] `npx tsc --project tsconfig.build.json` 零错误
- [ ] 旧 `note-media-item.dto.ts` 文件删除，`notes/dto/index.ts` barrel 更新

---

## Notes

- 废弃的 `NoteMediaItemDto` 直接删除，响应类型由 Prisma 生成的 Media 类型驱动
- 响应拍平在 Service 层做，Controller 不改
- 孤儿清理（ORPHAN 定时清理七牛云文件）不在本次范围，后续单独做
