# 笔记置顶与列表 view 维度

**日期**: 2026-07-13  
**状态**: 已确认，待实现  
**模块**: `src/notes`

---

## 1. 需求概述

为笔记增加置顶能力，并在列表增加互斥的 `view` 维度：默认（置顶优先）、仅置顶、按创建时间最近。

### 1.1 功能范围

- `Note` 增加 `pinnedAt`（可空时间戳）；非空即已置顶
- `POST /notes/pin`：toggle 置顶（任意未删除笔记）
- `GET /notes` 增加可选查询参数 `view=pinned|recent`
- 默认列表（不传 `view`）：置顶笔记在上，置顶组内按 `pinnedAt` 近→远
- `view=pinned`：仅返回已置顶笔记，按 `pinnedAt` 近→远
- `view=recent`：全量，仅按 `createdAt` 近→远（不抬置顶）
- 更新 `src/notes/AGENTS.md`

### 1.2 不包含

- `create` / `update` 写入 `pinnedAt`（置顶只走 `/pin`）
- 独立 `isPinned` 布尔字段
- 置顶数量上限
- 软删时清理 `pinnedAt`
- 强制本迭代补笔记 E2E（以 Swagger/手工验证为主）

---

## 2. 技术决策

| 决策点 | 选择 | 理由 |
| ------ | ---- | ---- |
| 置顶存储 | `pinnedAt DateTime?` | 同时表达是否置顶与组内排序；避免 bool + 时间双字段 |
| 列表维度 | 单一 `view` 枚举 | 与「默认 / 置顶 / 最近」互斥 UI 一致，无组合歧义 |
| 置顶操作 | `POST /notes/pin` toggle | 与 `publish` / `archive` 一致 |
| 可置顶范围 | 任意未删除笔记 | draft / published / archived 均可 |
| 与其它筛选项 | 可叠加 | `type` / `category` / `tag` / `keyword` / `mediaType` 照常生效 |

曾考虑但未采用：拆成 `pinned` + `sort` 两参数（组合语义更复杂）；仅用 `isPinned` 布尔（无法按置顶时间排序）。

---

## 3. 数据模型

```prisma
model Note {
  // ...existing fields...
  pinnedAt DateTime? @map("pinned_at")

  @@index([userId, pinnedAt])
}
```

- `null` = 未置顶；非 `null` = 已置顶，值为置顶时刻
- 前端用 `pinnedAt != null` 判断是否置顶
- Migration：新增可空列 + 复合索引；存量行默认为 `null`

---

## 4. API 行为

### 4.1 `POST /notes/pin`

- Body：`{ id }`（复用 `IdDto`）
- JWT 必需
- 流程：`findById` → 若 `pinnedAt == null` 则设为 `now()`，否则设为 `null` → 返回更新后的笔记
- 错误：不存在/已软删 → `NOTE_NOT_FOUND`（30001）
- 不按 `type` 限制，不新增错误码

### 4.2 `GET /notes` — `view`

`QueryNoteDto` 新增：

```ts
view?: 'pinned' | 'recent'  // @IsOptional @IsIn(['pinned', 'recent'])
```

| `view` | where 增量 | orderBy |
| ------ | ---------- | ------- |
| 不传（默认） | 无 | `[{ pinnedAt: 'desc' }, { createdAt: 'desc' }]`（Postgres NULLS LAST） |
| `pinned` | `pinnedAt: { not: null }` | `{ pinnedAt: 'desc' }` |
| `recent` | 无 | `{ createdAt: 'desc' }` |

非法 `view` → 400 校验错误。

### 4.3 不变部分

- 列表仍过滤 `deletedAt: null`、按 `userId` 隔离
- 分页 `page` / `size` 不变
- 响应格式仍为 `{ items, total, page, size }`；items 自然带上 `pinnedAt`

---

## 5. 实现落点

| 文件 | 变更 |
| ---- | ---- |
| `prisma/schema.prisma` | `pinnedAt` + 索引 |
| `prisma/migrations/*` | migrate |
| `src/notes/dto/query-note.dto.ts` | `view` 字段 |
| `src/notes/notes.service.ts` | `findAll` 排序/筛选；新增 `pin()` |
| `src/notes/notes.controller.ts` | `POST pin` |
| `src/notes/AGENTS.md` | 文档 |

---

## 6. 测试要点（手工 / Swagger）

1. pin → unpin → 再 pin：`pinnedAt` 从 null → 时间 → null → 新时间
2. 默认列表：置顶在上；置顶组内后置顶者更靠前；未置顶按 `createdAt` 倒序
3. `view=pinned`：仅置顶；无置顶时 `items=[]`
4. `view=recent`：纯 `createdAt` 倒序，置顶笔记不因置顶抬升
5. `view` 与 `type` / `keyword` 叠加正常
6. 软删笔记 pin → `NOTE_NOT_FOUND`

---

## 7. 非目标回顾

不做置顶上限、不做 update 写 `pinnedAt`、不强制本迭代笔记 E2E。
