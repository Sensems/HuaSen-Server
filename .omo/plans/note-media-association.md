# NoteMedia 结构化关联实现

## 目标
将微信多媒体消息的媒体信息从 `Note.meta` JSONB 字段迁移到结构化的 `NoteMedia` 表中，实现一个笔记关联多个媒体、支持按类型筛选的结构化关联。

## 现状
- `NoteMedia` 表已在 Prisma schema 中定义，但**没有任何代码写入该表**
- `WechatMessageProcessor.processMedia()` 将媒体 URL/类型存储在 `note.meta` JSONB 中
- `NotesService.findById()` 和 `getMedia()` 已支持读取 `NoteMedia`

## TODOs

1. [x] 修改 `WechatMessageProcessor.processMedia()` — 上传七牛云后创建 `NoteMedia` 记录
2. [x] 修改 `NotesService.createFromWechat()` — 支持传入媒体数据并创建关联（processor 直接处理，无需修改 Service）
3. [x] 更新 `NotesService.findAll()` — 支持按媒体类型筛选笔记
4. [x] 更新 `NotesService.findById()` — 确保返回的媒体数据完整（含 qiniuKey, mimeType 等）
5. [x] 验证构建通过 — `npx tsc --project tsconfig.build.json` 零错误

## Final Verification Wave
F1. [x] 代码审查 — NoteMedia 创建逻辑正确，无遗漏字段 [APPROVE]
F2. [x] 构建通过 — TypeScript 编译零错误 [APPROVE]
F3. [x] 逻辑验证 — 多媒体消息处理后，数据库中 note + note_media 记录正确关联 [APPROVE]
F4. [x] 回归测试 — 现有笔记查询 API 不受影响 [APPROVE]

## Acceptance Criteria
- [x] 微信图片/语音/视频/文件消息处理后，自动创建 `NoteMedia` 记录
- [x] `NoteMedia` 包含正确的 `type`, `qiniuKey`, `qiniuUrl`, `wxMediaId`, `fileSize`, `mimeType`
- [x] 笔记详情接口返回关联的媒体列表
- [x] 笔记列表支持按媒体类型筛选
- [x] 不影响现有文本消息和纯 meta 存储的笔记

## Evidence
- [x] 数据库查询确认 note_media 表有数据且外键正确
- [x] 构建命令输出（零错误）
- [x] 笔记详情 API 响应包含 media 数组

## Definition of Done
- [x] 所有 TODO 和 Final Verification Wave 的 checkbox 已勾选
- [x] 代码已提交到 git
- [x] 无 LSP/type 错误
- [x] 现有功能不受影响

## Notes
- `NoteMedia` 模型字段：`id`, `noteId`, `type`, `qiniuKey`, `qiniuUrl`, `wxMediaId`, `fileSize`, `mimeType`
- 媒体类型枚举：`IMAGE`, `VOICE`, `VIDEO`, `FILE`
- 七牛云上传返回 `{ key: string }`，URL 通过 `storageService.getPublicUrl(key)` 生成
- 微信下载响应包含 `content-type` header 可用于推断 `mimeType`
- `fileSize` 可从下载的 Buffer length 获取
