# 添加 Swagger 支持

## 目标

为森花笔记后端服务添加 Swagger/OpenAPI 文档支持，使所有 API 可通过 `/api/docs` 访问并带有完整的请求/响应说明。

## TODOs

1. [x] 安装 Swagger 依赖包
2. [x] 配置 Swagger 文档（main.ts + 文档元数据）
3. [x] 为 Auth 模块添加 Swagger 装饰器
4. [x] 为 Notes 模块添加 Swagger 装饰器
5. [x] 为 Categories 模块添加 Swagger 装饰器
6. [x] 为 Tags 模块添加 Swagger 装饰器
7. [x] 为 Storage 模块添加 Swagger 装饰器
8. [x] 为 Wechat 模块添加 Swagger 装饰器
9. [x] 验证 Swagger UI 可正常访问且文档完整

## Final Verification Wave

F1. [x] 代码审查 — 所有 Controller/DTO 均带 Swagger 装饰器，无遗漏
F2. [x] 构建通过 — `npx tsc --project tsconfig.build.json` 零错误
F3. [x] 功能验证 — Swagger UI 在 `/api/docs` 可访问，所有接口文档完整
F4. [x] 回归测试 — 现有 E2E 测试不受影响

## Acceptance Criteria

- [x] 访问 `http://localhost:3000/api/docs` 可看到 Swagger UI
- [x] 所有 Controller 的每个路由都有 `ApiOperation` 描述
- [x] 所有 DTO 的字段都有 `ApiProperty` 描述
- [x] 认证接口在 Swagger 中可配置 Bearer Token
- [x] 不影响现有 API 功能

## Evidence

- [x] Swagger UI 截图或 curl 访问 `/api/docs-json` 的 JSON 输出
- [x] 构建命令输出（零错误）
- [x] E2E 测试通过记录

## Definition of Done

- [x] 所有 TODO 和 Final Verification Wave 的 checkbox 已勾选
- [x] 代码已提交到 git（如使用 worktree）
- [x] 无 LSP/type 错误
- [x] Swagger 文档在生产环境可正常访问

## Notes

- 使用 `@nestjs/swagger` v11（与 NestJS 11 兼容）
- Fastify 平台需要使用 `@nestjs/platform-fastify` 对应的 swagger 配置方式
- 微信回调接口（`/wechat/*`）返回纯文本，Swagger 装饰器不影响其行为
- 公开路由（`@Public()`）应在 Swagger 中标记为无需认证
