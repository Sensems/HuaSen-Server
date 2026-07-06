# Media Library Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将媒体从"笔记附属"提升为"独立实体"，建立 Media 表 + NoteMedia 关联表的多对多架构。

**Architecture:** 新建 `Media` 表（独立实体，带 status 生命周期）、`NoteMedia` 降为纯关联表（noteId + mediaId 复合主键）。新建 `MediaModule` 提供 create/checkOwnership/attachToNote/detachFromNote 方法。Notes/Storage/Wechat 模块适配新模型。

**Tech Stack:** NestJS 11 + Fastify + Prisma 7 + PostgreSQL + class-validator + @nestjs/swagger

---

## Dependency Matrix

| Task | Depends On | Can Parallelize With |
|------|-----------|---------------------|
| 1. Prisma schema + migration | - | 2, 3 |
| 2. Error codes (5xxxx) | - | 1, 3 |
| 3. CurrentUserInfo extraction | - | 1, 2 |
| 4. MediaModule | 1, 2 | 5 |
| 5. Notes DTOs | 1 | 4 |
| 6. NotesService | 4, 5 | 7 |
| 7. StorageController + DTO | 3, 4 | 6 |
| 8. WechatMessageProcessor | 4 | 9 |
| 9. Module imports | 4, 6, 7, 8 | - |
| 10. Build verification + cleanup | all | - |

### Parallel Waves

```
Wave 1 (parallel):  Task 1 ─┬─ Task 2 ─┬─ Task 3
                            │          │
Wave 2 (parallel):  Task 4 ─┤          │
                    Task 5 ─┘          │
                                       │
Wave 3 (parallel):  Task 6 ────────────┤
                    Task 7 ────────────┤
                                       │
Wave 4 (parallel):  Task 8 ────────────┘
                                       │
Wave 5 (serial):    Task 9 ────────────┘
                                       │
Wave 6 (serial):    Task 10 ───────────┘
```

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Delete data: old `note_media` table rows (migration auto-drops)

**Steps:**

- [ ] **1.1 Add MediaStatus enum**

In `prisma/schema.prisma`, after `MediaType` enum:

```prisma
/** 媒体状态 */
enum MediaStatus {
  PENDING
  ATTACHED
  ORPHAN
}
```

- [ ] **1.2 Add Media model**

In `prisma/schema.prisma`, after `NoteMedia` model:

```prisma
/** 媒体表（独立实体，上传即入库） */
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
```

- [ ] **1.3 Replace NoteMedia model**

Replace the current `NoteMedia` model (with `id, noteId, type, qiniuKey, ...`) with pure join table:

```prisma
/** 笔记-多媒体多对多关联表 */
model NoteMedia {
  noteId  String @map("note_id") @db.Uuid
  mediaId String @map("media_id") @db.Uuid

  note  Note  @relation(fields: [noteId], references: [id])
  media Media @relation(fields: [mediaId], references: [id])

  @@id([noteId, mediaId])
  @@map("note_media")
}
```

- [ ] **1.4 Add User model back-relation**

In `User` model, after `categories Category[]`, add:

```prisma
  media    Media[]
```

- [ ] **1.5 Run migration**

```bash
npx prisma migrate dev --name add-media-library
```

Expected: Migration creates `media` table, drops old `note_media` columns, rebuilds with new structure. Exit code 0.

