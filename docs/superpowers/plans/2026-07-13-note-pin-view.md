# Note Pin + List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为笔记增加 `pinnedAt` 置顶字段、`POST /notes/pin` toggle，以及列表互斥查询参数 `view=pinned|recent`（默认置顶优先）。

**Architecture:** 在 `Note` 上存可空 `pinnedAt`（非空即置顶）。`NotesService.pin` 仿 `archive` 做 toggle；`findAll` 按 `view` 切换 where/orderBy。列表默认用 Prisma `nulls: 'last'` 保证 Postgres 下 `pinnedAt DESC` 时未置顶（null）排在后面。

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Jest, class-validator

**Spec:** `docs/superpowers/specs/2026-07-13-note-pin-view-design.md`

## Global Constraints

- 只用 GET/POST；置顶接口为 `POST /notes/pin`
- `create` / `update` **不**接收 `pinnedAt`
- 不新增错误码；不存在/软删 → 现有 `NOTE_NOT_FOUND`
- 任意未删除笔记可置顶（draft / published / archived）
- 不强制 E2E；本计划用 `NotesService` 单测 + Swagger/手工核对
- 包管理器用 `pnpm`；改 schema 后 `pnpm exec prisma generate`

## File Map

| 文件 | 职责 |
| ---- | ---- |
| `prisma/schema.prisma` | `Note.pinnedAt` + `@@index([userId, pinnedAt])` |
| `prisma/migrations/*` | 迁移 SQL |
| `src/notes/dto/query-note.dto.ts` | 可选 `view: 'pinned' \| 'recent'` |
| `src/notes/notes.service.ts` | `findAll` 按 view 排序/筛选；新增 `pin()` |
| `src/notes/notes.controller.ts` | `POST pin` 路由 |
| `src/notes/notes.service.spec.ts` | `pin` / `findAll` 单测（新建） |
| `src/notes/AGENTS.md` | 文档同步 |

---

### Task 1: Prisma — `pinnedAt` 字段与迁移

**Files:**
- Modify: `prisma/schema.prisma`（`model Note`）
- Create: `prisma/migrations/<timestamp>_add_note_pinned_at/migration.sql`（由 CLI 生成）

- [ ] **Step 1: 在 `Note` 模型增加 `pinnedAt` 与索引**

在 `prisma/schema.prisma` 的 `model Note` 中，于 `updatedAt` 之后、`user` relation 之前插入：

```prisma
  pinnedAt   DateTime? @map("pinned_at")
```

并将索引区改为（保留原有索引，追加复合索引）：

```prisma
  @@index([userId])
  @@index([categoryId])
  @@index([type])
  @@index([deletedAt])
  @@index([userId, pinnedAt])
  @@map("notes")
```

完整 `model Note` 应变为：

```prisma
model Note {
  id         String     @id @default(uuid()) @db.Uuid
  userId     String     @map("user_id") @db.Uuid
  categoryId String?    @map("category_id") @db.Uuid
  type       NoteType   @default(DRAFT)
  source     NoteSource @default(APP_MANUAL)
  title      String?    @db.VarChar(256)
  content    String?    @db.Text
  rawContent String?    @map("raw_content") @db.Text
  deletedAt  DateTime?  @map("deleted_at")
  meta       Json?      @db.JsonB
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")
  pinnedAt   DateTime?  @map("pinned_at")

  user     User        @relation(fields: [userId], references: [id])
  category Category?   @relation(fields: [categoryId], references: [id])
  media    NoteMedia[]
  tags     NoteTag[]

  @@index([userId])
  @@index([categoryId])
  @@index([type])
  @@index([deletedAt])
  @@index([userId, pinnedAt])
  @@map("notes")
}
```

- [ ] **Step 2: 生成并应用迁移**

```bash
pnpm exec prisma migrate dev --name add_note_pinned_at
pnpm exec prisma generate
```

Expected:
- 生成 migration，含 `ALTER TABLE "notes" ADD COLUMN "pinned_at" TIMESTAMP(3);` 与 `CREATE INDEX ... ON "notes"("user_id", "pinned_at");`
- `prisma generate` 成功，`@prisma/client` 的 `Note` 含 `pinnedAt`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add notes.pinned_at column and index"
```

---

### Task 2: `QueryNoteDto` 增加 `view`

**Files:**
- Modify: `src/notes/dto/query-note.dto.ts`

- [ ] **Step 1: 增加 `view` 字段**

在 `query-note.dto.ts` 顶部 import 增加 `IsIn`：

```ts
import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
```

在 `mediaType` 字段之后追加：

```ts
  @ApiProperty({
    description: "列表视图：pinned=仅置顶；recent=按创建时间近→远；不传=默认（置顶优先）",
    required: false,
    enum: ["pinned", "recent"],
    example: "pinned",
  })
  @IsOptional()
  @IsIn(["pinned", "recent"])
  view?: "pinned" | "recent";
