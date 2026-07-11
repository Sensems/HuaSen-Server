# 发送注册验证码前邮箱已注册校验

**日期**: 2026-07-12  
**状态**: 已确认，待实现  
**关联**: [邮箱认证功能设计](./2026-07-10-email-auth-design.md)

---

## 1. 需求概述

在发送注册验证码（`POST /auth/email/send-code`）时，先检查目标邮箱是否已注册。若已注册，返回业务错误，不写入验证码、不发送邮件。

### 1.1 功能范围

- `AuthService.sendEmailCode` 在生成验证码之前查询 `User.email`
- 已存在则抛出 `EMAIL_ALREADY_REGISTERED`（20010，文案「该邮箱已注册」）
- 补充对应单元测试

### 1.2 不包含

- 新错误码或新文案
- Controller / DTO / MailService 变更
- 密码重置等其他 `purpose` 的发码逻辑
- 邮箱大小写规范化（沿用现有精确匹配）

---

## 2. 技术决策

| 决策点   | 选择                                      | 理由                                           |
| -------- | ----------------------------------------- | ---------------------------------------------- |
| 校验位置 | `AuthService.sendEmailCode` 方法开头      | 与 `emailRegister` 查重方式一致；Controller 不做业务 |
| 错误码   | 复用 `EMAIL_ALREADY_REGISTERED`（20010）  | 与注册接口一致，前端可统一处理                 |
| 抽取复用 | 本期不抽共享方法                          | 改动面最小；两处逻辑各自独立即可               |
| 注册侧   | 保留 `emailRegister` 内既有查重           | 双保险，防止绕过发码直接调注册                 |

---

## 3. 流程

```
客户端 POST /auth/email/send-code { email }
        │
        ▼
AuthService.sendEmailCode(email)
        │
        ├─ user.findUnique({ where: { email } })
        │     │
        │     ├─ 存在 → throw BusinessException(EMAIL_ALREADY_REGISTERED)
        │     │         （不写库、不发信）
        │     │
        │     └─ 不存在 → 生成 6 位码 → 写 EmailVerificationCode → 发信
        │
        ▼
成功：{ code: 0, data: null/undefined, message: "ok" }
失败：{ code: 20010, message: "该邮箱已注册" }
```

---

## 4. 实现要点

### 4.1 `sendEmailCode` 变更

在现有「生成码 → create → send」之前插入：

```ts
const existing = await this.prisma.user.findUnique({
  where: { email },
});
if (existing) {
  throw new BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED);
}
```

查询字段与 `emailRegister` 保持一致（按 `email` 唯一索引精确匹配）。

### 4.2 不变部分

- 路由：`POST /auth/email/send-code`（`@Public`）
- 限流：现有 Throttler 行为不变
- 验证码：仍为 6 位数字、10 分钟有效、`purpose: 'register'`
- 发信失败：仍抛 `EMAIL_SEND_FAILED`

---

## 5. 测试

在 `auth.service.email.spec.ts` 的 `sendEmailCode` describe 中：

| 用例 | 期望 |
| ---- | ---- |
| 邮箱已存在 | 抛 `BusinessException`，`code === EMAIL_ALREADY_REGISTERED`；不调用 `emailVerificationCode.create`；不调用 `mailService.sendVerificationCode` |
| 邮箱不存在（现有成功用例） | mock `user.findUnique` → `null`，其余断言保持不变 |
| 发信失败（现有用例） | mock `user.findUnique` → `null`，其余断言保持不变 |

---

## 6. 验收标准

1. 已注册邮箱调用发码接口 → `code: 20010`，`message: "该邮箱已注册"`
2. 未注册邮箱调用发码接口 → 行为与现网一致（写库并发信）
3. 已注册场景下 DB 无新增 `email_verification_codes` 记录、无外发邮件
4. 相关单元测试通过
