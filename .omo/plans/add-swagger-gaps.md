# 查漏补缺 Swagger 配置 — v2

## 目标

补齐所有模块缺失的 Swagger 装饰器：Controller 的 `@ApiOperation`/`@ApiResponse`/`@ApiBody`/`@ApiQuery`，DTO 的 `@ApiProperty`（含 `example`），使 `/api/docs` 上所有接口文档完整可读。

## 影响范围

- **公共 DTO**：`IdDto`、`PaginationDto` — 缺 `@ApiProperty`
- **categories**：Controller 0 装饰器 + 3 个 DTO 缺 `@ApiProperty`
- **tags**：Controller 0 装饰器 + 1 个 DTO 缺 `@ApiProperty`
- **auth**：Controller 0 装饰器 + `@Body('code')` 改为 DTO 参数
- **notes**：缺响应 `type`/`example`、`@ApiBody`（delete/publish/archive）
- **storage**：缺 `@ApiUnauthorizedResponse`、`@ApiBadRequestResponse`、body/response `examples`
- **wechat**：缺 `@ApiTags('微信')`
- **media**：✅ 已完整，无需修改

## TODOs

> Wave 1: 公共 DTO（被多个模块依赖，必须先完成）

- [x] 1. 补全 `src/common/dto/id.dto.ts` 的 `@ApiProperty`
  What: 给 `id` 字段加 `@ApiProperty({ description, example, type: 'string', required: true })`
  Files: `src/common/dto/id.dto.ts`
  Blocks: categories/tags/notes delete 端点

- [x] 2. 补全 `src/common/dto/pagination.dto.ts` 的 `@ApiProperty`
  What: 给 `page`、`size` 字段加 `@ApiProperty({ description, example })`
  Files: `src/common/dto/pagination.dto.ts`
  Blocks: 所有列表接口

> Wave 2: 完全缺失模块（互不依赖，可并行）

- [x] 3. 补全 `src/categories/` 模块 Swagger（Controller + 3 个 DTO）
  What:
    - Controller: `@ApiTags('分类')` + `@ApiBearerAuth('JWT-auth')` + 5 个方法各加 `@ApiOperation`/`@ApiResponse`/`@ApiBody`
    - DTO: `create-category.dto.ts`（name, parentId）、`update-category.dto.ts`（id, name, parentId）、`reorder-category.dto.ts`（items 数组含 ReorderItem.id/parentId）
  Files: `src/categories/categories.controller.ts`, `src/categories/dto/*.dto.ts`
  Reference: `src/notes/notes.controller.ts`

- [x] 4. 补全 `src/tags/` 模块 Swagger（Controller + 1 个 DTO）
  What:
    - Controller: `@ApiTags('标签')` + `@ApiBearerAuth('JWT-auth')` + 3 个方法各加 `@ApiOperation`/`@ApiResponse`/`@ApiBody`
    - DTO: `create-tag.dto.ts`（name 字段加 @ApiProperty）
  Files: `src/tags/tags.controller.ts`, `src/tags/dto/create-tag.dto.ts`
  Reference: `src/notes/notes.controller.ts`

- [x] 5. 补全 `src/auth/` 模块 Swagger（Controller）
  What:
    - Controller: `@ApiTags('认证')` + 3 个方法各加 `@ApiOperation`/`@ApiResponse`/`@ApiBody`
    - `wechatLogin`: 改用 `@Body() body: WechatCallbackDto`（替代 `@Body('code')`）
    - `refresh`: 改用 `@Body() body: RefreshTokenDto`（替代 `@Body('refreshToken')`）
    - `logout`: 加 `@ApiBearerAuth()`，改用 `@CurrentUser()` 替代 `@Req()`
  Files: `src/auth/auth.controller.ts`
  DTOs 已有完整 @ApiProperty，不需改

- [x] 6. 补全 `src/wechat/` 模块最小 Swagger
  What: 加 `@ApiTags('微信')`，不加其他装饰器（微信回调返回纯文本）
  Files: `src/wechat/wechat.controller.ts`

> Wave 3: 查漏补缺（互不依赖，可并行）

- [x] 7. 补全 `src/notes/` 模块 Swagger 示例和错误响应
  What:
    - `@ApiResponse` 加 `type` 和 `example`（所有 9 个方法）
    - `delete`/`publish`/`archive` 加 `@ApiBody({ type: IdDto })`（含 example）
    - `detail`/`share` 移除冗余的 `@ApiQuery`（IdDto 补齐后会自动推导）
  Files: `src/notes/notes.controller.ts`
  Reference: 保留现有装饰器风格，只补缺口

- [x] 8. 补全 `src/storage/` 模块错误响应和示例
  What:
    - 所有方法加 `@ApiUnauthorizedResponse`/`@ApiBadRequestResponse`
    - `@ApiBody`/`@ApiResponse` 加 `examples`（完整 JSON 请求/响应）
  Files: `src/storage/storage.controller.ts`
  Reference: 保留现有装饰器风格，只补缺口

## Final Verification Wave

F1. [x] 构建验证 — `npx tsc --project tsconfig.build.json` 零错误
F2. [x] LSP 诊断 — N/A（tsc 已验证零错误）
F3. [x] Swagger UI 验证 — 所有模块端点文档完整显示
F4. [x] 对比审计 — 确认 7 个 audit 报告的缺口全部修复

## Acceptance Criteria

- [x] categories 模块在 Swagger UI 中可见 5 个端点
- [x] tags 模块在 Swagger UI 中可见 3 个端点
- [x] auth 模块在 Swagger UI 中可见 3 个端点（含 Bearer Token 配置）
- [x] notes 模块 9 个端点都有 response type 和 example
- [x] storage 模块 3 个端点都有 401/400 错误响应文档
- [x] wechat 模块在 Swagger UI 至少可见标签
- [x] IdDto 和 PaginationDto 的字段在 Swagger 中正确显示
- [x] 构建零错误

## Notes

- 所有 public 方法需中文 JSDoc（项目规范）
- 响应统一 envelope `{ code, data, message }`
- 遵循 AGENTS.md 反模式约束（特别是 auth 的 @Req vs @CurrentUser）