- [ ] **1.6 Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Media model, MediaStatus enum, refactor NoteMedia to join table"
```

---

### Task 2: Error Codes (5xxxx)

**Files:**
- Modify: `src/common/constants/error-codes.ts`

**Steps:**

- [ ] **2.1 Add error codes**

In the `ErrorCode` enum, after the `TAG_*` section (4xxxx), add:

```typescript
// ===== 5xxxx 多媒体 =====
MEDIA_NOT_FOUND = 50001,
MEDIA_NOT_OWNED = 50002,
MEDIA_NOT_PENDING = 50003,
```

- [ ] **2.2 Add error messages**

In the `ErrorMessage` map, add:

```typescript
[ErrorCode.MEDIA_NOT_FOUND]: '媒体记录不存在',
[ErrorCode.MEDIA_NOT_OWNED]: '媒体不属于当前用户',
[ErrorCode.MEDIA_NOT_PENDING]: '媒体状态不是待关联',
```

- [ ] **2.3 Commit**

```bash
git add src/common/constants/error-codes.ts
git commit -m "feat: add media error codes (5xxxx)"
```

---

### Task 3: CurrentUserInfo Extraction

**Files:**
- Modify: `src/common/decorators/current-user.decorator.ts`
- Modify: `src/notes/notes.controller.ts`

**Steps:**

- [ ] **3.1 Extract CurrentUserInfo interface**

In `src/common/decorators/current-user.decorator.ts`, add export before the existing decorator:

```typescript
/** 当前用户最小信息 */
export interface CurrentUserInfo {
  id: string;
  openid: string;
  nickname?: string;
  role: string;
}
```

- [ ] **3.2 Update notes.controller.ts**

In `src/notes/notes.controller.ts`, replace the inline interface with import:

```typescript
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
```

Remove the inline interface definition (lines 17-22).

- [ ] **3.3 Commit**

```bash
git add src/common/decorators/current-user.decorator.ts src/notes/notes.controller.ts
git commit -m "refactor: extract CurrentUserInfo to shared decorator"
```

---

### Task 4: MediaModule (New Module)

**Files:**
- Create: `src/media/dto/check-media.dto.ts`
- Create: `src/media/dto/index.ts`
- Create: `src/media/media.service.ts`
- Create: `src/media/media.controller.ts`
- Create: `src/media/media.module.ts`

**Steps:**

- [ ] **4.1 Create check-media.dto.ts**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

/**
 * 批量校验媒体归属请求体
 */
export class CheckMediaDto {
  @ApiProperty({
    description: '需要校验的媒体 ID 列表',
    type: [String],
    isArray: true,
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds!: string[];
}
```

- [ ] **4.2 Create dto/index.ts**

```typescript
export { CheckMediaDto } from './check-media.dto';
```

- [ ] **4.3 Create media.service.ts**

Full implementation with all 6 methods, Chinese JSDoc, PrismaService injection:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { MediaStatus, Media, Prisma } from '@prisma/client';

/** 创建 Media 所需参数 */
interface CreateMediaParams {
  userId: string;
  type: string;
  qiniuKey: string;
  qiniuUrl: string;
  fileSize?: number;
  mimeType?: string;
  wxMediaId?: string;
  status?: MediaStatus;
}