```

- [ ] **Step 2: Commit**

```bash
git add src/notes/dto/query-note.dto.ts
git commit -m "feat: add view query param to note list DTO"
```

---

### Task 3: `NotesService.pin` + `findAll` view（TDD）

**Files:**
- Create: `src/notes/notes.service.spec.ts`
- Modify: `src/notes/notes.service.ts`

**Interfaces:**
- `pin(id: string, userId?: string): Promise<Note>` — toggle `pinnedAt`
- `findAll(query: QueryNoteDto, userId?: string)` — 按 `view` 调整 where/orderBy

- [ ] **Step 1: 写失败的单测**

创建 `src/notes/notes.service.spec.ts`：

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotesService } from './notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { MediaService } from '../media/media.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

const NOTE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '00000000-0000-0000-0000-000000000001';

const mockPrismaService = {
  note: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

const mockUserService = {};
const mockMediaService = {};

describe('NotesService - pin & findAll view', () => {
  let service: NotesService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UserService, useValue: mockUserService },
        { provide: MediaService, useValue: mockMediaService },
      ],
    }).compile();

    service = module.get(NotesService);
    prisma = module.get(PrismaService);
  });

  describe('pin', () => {
    it('should set pinnedAt when note is not pinned', async () => {
      const base = {
        id: NOTE_ID,
        userId: USER_ID,
        pinnedAt: null,
        deletedAt: null,
        category: null,
        tags: [],
        media: [],
      };
      prisma.note.findFirst.mockResolvedValue(base);
      prisma.note.update.mockResolvedValue({ ...base, pinnedAt: new Date('2026-07-13T10:00:00Z') });

      const result = await service.pin(NOTE_ID, USER_ID);

      expect(prisma.note.update).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
        data: { pinnedAt: expect.any(Date) },
      });
      expect(result.pinnedAt).toBeTruthy();
    });

    it('should clear pinnedAt when note is already pinned', async () => {
      const base = {
        id: NOTE_ID,
        userId: USER_ID,
        pinnedAt: new Date('2026-07-13T09:00:00Z'),
        deletedAt: null,
        category: null,
        tags: [],
        media: [],
      };
      prisma.note.findFirst.mockResolvedValue(base);
      prisma.note.update.mockResolvedValue({ ...base, pinnedAt: null });

      const result = await service.pin(NOTE_ID, USER_ID);

      expect(prisma.note.update).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
        data: { pinnedAt: null },
      });
      expect(result.pinnedAt).toBeNull();
    });

    it('should throw NOTE_NOT_FOUND when note missing', async () => {
      prisma.note.findFirst.mockResolvedValue(null);

      await expect(service.pin(NOTE_ID, USER_ID)).rejects.toThrow(BusinessException);

      try {
        await service.pin(NOTE_ID, USER_ID);
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOTE_NOT_FOUND);
      }
      expect(prisma.note.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll view', () => {
    beforeEach(() => {
      prisma.note.findMany.mockResolvedValue([]);
      prisma.note.count.mockResolvedValue(0);
    });

    it('should order by pinnedAt desc nulls last then createdAt desc by default', async () => {
      await service.findAll({}, USER_ID);

      expect(prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { pinnedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
        }),
      );
      expect(prisma.note.findMany.mock.calls[0][0].where.pinnedAt).toBeUndefined();
    });

    it('should filter pinned only and order by pinnedAt when view=pinned', async () => {
      await service.findAll({ view: 'pinned' }, USER_ID);

      const arg = prisma.note.findMany.mock.calls[0][0];
      expect(arg.where.pinnedAt).toEqual({ not: null });
      expect(arg.orderBy).toEqual({ pinnedAt: 'desc' });
    });

    it('should order by createdAt only when view=recent', async () => {
      await service.findAll({ view: 'recent' }, USER_ID);

      const arg = prisma.note.findMany.mock.calls[0][0];
      expect(arg.where.pinnedAt).toBeUndefined();
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
pnpm exec jest src/notes/notes.service.spec.ts -v
```

Expected: FAIL（`pin` 未定义，或 `findAll` 仍用 `{ createdAt: 'desc' }`）

- [ ] **Step 3: 实现 `pin` 与 `findAll` view 逻辑**

在 `src/notes/notes.service.ts`：

1. 将 `findAll` 替换为：

