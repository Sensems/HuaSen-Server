# src/media — 媒体模块

## OVERVIEW
媒体文件生命周期管理 — PENDING/ATTACHED/ORPHAN 状态流转，笔记关联。

## STRUCTURE
```
media/
├── media.module.ts         # standalone，仅依赖 @Global PrismaService
├── media.controller.ts     # /media/* 路由（1 个端点，JWT）
├── media.service.ts        # 生命周期：创建、校验、关联/解绑笔记
└── dto/
    ├── check-media.dto.ts  # 批量校验媒体 ID
    └── index.ts            # barrel re-export
```

## 状态机
```
PENDING ──[attachToNote()]──→ ATTACHED
   │                           │
   │                           └──[detachFromNote()]──→ ORPHAN（无其他笔记关联）
   └── 上传成功但尚未关联笔记         │
                                      └──[attachToNote()]──→ ATTACHED
```
- `PENDING`：上传成功但未关联笔记，可 attach
- `ATTACHED`：已关联笔记，解绑后若无其他关联则变 `ORPHAN`
- `ORPHAN`：无笔记关联，可清理或重新 attach（编辑笔记时 detach→reattach 会走这条路径）

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 上传后创建 Media | `create(params, tx?)` — status 默认 PENDING；可传 `originalFilename` |
| 批量校验归属 | `checkOwnership(mediaIds, userId)` — 校验用户归属 + PENDING 状态 |
| 关联到笔记 | `attachToNote(noteId, mediaIds, userId, tx?)` — 创建 NoteMedia + 改 ATTACHED |
| 解绑笔记媒体 | `detachFromNote(noteId, tx?)` — 删除非 TEXT 的 NoteMedia，孤立变 ORPHAN；TEXT 占位保留 |
| 查询笔记媒体 | `findByNoteId(noteId)` — NoteMedia 关联查询，排除 TEXT 占位 |

## CONVENTIONS
- Service 所有方法支持可选事务参数 `tx?: Prisma.TransactionClient`
- `attachToNote` 前必须 `checkOwnership` 校验归属和可关联状态（PENDING / ORPHAN）
- `detachFromNote` 后调用 `isOrphan` 判断是否需要标记 ORPHAN
- 模块 standalone，不导入其他业务模块，通过 `@Global()` PrismaService 访问 DB

## ANTI-PATTERNS
- **不要直接修改 Media status** — 状态变更走 `attachToNote()` / `detachFromNote()`
- **不要在 Controller 外暴露 `checkOwnership`** — 仅供内部 Service 调用
- **`isOrphan` 是 N+1 查询** — 大量媒体解绑时需留意性能