/**
 * 媒体服务
 * 管理 Media 实体的完整生命周期：创建、校验、关联/解绑笔记
 */
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上传后创建 Media 记录
   * @returns 创建的 Media 对象
   */
  async create(params: CreateMediaParams): Promise<Media> {
    return this.prisma.media.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        qiniuKey: params.qiniuKey,
        qiniuUrl: params.qiniuUrl,
        fileSize: params.fileSize ?? null,
        mimeType: params.mimeType ?? null,
        wxMediaId: params.wxMediaId ?? null,
        status: params.status ?? MediaStatus.PENDING,
      },
    });
  }

  /**
   * 批量校验 mediaIds 是否属于指定用户且状态为 PENDING
   * @returns 有效媒体列表和无效 ID 列表
   */
  async checkOwnership(
    mediaIds: string[],
    userId: string,
  ): Promise<{ valid: Media[]; invalid: string[] }> {
    if (!mediaIds.length) return { valid: [], invalid: [] };

    const mediaRecords = await this.prisma.media.findMany({
      where: { id: { in: mediaIds } },
    });

    const mediaMap = new Map(mediaRecords.map((m) => [m.id, m]));
    const valid: Media[] = [];
    const invalid: string[] = [];

    for (const id of mediaIds) {
      const m = mediaMap.get(id);
      if (!m || m.userId !== userId || m.status !== MediaStatus.PENDING) {
        invalid.push(id);
      } else {
        valid.push(m);
      }
    }

    return { valid, invalid };
  }

  /**
   * 批量关联媒体到笔记（事务内调用）
   * 校验归属 + PENDING 状态后，创建 NoteMedia 关联并更新 Media 状态为 ATTACHED
   * @throws MEDIA_NOT_OWNED 或 MEDIA_NOT_PENDING 如果校验失败
   */
  async attachToNote(
    noteId: string,
    mediaIds: string[],
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;
    const { invalid } = await this.checkOwnership(mediaIds, userId);

    if (invalid.length > 0) {
      const first = invalid[0];
      const media = await this.prisma.media.findUnique({ where: { id: first } });
      if (!media) {
        throw new BusinessException(ErrorCode.MEDIA_NOT_FOUND);
      }
      if (media.userId !== userId) {
        throw new BusinessException(ErrorCode.MEDIA_NOT_OWNED);
      }
      throw new BusinessException(ErrorCode.MEDIA_NOT_PENDING);
    }

    // 批量创建关联 + 更新状态
    await Promise.all([
      client.noteMedia.createMany({
        data: mediaIds.map((mediaId) => ({ noteId, mediaId })),
        skipDuplicates: true,
      }),
      client.media.updateMany({
        where: { id: { in: mediaIds } },
        data: { status: MediaStatus.ATTACHED },
      }),
    ]);
  }

  /**
   * 解绑笔记所有媒体关联，孤立无其他关联的 Media
   */
  async detachFromNote(
    noteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;

    // 获取旧关联的 mediaIds
    const oldAssociations = await client.noteMedia.findMany({
      where: { noteId },
      select: { mediaId: true },
    });
    const oldMediaIds = oldAssociations.map((a) => a.mediaId);

    if (!oldMediaIds.length) return;

    // 删除关联
    await client.noteMedia.deleteMany({ where: { noteId } });

    // 孤立没有其他关联的 Media
    const orphanIds = await this.isOrphan(oldMediaIds, tx);
    if (orphanIds.length > 0) {
      await client.media.updateMany({
        where: { id: { in: orphanIds } },
        data: { status: MediaStatus.ORPHAN },
      });
    }
  }

  /**
   * 查询笔记下的媒体列表
   */
  async findByNoteId(noteId: string): Promise<Media[]> {
    const associations = await this.prisma.noteMedia.findMany({
      where: { noteId },
      include: { media: true },
      orderBy: { media: { uploadedAt: 'asc' } },
    });
    return associations.map((a) => a.media);
  }

  /**
   * 判断给定 mediaIds 中哪些是孤儿（无任何 NoteMedia 关联）
   * @returns 孤儿 mediaId 列表
   */
  async isOrphan(
    mediaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx || this.prisma;
    const counts = await Promise.all(
      mediaIds.map(async (mediaId) => {
        const count = await client.noteMedia.count({ where: { mediaId } });
        return { mediaId, count };
      }),
    );
    return counts.filter((c) => c.count === 0).map((c) => c.mediaId);
  }
}
```

- [ ] **4.4 Create media.controller.ts**

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CheckMediaDto } from './dto/check-media.dto';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';

/**
 * 媒体控制器
 * 提供媒体校验等辅助接口
 */
@ApiTags('媒体')
@ApiBearerAuth('JWT-auth')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * 批量校验媒体归属
   * POST /media/check
   */
  @Post('check')
  @ApiOperation({ summary: '批量校验媒体 ID 归属和状态' })
  @ApiResponse({
    status: 200,
    description: '返回有效和无效的媒体 ID 列表',
  })
  async check(
    @Body() dto: CheckMediaDto,
    @CurrentUser() user: CurrentUserInfo,
  ) {
    const { valid, invalid } = await this.mediaService.checkOwnership(
      dto.mediaIds,
      user.id,
    );
    return { valid: valid.map((m) => m.id), invalid };
  }
}
```

- [ ] **4.5 Create media.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

/**
 * 媒体模块
 * 管理 Media 实体的完整生命周期
 */
@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
```

Note: No UserModule import needed — MediaService takes userId as string param, no UserService dependency.

- [ ] **4.6 Commit**

```bash
git add src/media/
git commit -m "feat: add MediaModule with MediaService, MediaController, CheckMediaDto"
```

---

### Task 5: Notes DTO Adaptation

**Files:**
- Modify: `src/notes/dto/create-note.dto.ts`
- Modify: `src/notes/dto/update-note.dto.ts`
- Modify: `src/notes/dto/index.ts`
- Delete: `src/notes/dto/note-media-item.dto.ts`

**Steps:**

- [ ] **5.1 Rewrite create-note.dto.ts**

Replace `media?: NoteMediaItemDto[]` with `mediaIds?: string[]`, remove `NoteMediaItemDto` import:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NoteSource } from '../../common/enums';

/**
 * 创建笔记请求体
 */
export class CreateNoteDto {
  @ApiProperty({
    description: '笔记标题，留空时自动从正文截取前 100 字符',
    required: false,
    example: '我的第一篇笔记',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: '笔记正文内容',
    required: false,
    example: '这是笔记的正文内容...',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: '笔记来源',
    enum: NoteSource,
    required: false,
    example: NoteSource.APP_MANUAL,
  })
  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;

  @ApiProperty({
    description: '所属分类 ID',
    required: false,
    example: 'clxyz1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: '关联标签 ID 列表',
    required: false,
    type: [String],
    example: ['tag_abc123', 'tag_def456'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiProperty({
    description: '已上传的媒体 ID 列表（上传后获取的 mediaId）',
    required: false,
    type: [String],
    isArray: true,
    example: ['uuid-1', 'uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
```

