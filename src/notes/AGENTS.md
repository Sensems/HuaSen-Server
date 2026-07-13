# src/notes — 笔记模块

## OVERVIEW
笔记 CRUD + 状态流转（draft → published → archived）+ 微信消息去重插入。支持多媒体关联、分类/标签筛选、软删除。支持置顶（`pinnedAt`）与列表 `view`（`pinned` / `recent` / 默认置顶优先）。

## STRUCTURE
```
notes/
├── notes.module.ts         # 导入 UserModule，导出 NotesService
├── notes.controller.ts     # /notes/* 路由（12 个端点，全部 JWT）
├── notes.service.ts        # CRUD + 发布/归档/置顶 + createFromWechat（内部）
└── dto/
    ├── create-note.dto.ts
    ├── update-note.dto.ts
    ├── query-note.dto.ts   # 分页 + type/category/tag/keyword/mediaType/view 筛选
    └── index.ts            # barrel re-export
```

## 状态机
```
DRAFT ──[publish()]──→ PUBLISHED ──[archive()]──→ ARCHIVED
                          ↑                           │
                          └───[archive() 再次]────────┘（toggle 回 PUBLISHED）
```
- `DRAFT`：仅可 publish，**不能** archive
- `PUBLISHED` ↔ `ARCHIVED`：toggle
- 删除走软删除 `deletedAt`，不改变 type

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 笔记列表/详情 | `findAll` / `findById` — 带分类/标签 include |
| 创建笔记（手动）| `create(dto)` — App 端和剪贴板 |
| 创建笔记（微信）| `createFromWechat(params)` — 内部调用，msgId 去重 |
| 状态变更 | `publish(id)` / `archive(id)` — 含前置校验 |
| 置顶 / 取消置顶 | `pin(id)` — toggle `pinnedAt` |
| 列表 view 维度 | `findAll` — `view=pinned\|recent`；默认 `pinnedAt` 优先 |
| 标签变更 | `update(dto)` — 先 `deleteMany` 再 `create` NoteTag |
| 获取媒体 | `getMedia(noteId)` — NoteMedia 关联查询 |

## CONVENTIONS
- 微信去重用 `meta.wechat_msg_id` JSONB 路径 + DB 唯一索引
- `createFromWechat` 发现重复直接返回已有笔记（幂等）
- 标题为空时自动从 content 截取前 100 字符（去换行）
- 软删除不暴露 deletedAt 查询，`findAll` 默认过滤 `deletedAt: null`

## ANTI-PATTERNS
- **不要直接改 type 枚举** — 状态变更走 `publish()` / `archive()`，它们有前置校验
- **不要通过 `update` 写 `pinnedAt`** — 置顶只走 `pin()`
- **不要把 `meta` JSONB 当自由字段用** — 目前只存 `wechat_msg_id` + `wechat_create_time`
- **`dto.source as unknown as $Enums.NoteSource` 多余** — DTO 已校验，直接用 `dto.source`
