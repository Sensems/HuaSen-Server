# src/auth — 认证模块

## OVERVIEW
JWT + 微信 OAuth 认证：Passport JWT 策略、全局守卫、登录/刷新/登出。

## STRUCTURE
```
auth/
├── auth.module.ts              # JwtModule + PassportModule + ConfigService
├── auth.controller.ts          # /auth/* 路由（全部 @Public）
├── auth.service.ts             # 微信 OAuth → 创建用户 → 签发 JWT + 刷新 + 黑名单
├── guards/jwt-auth.guard.ts    # 全局守卫，跳过 @Public() 标记的路由
└── strategies/jwt.strategy.ts  # Passport JWT 策略 — 验证 Bearer token
```

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| JWT 有效期调整 | `auth.module.ts` → `signOptions.expiresIn` / `auth.service.ts` → `generateTokens` |
| 新增公开路由 | 在 Controller 上加 `@Public()` |
| 获取当前用户 | Controller 参数用 `@CurrentUser()` → Service 传 userId |
| 黑名单机制 | `auth.service.ts` → `blacklistedTokens`（内存 Set，待换 Redis） |

## CONVENTIONS
- 全局 Guard 在 `app.module.ts` 通过 `APP_GUARD` 注册
- JWT payload: `{ sub: userId, openid: wxOpenId }`
- access_token 2h / refresh_token 7d
- 微信 OAuth code → access_token → userinfo → upsert user → JWT

## ANTI-PATTERNS
- **不要直接在 Controller 用 `req.user`** — 用 `@CurrentUser()` 装饰器
- **黑名单用内存 Set** — 生产环境需替换为 Redis
