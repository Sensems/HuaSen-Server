# src/categories — 分类模块

## OVERVIEW
树形分类结构（最多 3 层），同级内按 `sortOrder` 排序，支持拖拽重排和递归删除。

## STRUCTURE
```
categories/
├── categories.module.ts
├── categories.controller.ts   # /categories/* 路由（5 个端点，全部 JWT）
├── categories.service.ts      # CRUD + buildTree + depthCheck + reorder
└── dto/
    ├── create-category.dto.ts
    ├── update-category.dto.ts
    ├── reorder-category.dto.ts # @ValidateNested items[]
    ├── category.dto.ts         # 响应 DTO（含 children[]）
    └── index.ts                # barrel re-export
```

## 树形构建
- `findAll` 返回嵌套树：`buildTree()` 将扁平列表转为 `{ ...cat, children: [] }`
- 自引用关系 `CategoryHierarchy`（`parentId` → 同一张表）
- 每层按 `sortOrder` asc 排序

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 获取树形列表 | `findAll` → `buildTree` |
| 创建分类 | `create(dto)` — 自动 `sortOrder = last + 1`，检查层深 |
| 更新分类 | `update(dto)` — 不可设自己为 parent |
| 删除分类 | `delete(id)` — 递归删子孙，解绑所有关联笔记（设 categoryId=null）|
| 拖拽排序 | `reorder(dto)` — 事务批量更新 `sortOrder` + `parentId` |
| 层深限制 | `checkDepth(parentId, depth)` — 递归向上查，depth≥3 抛 `CATEGORY_DEPTH_EXCEEDED` |

## CONVENTIONS
- 首次创建同级分类时 sortOrder 从 0 开始
- 删除分类时**仅解除关联**笔记（设 `categoryId = null`），不删笔记
- DTO 使用 `@ValidateNested` + `@Type(() => ...)` 校验嵌套对象

## ANTI-PATTERNS
- **不要超过 3 层** — `checkDepth` 会在 depth≥3 时拒绝
- **不要把 `buildTree` 的 `any[]` 到处复制** — 应定义 `CategoryWithChildren` 接口
- **不要在 Controller 层拼树** — 树形由 Service 的 `buildTree` 负责
