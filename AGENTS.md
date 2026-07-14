# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-06
**Stack:** NestJS 11 + Fastify + Prisma 7 + PostgreSQL + Redis/BullMQ + TypeScript 6

## OVERVIEW

花森笔记 (Senhua Notes) — 微信公众号驱动的个人笔记系统。用户给公众号发消息 → 服务端自动创建笔记。支持多媒体（图片/语音/视频/文件）异步下载上传七牛云、JWT 认证、分类/标签管理。

## STRUCTURE

```
src/
├── main.ts              # FastifyAdapter bootstrap 
├── app.module.ts        # 根模块（全局 filter/interceptor/guard）
├── common/              # 跨模块基础设施 → see common/AGENTS.md
├── auth/                # JWT + 微信 OAuth → see auth/AGENTS.md
├── wechat/              # 微信消息回调 → see wechat/AGENTS.md
├── notes/               # 笔记 CRUD + 状态流转 → see notes/AGENTS.md
├── categories/          # 分类树 + 拖拽排序 → see categories/AGENTS.md
├── tags/                # 标签 upsert → see tags/AGENTS.md
├── media/               # 媒体生命周期管理 → see media/AGENTS.md
├── user/                # 用户资料 + 微信绑定 → see user/AGENTS.md
├── config/              # 配置（NestJS ConfigService）
├── prisma/              # PrismaService（@Global）
├── queue/               # BullMQ 队列配置 → see queue/AGENTS.md
└── storage/             # 七牛云上传/删除 → see storage/AGENTS.md
```

## WHERE TO LOOK

| 任务          | 位置                                                                            | 注意                          |
| ------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| 添加新 API    | 对应 domain 的 controller.ts                                                    | GET-only 读取，POST-only 写入 |
| 修改数据模型  | `prisma/schema.prisma` → `npx prisma migrate dev`                               |
| 添加认证      | `auth/guards/jwt-auth.guard.ts`，用 `@Public()` 豁免                            |
| 用户资料/绑定 | `src/user` → see `user/AGENTS.md`                                               | profile / update / bind       |
| 微信消息处理  | `wechat/wechat.service.ts` → `queue/processors/wechat-message.processor.ts`     |
| 媒体上传/关联 | `storage/storage.service.ts`（七牛云）→ `media/media.service.ts`（DB 生命周期） |
| 队列/异步任务 | `queue/queue.module.ts` → `queue/processors/`                                   |
| 环境配置      | `.env` → `config/configuration.ts`                                              |

## CONVENTIONS

- **API**: 仅用 `GET` 和 `POST`，路径末尾为动作名（`/create`, `/update`, `/delete`）
- **响应格式**: `{ code: 0, data: ..., message: "ok" }`，错误码见 `common/constants/error-codes.ts`
- **认证**: 全局 JwtAuthGuard，用 `@Public()` 装饰器豁免公开路由（`/auth/*`, `/wechat/*`）
- **用户上下文**: Controller 用 `@CurrentUser()` 取当前用户，传给 Service
- **枚举**: Prisma 原生枚举（大写），`common/enums/` 仅在 DTO 校验用
- **注释**: 所有 public 方法必须写中文 JSDoc 注释
- **Prisma 7**: 必须用 driver adapter（`PrismaPg`），不能直接用 `datasourceUrl`

## ANTI-PATTERNS (THIS PROJECT)

- **不要用 PATCH/DELETE/PUT** — 只用 GET/POST
- **不要直接 `new PrismaClient()`** — 必须通过 `PrismaService` 或传 `adapter: new PrismaPg()`
- **不要在微信回调路径返回 JSON** — `/wechat/*` 必须返回纯文本 `success`
- **不要在 Controller 层做业务逻辑** — Controller 只做参数接收和路由

## COMMANDS

```bash
npx prisma generate          # 生成 Prisma Client
npx prisma migrate dev       # 数据库迁移
npx prisma db seed           # 种子数据
npx tsc --project tsconfig.build.json   # 构建（nest build 有缓存问题）
node dist/main.js            # 启动
npm run test:e2e             # E2E 测试（需要 PostgreSQL + Redis）
```

## NOTES

- `nest build` 有时因 tsbuildinfo 缓存不产出文件，`start:dev` 已指定 `-p tsconfig.build.json`（`incremental: false`）
- 微信去重索引需手动执行 SQL：`CREATE UNIQUE INDEX ... ON notes ((meta->>'wechat_msg_id'))`
- 多媒体上传需要 `WECHAT_APP_SECRET` 获取 access_token
- Redis 不可用时 BullMQ 队列功能不可用，但 REST API 仍正常工作

## Learned User Preferences

- When adapting external UI or email design references, keep the product brand「花森笔记」and only reuse layout/colors—do not copy third-party brand names.
- For new features, prefer a short design brainstorm with explicit options and user approval before writing code.
- For password-reset send-code on unknown emails, prefer explicit `EMAIL_NOT_FOUND` over silent success.
- Prefer implementing directly in the current repo; decline git worktrees when offered for isolation.

## Learned Workspace Facts

- Package manager is pnpm; after `pnpm install`, run `pnpm exec prisma generate`. Under pnpm, Prisma Client needs `.npmrc` public-hoist-pattern entries for `*prisma*` and `*@prisma*` or `@prisma/client` fails to resolve.
- Nest dev server defaults to port 3000; Swagger UI is at `/api/docs`.
- Email sending lives in `src/mail/` (nodemailer SMTP); verification emails use「花森笔记」branding with a coral accent and a large spaced verification code.
- Email auth: `POST /auth/email/send-code` requires `purpose` (`register` | `reset_password`); `POST /auth/email/reset-password` takes email + code + password (field name `password`), returns success without JWT; unknown email → `EMAIL_NOT_FOUND`.
- Note pin: `Note.pinnedAt` (`DateTime?`); `POST /notes/pin` toggles; `GET /notes` optional `view=pinned|recent` (default: pinned first by `pinnedAt`, then `createdAt`; `pinned` = only pinned; `recent` = `createdAt` only). Do not set `pinnedAt` via `update`.
