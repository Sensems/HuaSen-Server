# src/tags — 标签模块

## OVERVIEW
全局标签管理：无用户隔离，通过 NoteTag 多对多关联笔记。提供列表、创建（upsert）、删除。

## STRUCTURE
```
tags/
├── tags.module.ts          # 独立模块，仅依赖全局 PrismaService
├── tags.controller.ts      # /tags/* 路由（3 个端点，全部 JWT）
├── tags.service.ts         # findAll / create（upsert） / delete
└── dto/
    ├── create-tag.dto.ts   # name: string, @MaxLength(32)
    └── index.ts            # barrel re-export
```

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 标签列表 | `findAll()` — 含 `_count.notes` 关联计数 |
| 创建/复用标签 | `create(name)` — 按 name findUnique，存在即返回 |
| 删除标签 | `delete(id)` — 先 `noteTag.deleteMany` 解绑，再删标签 |
| 笔记按标签筛选 | `notes.service.ts` → `query.tag` 字符串匹配 Tag.name |

## CONVENTIONS
- 标签全局共享，无 userId 字段，不区分用户
- 创建采用 upsert 语义：同名标签直接复用，不报错
- 删除自动级联解绑 NoteTag 关联（Prisma 无显式 onDelete，手动先清中间表）

## ANTI-PATTERNS
- **不要把标签当成用户私有** — `findAll` 返回全站标签，创建同名标签会返回已有记录
- **不要绕过 Service 直接操作 NoteTag** — 标签关联变更统一走 `notes.service.ts` 的 update