- [ ] **5.2 Rewrite update-note.dto.ts**

Same pattern — replace `media?: NoteMediaItemDto[]` with `mediaIds?: string[]`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * 更新笔记请求体
 */
export class UpdateNoteDto {
  @ApiProperty({
    description: '要更新的笔记 ID',
    required: true,
    example: 'clxyz1234567890abcdef',
  })
  @IsString()
  id!: string;

  @ApiProperty({
    description: '新的笔记标题',
    required: false,
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: '新的笔记正文内容',
    required: false,
    example: '更新后的正文内容...',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: '新的分类 ID（传空字符串或省略表示不修改）',
    required: false,
    example: 'clxyz1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: '新的标签 ID 列表（传空数组可清空已有标签）',
    required: false,
    type: [String],
    example: ['tag_abc123'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiProperty({
    description: '已上传的媒体 ID 列表（替换已有媒体关联）',
    required: false,
    type: [String],
    isArray: true,
    example: ['uuid-1', 'uuid-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
```

- [ ] **5.3 Update barrel export**

In `src/notes/dto/index.ts`, remove `NoteMediaItemDto` export:

```typescript
export { CreateNoteDto } from './create-note.dto';
export { UpdateNoteDto } from './update-note.dto';
export { QueryNoteDto } from './query-note.dto';
```

- [ ] **5.4 Delete NoteMediaItemDto**

```bash
Remove-Item -LiteralPath "src/notes/dto/note-media-item.dto.ts"
```

- [ ] **5.5 Commit**

```bash
git add src/notes/dto/
git commit -m "feat: replace media DTO field with mediaIds in create/update notes, remove NoteMediaItemDto"
```

---

### Task 6: NotesService Adaptation

**Files:**
- Modify: `src/notes/notes.service.ts`

**Steps:**

- [ ] **6.1 Add MediaService import and injection**

Replace import lines:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { UserService, DEFAULT_USER_ID } from '../user/user.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { Prisma, $Enums } from '@prisma/client';
```

Constructor — inject MediaService:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly userService: UserService,
  private readonly mediaService: MediaService,
) {}
```

- [ ] **6.2 Rewrite create() method**

Replace lines 92-121 with transaction-wrapped create + attach:

```typescript
/**
 * 创建笔记（App 手动创建或微信消息入库）
 * 支持可选 mediaIds 关联已上传媒体
 */
async create(dto: CreateNoteDto, userId?: string) {
  const title = dto.title || this.generateTitle(dto.content);
  const uid = userId || DEFAULT_USER_ID;

  return this.prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        userId: uid,
        type: $Enums.NoteType.DRAFT,
        source: (dto.source as unknown as $Enums.NoteSource) || $Enums.NoteSource.APP_MANUAL,
        title,
        content: dto.content,
        categoryId: dto.categoryId || null,
        tags: dto.tagIds?.length
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
    });

    if (dto.mediaIds?.length) {
      await this.mediaService.attachToNote(note.id, dto.mediaIds, uid, tx);
    }

    return tx.note.findUnique({
      where: { id: note.id },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        media: { include: { media: true } },
      },
    });
  });
}
```

- [ ] **6.3 Rewrite update() method**

Replace lines 165-203 with transaction-wrapped detach + attach:

```typescript
/**
 * 更新笔记
 */
async update(dto: UpdateNoteDto, userId?: string) {
  const { id, tagIds, mediaIds, ...data } = dto;
  const uid = userId || DEFAULT_USER_ID;

  // 验证笔记归属
  await this.findById(id, uid);

  return this.prisma.$transaction(async (tx) => {
    if (tagIds !== undefined) {
      await tx.noteTag.deleteMany({ where: { noteId: id } });
    }

    if (mediaIds !== undefined) {
      await this.mediaService.detachFromNote(id, tx);
      if (mediaIds.length > 0) {
        await this.mediaService.attachToNote(id, mediaIds, uid, tx);
      }
    }

    return tx.note.update({
      where: { id },
      data: {
        ...data,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        media: { include: { media: true } },
      },
    });
  });
}
```

- [ ] **6.4 Update findAll() mediaType filter**

Replace line 48 (in `findAll` method):

```typescript
// Old:
// if (mediaType) where.media = { some: { type: mediaType as $Enums.MediaType } };
// New:
if (mediaType) {
  where.media = { some: { media: { type: mediaType as $Enums.MediaType } } };
}
```

- [ ] **6.5 Update findById() include**

Replace line 78 `include: { media: true }` with:

```typescript
include: {
  category: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  media: { include: { media: true } },
},
```

- [ ] **6.6 Add response flattening in findById()**

After the note is fetched, flatten the media before returning:

```typescript
// Flatten media: NoteMedia[] → Media[]
const result = { ...note, media: note.media.map((nm) => nm.media) };
return result;
```

- [ ] **6.7 Update getMedia() delegation**

Replace lines 252-257:

```typescript
/**
 * 获取笔记关联的多媒体列表
 */
async getMedia(noteId: string) {
  return this.mediaService.findByNoteId(noteId);
}
```

- [ ] **6.8 Commit**

```bash
git add src/notes/notes.service.ts
git commit -m "feat: adapt NotesService to new Media model (mediaIds, $transaction, flatten response)"
```

---

### Task 7: StorageController + DTO Adaptation

**Files:**
- Modify: `src/storage/storage.controller.ts`
- Modify: `src/storage/dto/upload-file-response.dto.ts`
- Modify: `src/storage/storage.module.ts`

**Steps:**

- [ ] **7.1 Update UploadFileResponseDto**

Add `mediaId` field:

```typescript
import { ApiProperty } from '@nestjs/swagger';

/**
 * 上传文件响应 DTO
 * 用于 POST /storage/upload 接口的 data 字段
 */
export class UploadFileResponseDto {
  /** 媒体记录 ID（上传后创建的 Media 记录主键） */
  @ApiProperty({
    description: '媒体记录 ID（后续用于关联笔记）',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  mediaId!: string;

  /** 文件在七牛云的存储 Key */
  @ApiProperty({
    description: '文件在七牛云存储的 Key（唯一标识，后续可用于访问或删除）',
    example: 'uploads/2026/07/abc123.jpg',
  })
  key!: string;

  /** 文件公开访问 URL */
  @ApiProperty({
    description: '文件公开访问 URL（七牛云 CDN 域名拼接）',
    example: 'http://cdn.example.com/uploads/2026/07/abc123.jpg',
  })
  url!: string;

  /** 文件 MIME 类型 */
  @ApiProperty({
    description: '文件 MIME 类型（如 image/jpeg、video/mp4）',
    example: 'image/jpeg',
  })
  mimeType!: string;

  /** 文件大小（字节） */
  @ApiProperty({
    description: '文件大小（字节）',
    example: 204800,
  })
  size!: number;
}
```

- [ ] **7.2 Update StorageController upload()**

Inject `MediaService`, add `@CurrentUser()`, infer MediaType from MIME, create Media record:

```typescript
import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation,
  ApiQuery, ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { MediaService } from '../media/media.service';
import {
  UploadTokenResponseDto, UploadFileResponseDto,
  DeleteFileResponseDto, DeleteFileDto,
} from './dto';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import { MediaType } from '../common/enums';

/** MIME 前缀 → MediaType 映射 */
function inferMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return MediaType.IMAGE;
  if (mimeType.startsWith('audio/')) return MediaType.VOICE;
  if (mimeType.startsWith('video/')) return MediaType.VIDEO;
  return MediaType.FILE;
}

// ... (keep existing controller decorators) ...
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly mediaService: MediaService,
  ) {}