```ts
  /**
   * 获取笔记列表（分页 + 筛选 + view 维度）
   * @param userId - 可选，传入当前用户 ID；不传则用默认用户
   */
  async findAll(query: QueryNoteDto, userId?: string) {
    const { page = 1, size = 20, type, category, tag, keyword, mediaType, view } = query;
    const skip = (page - 1) * size;
    const uid = userId || DEFAULT_USER_ID;

    const where: Prisma.NoteWhereInput = {
      userId: uid,
      deletedAt: null,
    };

    if (type) where.type = type as $Enums.NoteType;
    if (category) where.categoryId = category;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }
    if (tag) {
      where.tags = { some: { tagId: tag } };
    }
    if (mediaType) {
      where.media = { some: { media: { type: mediaType as $Enums.MediaType } } };
    }
    if (view === 'pinned') {
      where.pinnedAt = { not: null };
    }

    const orderBy: Prisma.NoteOrderByWithRelationInput | Prisma.NoteOrderByWithRelationInput[] =
      view === 'recent'
        ? { createdAt: 'desc' }
        : view === 'pinned'
          ? { pinnedAt: 'desc' }
          : [
              { pinnedAt: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
            ];

    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        skip,
        take: size,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.note.count({ where }),
    ]);

    return { items, total, page, size };
  }
```

2. 在 `archive` 方法之后、`getMedia` 之前插入：

```ts
  /**
   * 置顶 / 取消置顶笔记（toggle）
   */
  async pin(id: string, userId?: string) {
    const note = await this.findById(id, userId);
    return this.prisma.note.update({
      where: { id },
      data: { pinnedAt: note.pinnedAt ? null : new Date() },
    });
  }
```

说明：`findById` 已把 `media` 展平；返回对象仍含 `pinnedAt`。toggle 用真值判断即可（`Date` 为真，`null` 为假）。

- [ ] **Step 4: 跑测试，确认通过**

```bash
pnpm exec jest src/notes/notes.service.spec.ts -v
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/notes/notes.service.ts src/notes/notes.service.spec.ts
git commit -m "feat: implement note pin toggle and list view sorting"
```

---

### Task 4: Controller — `POST /notes/pin`

**Files:**
- Modify: `src/notes/notes.controller.ts`

- [ ] **Step 1: 增加 `pin` 路由**

在 `archive` 方法之后、`media` 之前插入（与 `archive` 风格一致，并传入当前用户）：

```ts
  @Post('pin')
  @ApiOperation({ summary: '置顶或取消置顶笔记' })
  @ApiBody({
    type: IdDto,
    examples: {
      示例: {
        value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功切换置顶状态，data: 更新后的笔记对象（含 pinnedAt）', type: Object })
  async pin(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.pin(body.id, user?.id);
  }
```

- [ ] **Step 2: 确认 `tsc` 可通过**

```bash
pnpm exec tsc --project tsconfig.build.json --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/notes/notes.controller.ts
git commit -m "feat: add POST /notes/pin endpoint"
```

---

### Task 5: 更新 `src/notes/AGENTS.md` + 手工验证

**Files:**
- Modify: `src/notes/AGENTS.md`

- [ ] **Step 1: 更新模块文档**

在 `src/notes/AGENTS.md`：

1. OVERVIEW 段落后补一句：支持置顶（`pinnedAt`）与列表 `view`（`pinned` / `recent` / 默认置顶优先）。

2. STRUCTURE 中 `query-note.dto.ts` 注释改为：`分页 + type/category/tag/keyword/mediaType/view 筛选`

3. WHERE TO LOOK 表增加两行：

| 任务 | 位置 |
|------|------|
| 置顶 / 取消置顶 | `pin(id)` — toggle `pinnedAt` |
| 列表 view 维度 | `findAll` — `view=pinned\|recent`；默认 `pinnedAt` 优先 |

4. ANTI-PATTERNS 增加：

- **不要通过 `update` 写 `pinnedAt`** — 置顶只走 `pin()`

- [ ] **Step 2: 手工 / Swagger 核对（`pnpm start:dev`，端口 3000，`/api/docs`）**

用有效 JWT：

1. `POST /notes/pin` 同一 `id` 三次：`pinnedAt` 为时间 → `null` → 新时间
2. `GET /notes`：置顶在上；多条置顶时后置顶更靠前
3. `GET /notes?view=pinned`：仅置顶；全未置顶时 `items=[]`
4. `GET /notes?view=recent`：纯 `createdAt` 倒序（置顶不抬升）
5. `GET /notes?view=pinned&keyword=...`：叠加正常
6. 对软删 id 调 pin → `code: 30001`
7. `GET /notes?view=bogus` → 400 校验错误

- [ ] **Step 3: Commit**

```bash
git add src/notes/AGENTS.md
git commit -m "docs: document note pin and list view in notes AGENTS.md"
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
| ------- | ---- |
| `pinnedAt` 字段 + 索引 | Task 1 |
| `view` DTO | Task 2 |
| 默认 / pinned / recent 排序与筛选 | Task 3 |
| `POST /notes/pin` toggle | Task 3–4 |
| 任意未删除可置顶、`NOTE_NOT_FOUND` | Task 3 |
| create/update 不写 pinnedAt | 全局约束（未改 create/update） |
| AGENTS.md | Task 5 |
| 手工验证清单 | Task 5 |
| 不做 E2E / 置顶上限 / isPinned | 刻意省略 |
