# Media 上传原名落库

**日期**: 2026-07-18  
**状态**: 已确认  
**模块**: `prisma` / `src/media` / `src/storage` / `src/notes/dto`

---

## 1. 需求概述

`POST /storage/upload` 上传文件时，持久化用户原始文件名，并在上传响应、笔记详情媒体列表中返回。

### 1.1 功能范围

- Prisma `Media` 新增可选字段 `originalFilename`
- `POST /storage/upload` 从 multipart `file.filename` 写入并返回
- `MediaItemDto` / `UploadFileResponseDto` 暴露该字段
- Migration + 单测覆盖写入路径

### 1.2 不包含

- 修改七牛 `qiniuKey` 生成规则（仍用随机名）
- App 直传登记接口（`POST /storage/register` 等）
- 微信多媒体路径填写原名（保持 `null`）
- 历史数据回填

---

## 2. 技术决策

| 决策点 | 选择 | 理由 |
| ------ | ---- | ---- |
| 落点 | DB 字段 `originalFilename` | 可查询、可展示；不污染对象存储 key |
| 可空 | `String?` | 微信/历史无原名 |
| 长度 | `VarChar(255)` | 覆盖常见文件名；过长截断或拒收由实现取保守截断 |
| 本期路径 | 仅 `POST /storage/upload` | 直传建库接口尚未存在 |

---

## 3. 数据模型

```prisma
model Media {
  // ...existing...
  originalFilename String? @map("original_filename") @db.VarChar(255)
}
```

---

## 4. 行为

### 4.1 `POST /storage/upload`

1. `uploadFile` 仍生成随机 key
2. `mediaService.create` 增加 `originalFilename: file.filename`（空串按 `null`）
3. 响应增加 `originalFilename`

### 4.2 读取

- 详情 / `GET /notes/media` 返回的 Media 含 `originalFilename`（Prisma 字段自动带出；Swagger DTO 补文档）

### 4.3 其它路径

- 微信 processor、TEXT 占位：不传该字段 → `null`
- `GET /storage/upload-token`：不变

---

## 5. 验收标准

- [ ] 上传名为 `报告.pdf` 的文件 → DB 与响应 `originalFilename === "报告.pdf"`
- [ ] 笔记详情 / 媒体列表可见该字段
- [ ] 微信多媒体 `originalFilename` 为 `null`
- [ ] 既有上传测试通过；新增原名相关单测