  // ... (keep upload-token and delete methods unchanged) ...

  /**
   * 上传文件到七牛云（multipart/form-data）
   * POST /storage/upload
   */
  @Post('upload')
  @ApiOperation({ summary: '上传文件到七牛云（multipart/form-data）并创建媒体记录' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '要上传的文件' },
        type: {
          type: 'string',
          enum: ['IMAGE', 'VOICE', 'VIDEO', 'FILE'],
          description: '媒体类型（可选，不传则从 MIME 推断）',
          required: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '上传成功，返回媒体记录 ID 和文件信息',
    type: UploadFileResponseDto,
  })
  async upload(
    @Req() req: any,
    @CurrentUser() user: CurrentUserInfo,
  ) {
    const file = await req.file();
    const result = await this.storageService.uploadFile(file);

    const media = await this.mediaService.create({
      userId: user.id,
      type: req.body?.type?.value || inferMediaType(result.mimeType),
      qiniuKey: result.key,
      qiniuUrl: result.url,
      fileSize: result.size,
      mimeType: result.mimeType,
    });

    return { mediaId: media.id, ...result };
  }
}
```

- [ ] **7.3 Update StorageModule**

In `src/storage/storage.module.ts`, add `MediaModule` to imports:

```typescript
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [MediaModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **7.4 Commit**

```bash
git add src/storage/
git commit -m "feat: add mediaId to upload response, integrate MediaService in StorageController"
```

---

### Task 8: WechatMessageProcessor Adaptation

**Files:**
- Modify: `src/queue/processors/wechat-message.processor.ts`

**Steps:**

- [ ] **8.1 Add MediaService import and injection**

Add import:
```typescript
import { MediaService } from '../../media/media.service';
```

Inject in constructor (alongside existing dependencies):
```typescript
constructor(
  private readonly notesService: NotesService,
  private readonly wechatAccessToken: WechatAccessTokenService,
  private readonly storageService: StorageService,
  private readonly mediaService: MediaService,  // NEW
) {}
```

- [ ] **8.2 Rewrite processMedia() flow**

The current flow (`processMedia` method ~line 92-178) does:
1. Download from WeChat
2. Upload to Qiniu
3. Create Note + nested NoteMedia

Change to:
1. Download from WeChat → upload to Qiniu (OUTSIDE transaction)
2. `prisma.$transaction`:
   - Create Media (status=ATTACHED, userId=DEFAULT_USER_ID)
   - Create Note
   - Create NoteMedia association

The key change is replacing the Prisma nested create with explicit Media creation + association. Pseudocode for the new flow:

```typescript
// Step 1: Download & upload (outside transaction) — existing code, unchanged
const qiniuResult = await this.downloadAndUpload(mediaId, msgType, accessToken);
const noteContent = this.formatMediaContent(msgType, qiniuResult.url, rawContent);

// Step 2: Transaction — create Media + Note + NoteMedia
const note = await this.prisma.$transaction(async (tx) => {
  // Create Media record
  const media = await this.mediaService.create({
    userId: DEFAULT_USER_ID,
    type: mediaType,
    qiniuKey: qiniuResult.key,
    qiniuUrl: qiniuResult.url,
    fileSize: qiniuResult.size,
    mimeType: qiniuResult.mimeType,
    wxMediaId: mediaId,
    status: 'ATTACHED',  // Directly ATTACHED for wechat flow
  });

  // Create Note
  const note = await this.notesService.createFromWechat({
    content: noteContent,
    rawContent: rawContent,
    msgId: msgId,
    createTime: createTime,
  });

  // Create NoteMedia association
  await tx.noteMedia.create({
    data: { noteId: note.id, mediaId: media.id },
  });

  return note;
});
```

Note: `createFromWechat` currently creates Note without media, so the association is done separately via `noteMedia.create`. This keeps `createFromWechat` unchanged.

If `createFromWechat` does its own dedup check (line 134-142) and returns existing note, skip media creation entirely:

```typescript
// Check dedup first
const existing = await this.prisma.note.findFirst({
  where: {
    userId: DEFAULT_USER_ID,
    meta: { path: ['wechat_msg_id'], equals: msgId },
  },
});
if (existing) return existing;

// Proceed with download + upload + create
```

- [ ] **8.3 Add PrismaService injection (if not already)**

The processor needs `PrismaService` for `$transaction` and `findFirst`. Check if already injected. If not, add to constructor.

- [ ] **8.4 Commit**

```bash
git add src/queue/processors/wechat-message.processor.ts
git commit -m "feat: adapt WechatMessageProcessor to new Media model with $transaction"
```

---

### Task 9: Module Import Wiring

**Files:**
- Modify: `src/notes/notes.module.ts`
- Modify: `src/wechat/wechat.module.ts`
- Modify: `src/app.module.ts`

**Steps:**

- [ ] **9.1 Update NotesModule**

`src/notes/notes.module.ts` — add `MediaModule` to imports:

```typescript
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { UserModule } from '../user/user.module';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [UserModule, MediaModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
```

- [ ] **9.2 Update WechatModule**

`src/wechat/wechat.module.ts` — add `MediaModule` to imports:

```typescript
// Add MediaModule to existing imports array
imports: [/* existing */, MediaModule],
```

- [ ] **9.3 Update AppModule**

`src/app.module.ts` — register `MediaModule`:

```typescript
// Add to imports array (order matters for route matching — add before NotesModule)
import { MediaModule } from './media/media.module';

// In @Module decorator:
imports: [
  // ... existing ...
  MediaModule,
  // ... rest ...
],
```

- [ ] **9.4 Commit**

```bash
git add src/notes/notes.module.ts src/wechat/wechat.module.ts src/app.module.ts
git commit -m "feat: wire MediaModule into NotesModule, WechatModule, AppModule"
```

---

### Task 10: Build Verification + Cleanup

**Files:**
- Verify: all changed files

**Steps:**

- [ ] **10.1 Run TypeScript build**

```bash
npx tsc --project tsconfig.build.json
```

Expected: Exit code 0, no type errors. Fix any build errors before proceeding.

- [ ] **10.2 Run LSP diagnostics on all changed files**

```bash
# Check each module directory
lsp_diagnostics src/media/
lsp_diagnostics src/notes/
lsp_diagnostics src/storage/
lsp_diagnostics src/common/
lsp_diagnostics src/queue/processors/
```

Expected: No errors on any changed file.

- [ ] **10.3 Run prisma generate (ensure client is up to date)**

```bash
npx prisma generate
```

Expected: Exit code 0.

- [ ] **10.4 Verify NotesController update() signature**

`src/notes/notes.controller.ts` line 59 — update method now needs `@CurrentUser()`:

```typescript
@Post('update')
@ApiOperation({ summary: '更新笔记' })
@ApiResponse({ status: 200, description: '成功更新笔记' })
async update(@Body() dto: UpdateNoteDto, @CurrentUser() user: CurrentUserInfo) {
  return this.notesService.update(dto, user?.id);
}
```

- [ ] **10.5 Clean up unused imports**

Ensure no residual `NoteMediaItemDto` references anywhere:
```bash
grep "NoteMediaItemDto" src/ --include="*.ts"
```
Expected: No matches.

- [ ] **10.6 Final commit**

```bash
git add -A
git commit -m "chore: build verification, cleanup residual references"
```

---

## Final Verification Wave

> Runs after ALL tasks. ALL must PASS.

- [ ] F1. `npx tsc --project tsconfig.build.json` — zero errors
- [ ] F2. `npx prisma generate` — zero errors
- [ ] F3. E2E test — `POST /storage/upload` returns `mediaId` field
- [ ] F4. E2E test — `POST /notes/create` with `mediaIds` creates correct associations
- [ ] F5. E2E test — `POST /notes/update` with `mediaIds` replaces associations, old Media → ORPHAN
- [ ] F6. E2E test — `GET /notes/detail` returns flattened `media` array
- [ ] F7. E2E test — `POST /media/check` returns valid/invalid grouping
- [ ] F8. Regression — `GET /notes` list, `POST /notes/publish`, `POST /notes/archive` unaffected
- [ ] F9. No `NoteMediaItemDto` references remain in source

## Success Criteria

- `POST /storage/upload` 上传后返回 `mediaId`，数据库中存在 status=PENDING 的 Media 记录
- `POST /notes/create` 支持 `mediaIds` 一步到位关联媒体
- `POST /notes/update` 事务内替换媒体关联，仅无其他关联的 Media 设为 ORPHAN
- `GET /notes/detail` 返回拍平后的 `media: [{ id, type, qiniuKey, ... }]`
- `POST /media/check` 正确校验归属和 PENDING 状态
- WeChat 消息处理在事务外做网络 I/O、事务内做 DB 操作
- TypeScript 编译零错误
