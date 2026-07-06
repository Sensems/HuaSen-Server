# App 端笔记媒体关联补全

## 目标
补齐 App 端（手动创建/编辑笔记）与 WeChat 边缘场景下的媒体关联缺失，确保所有笔记创建路径都能正确关联 `NoteMedia` 记录。

## 现状
- `note-media-association` 计划已完成：WeChat 多媒体消息已能正确创建 `NoteMedia`
- **剩余缺口**：
  1. `POST /notes/create`（App 手动创建）—— DTO 无 media 字段，Service 不创建 NoteMedia
  2. `POST /notes/update`（App 编辑）—— DTO 无 media 字段，Service 不处理媒体增删
  3. WeChat 图片只有 `picUrl` 无 `mediaId` —— 不创建 NoteMedia，仅写 JSONB meta
  4. `POST /storage/delete` —— 传的是 `IdDto.id`（UUID），但 `StorageService.deleteFile(key)` 期望 Qiniu key

## TODOs

1. [x] 新增 `NoteMediaItemDto` —— 定义媒体项的数据传输对象（type, qiniuKey, qiniuUrl, fileSize, mimeType）
2. [x] 修改 `CreateNoteDto` —— 添加 `media?: NoteMediaItemDto[]` 字段及校验装饰器
3. [x] 修改 `NotesService.create()` —— 当 dto.media 存在时，通过 `media: { create: [...] }` 创建关联
4. [x] 修改 `UpdateNoteDto` —— 添加 `media?: NoteMediaItemDto[]` 字段及校验装饰器
5. [x] 修改 `NotesService.update()` —— 当 dto.media 存在时，先 deleteMany 旧媒体再 create 新媒体
6. [x] 修改 `WechatMessageProcessor.processMedia()` —— 图片只有 picUrl 时，也创建 NoteMedia（qiniuKey=picUrl, qiniuUrl=picUrl）
7. [x] 修改 `StorageController.delete()` —— 修正参数：接收 `key` 而非 `id`，或修改 DTO 为 `DeleteFileDto`
8. [x] 验证构建通过 —— `npx tsc --project tsconfig.build.json` 零错误

## Final Verification Wave
F1. [x] 代码审查 —— App 创建/更新/WeChat 边缘场景均正确创建 NoteMedia [APPROVE]
F2. [x] 构建通过 —— TypeScript 编译零错误 [APPROVE]
F3. [x] 逻辑验证 —— App 创建笔记带 media 后，数据库 note + note_media 正确关联 [APPROVE]
F4. [x] 回归测试 —— 现有笔记查询 API 不受影响 [APPROVE]

## Acceptance Criteria
- [x] App 手动创建笔记时，可传入 media 数组，自动创建 NoteMedia 记录
- [x] App 编辑笔记时，可传入 media 数组替换已有媒体
- [x] WeChat 图片只有 picUrl 时，也创建 NoteMedia 记录（type=IMAGE, qiniuKey=picUrl, qiniuUrl=picUrl）
- [x] `StorageController.delete()` 正确接收 Qiniu key 并删除文件
- [x] 不影响现有文本消息和纯 meta 存储的笔记

## Evidence
- [x] 数据库查询确认 App 创建的 note_media 表有数据且外键正确
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
- App 上传走直传：客户端先 `GET /storage/upload-token` 获取 token → 直传七牛云 → 拿到 key → 调用 `POST /notes/create` 传入 `{ qiniuKey, qiniuUrl, type }`
- `NotesService.update()` 的媒体替换策略：先 `deleteMany` 旧 `noteTag` 再 `create` 新标签，媒体同理
