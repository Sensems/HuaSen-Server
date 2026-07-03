# src/common — 跨模块基础设施

## OVERVIEW
跨所有业务模块共享的通用代码：错误码、枚举、DTO、异常类、过滤器、拦截器、装饰器。

## STRUCTURE
```
common/
├── constants/error-codes.ts    # ErrorCode 枚举 + 中文 ErrorMessage 映射
├── enums/index.ts               # NoteType/NoteSource/MediaType/UserRole（DTO 校验用）
├── dto/
│   ├── pagination.dto.ts        # 通用分页 DTO（page/size）
│   └── id.dto.ts                # 通用 ID DTO
├── exceptions/business.exception.ts  # BusinessException（统一错误码 + HTTP 200）
├── filters/global-exception.filter.ts # 全局异常 → 统一 JSON / 微信路径返回 success
├── interceptors/response.interceptor.ts # 响应包装 → { code, data, message }
└── decorators/
    ├── public.decorator.ts      # @Public() — 标记路由跳过 JWT 认证
    └── current-user.decorator.ts # @CurrentUser() — 从 req.user 提取当前用户
```

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 新增错误码 | `constants/error-codes.ts` — 按模块前缀分配 |
| 新增通用 DTO | `dto/` — 只放跨模块复用的 |
| 响应格式变更 | `interceptors/response.interceptor.ts` |
| 微信路径白名单 | `filters/global-exception.filter.ts` — `/wechat/*` 前缀判断 |

## CONVENTIONS
- **错误码分段**：`1xxxx` 通用、`2xxxx` 认证、`3xxxx` 笔记、`4xxxx` 分类/标签、`6xxxx` 存储
- **BusinessException** 统一抛 HTTP 200，用 `code` 区分成功/失败
- **枚举值** 必须与 Prisma schema 中一致（大写）
- **DTO 字段** 用 `!` 断言（strictNullChecks 要求）
