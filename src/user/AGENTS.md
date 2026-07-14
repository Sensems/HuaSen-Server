# src/user — 用户资料与微信绑定

## OVERVIEW
用户资料 CRUD、绑定码生成、微信空壳 ↔ App 账号合并。微信回调与 Worker 通过 `UserService` 解析 openid；App 端通过 JWT 调用 profile/bind API。

## STRUCTURE
```
user/
├── user.module.ts          # 导出 UserService
├── user.controller.ts      # /user/*（需 JWT）
├── user.service.ts         # 资料、绑定码、mergeWechatToAppUser
└── dto/
    ├── update-profile.dto.ts
    └── bind-user.dto.ts
```

## APIs
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/user/profile` | 当前用户资料（含 `bindingCode`、`wxBound`） |
| POST | `/user/update` | 更新 `nickname` / `avatar`（至少一项） |
| POST | `/user/bind` | App 端用**空壳绑定码**合并微信（限流 10/min） |

## 空壳 vs App 用户
- **空壳（shell）**：仅有 `wxOpenid` + `bindingCode`，**无 `email`**。首次给公众号发消息时由 `findOrCreateByWechat` 创建。
- **App 用户**：邮箱注册后有 `email` + `bindingCode`；绑定成功后挂上 `wxOpenid`。
- 空壳码用于 App「输入绑定码」；App 用户码用于微信端「发送绑定码」反向绑定。

## 绑定码
- `generateBindingCode()`：6 位大写字母数字（排除易混字符 I/O/0/1），唯一；`auth` 注册与 `findOrCreateByWechat` 共用。
- `normalizeBindingCode()`：trim + 大写。

## mergeWechatToAppUser
将 `wxOpenid` 绑到目标 App 用户；若存在空壳则：
1. 迁移 notes（`categoryId` 置空）与 media
2. 删除空壳分类与空壳用户
3. 支持换绑 / 覆盖其他 App 上的同 openid（`overwritten`）

入口：
- App → `bindByShellCode`（空壳码）
- 微信 → `bindOpenidToAppByCode`（App 用户码，由 `WechatService.handleMessage` 同步调用）

## 与 auth / wechat 的关系
| 模块 | 关系 |
|------|------|
| `auth` | 邮箱注册时生成 `bindingCode`；JWT 用户走 `/user/*` |
| `wechat` | 回调内 `findOrCreateByWechat`；文本绑定码同步处理，成功则不入队 |
| `queue` | Worker 只用 `user.id` 归属笔记；绑定引导靠被动回复，不在客服消息重复 |

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 资料/绑定 API | `user.controller.ts` |
| 空壳创建 / 补码 | `findOrCreateByWechat` |
| 合并逻辑 | `mergeWechatToAppUser` |
| 微信侧发码绑定 | `wechat/wechat.service.ts` → `bindOpenidToAppByCode` |
