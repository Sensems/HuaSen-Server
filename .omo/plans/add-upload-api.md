# add-upload-api - Work Plan

## TL;DR (For humans)

**What you'll get:** 一个服务端直接接收文件上传的 REST 接口 `POST /storage/upload`，支持 multipart/form-data，上传后自动转存七牛云并返回文件 key、URL、类型和大小。

**Why this approach:** 现有系统只有"获取 Token → App 直传七牛云"的间接模式，缺少服务端直接收文件的接口。使用 Fastify 原生 multipart 插件（@fastify/multipart）无需引入 multer，与现有 Fastify 平台保持一致。

**What it will NOT do:**
- 不修改现有的 App 直传 Token 流程
- 不添加文件类型白名单限制（仅做大小限制）
- 不创建 NoteMedia 关联（纯文件上传，返回元数据由调用方决定如何使用）

**Effort:** Short
**Risk:** Low - 依赖现有 StorageService.uploadBuffer，逻辑简单
**Decisions to sanity-check:** 文件大小限制设为 10MB 是否合理？

Your next move: approve and start execution. Full execution detail follows below.

---

> TL;DR (machine): Short effort, Low risk, adds POST /storage/upload multipart endpoint with Fastify + qiniu backend

## Scope
### Must have
- [ ] 安装 @fastify/multipart 依赖
- [ ] 在 main.ts 注册 Fastify multipart 插件
- [ ] 创建 UploadFileResponseDto（上传成功响应）
- [ ] StorageService 新增 `uploadFile(file)` 方法（接收 multipart file → Buffer → 七牛云）
- [ ] StorageController 新增 `POST /storage/upload` 端点（multipart/form-data）
- [ ] Swagger 文档完整（@ApiConsumes + @ApiBody + 响应 DTO）
- [ ] 构建零错误

### Must NOT have (guardrails, anti-slop, scope boundaries)
- 不引入 multer（项目用 Fastify，用 @fastify/multipart）
- 不修改现有 /storage/upload-token 和 /storage/delete 的行为
- 不添加文件类型过滤（仅限制大小）
- 不创建 NoteMedia 记录（纯上传接口）
- 不修改 Prisma schema

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + manual QA with curl
- Evidence: .omo/evidence/task-<N>-add-upload-api.<ext>

## Execution strategy
### Parallel execution waves
Wave 1: 安装依赖（串行，必须先完成）
Wave 2: 代码实现（并行：main.ts 配置 + DTO + Service + Controller）
Wave 3: 验证（构建 + 手动 QA）

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. 安装依赖 | - | 2,3,4,5 | - |
| 2. main.ts 配置 | 1 | - | 3,4,5 |
| 3. DTO 创建 | 1 | - | 2,4,5 |
| 4. Service 方法 | 1 | - | 2,3,5 |
| 5. Controller 端点 | 1,3,4 | - | 2 |
| 6. Swagger 更新 | 2,5 | - | - |
| 7. 构建验证 | 2,3,4,5,6 | - | - |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [x] 1. 安装 @fastify/multipart 依赖
  What to do / Must NOT do: 执行 `npm install @fastify/multipart`，确认 package.json 和 lock 文件更新。Must NOT 安装 multer 或其他上传库。
  Parallelization: Wave 1 | Blocked by: - | Blocks: 2,3,4,5
  References: package.json
  Acceptance criteria: `npm ls @fastify/multipart` 返回已安装
  QA scenarios: 检查 package.json 中新增依赖项
  Commit: Y | feat(storage): add @fastify/multipart dependency

- [x] 2. 在 main.ts 注册 Fastify multipart 插件
  What to do / Must NOT do: 在 bootstrap() 中 `await app.register(require('@fastify/multipart'), { limits: { fileSize: 10 * 1024 * 1024 } })`。Must NOT 修改其他插件配置。
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: -
  References: src/main.ts:15-20
  Acceptance criteria: TypeScript 编译通过，无类型错误
  QA scenarios: 检查 main.ts 中 multipart 注册代码
  Commit: Y | feat(storage): register fastify multipart plugin

- [x] 3. 创建 UploadFileResponseDto
  What to do / Must NOT do: 在 src/storage/dto/ 创建 upload-file-response.dto.ts，包含 key, url, mimeType, size 字段，全部带 @ApiProperty。更新 dto/index.ts barrel。Must NOT 创建请求 DTO（multipart 用 @ApiConsumes 描述）。
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References: src/storage/dto/upload-token-response.dto.ts（参考模式）
  Acceptance criteria: DTO 文件存在，index.ts 正确 re-export
  QA scenarios: 检查 DTO 字段和 Swagger 装饰器
  Commit: Y | feat(storage): add UploadFileResponseDto

- [x] 4. StorageService 新增 uploadFile 方法
  What to do / Must NOT do: 添加 `async uploadFile(file: MultipartFile): Promise<{ key, url, mimeType, size }>` 方法。从 file 读取 buffer，生成 key（`uploads/${Date.now()}_${file.filename}`），调用 uploadBuffer，返回完整信息。Must NOT 删除现有方法。
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References: src/storage/storage.service.ts:43-61（uploadBuffer 参考）
  Acceptance criteria: 方法签名正确，使用现有 uploadBuffer
  QA scenarios: 检查方法实现和错误处理
  Commit: Y | feat(storage): add uploadFile method to StorageService

- [x] 5. StorageController 新增 POST /storage/upload 端点
  What to do / Must NOT do: 添加 `@Post('upload')` 方法，使用 `@ApiConsumes('multipart/form-data')` + `@ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })`，调用 storageService.uploadFile，返回 UploadFileResponseDto。Must NOT 使用 PATCH/PUT/DELETE。
  Parallelization: Wave 2 | Blocked by: 1,3,4 | Blocks: -
  References: src/storage/storage.controller.ts（参考现有端点模式）
  Acceptance criteria: 端点存在，Swagger 文档完整
  QA scenarios: curl -F "file=@test.txt" http://localhost:3000/storage/upload（需要 JWT）
  Commit: Y | feat(storage): add POST /storage/upload endpoint

- [x] 6. 更新 Swagger 标签和验证构建
  What to do / Must NOT do: 在 main.ts Swagger 配置中确认"存储"标签已存在（已存在）。运行 `npx tsc --project tsconfig.build.json` 验证零错误。Must NOT 修改其他标签。
  Parallelization: Wave 3 | Blocked by: 2,3,4,5 | Blocks: -
  References: main.ts:57, tsconfig.build.json
  Acceptance criteria: `npx tsc --project tsconfig.build.json` exit 0
  QA scenarios: 检查 dist/ 目录生成文件
  Commit: Y | feat(storage): verify build passes

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. 代码审查 — 上传逻辑正确，无遗漏字段
- [ ] F2. 构建通过 — TypeScript 编译零错误
- [ ] F3. 功能验证 — multipart 端点可接收文件并返回正确响应
- [ ] F4. 回归测试 — 现有 /storage/upload-token 和 /storage/delete 不受影响

## Commit strategy
每个 todo 独立提交，最终 wave 通过后可选 squash。

## Success criteria
- `POST /storage/upload` 可接收 multipart/form-data 文件上传
- 上传后文件保存到七牛云，返回 key / url / mimeType / size
- Swagger UI 在 `/api/docs` 中正确显示上传端点（含文件选择器）
- `npx tsc --project tsconfig.build.json` 零错误
- 现有存储接口行为不变
