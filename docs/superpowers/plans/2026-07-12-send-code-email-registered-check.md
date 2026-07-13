# 发送注册验证码前邮箱已注册校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `sendEmailCode` 发码前拦截已注册邮箱，返回 `EMAIL_ALREADY_REGISTERED`，且不写库、不发信。

**Architecture:** 仅在 `AuthService.sendEmailCode` 开头增加 `user.findUnique({ where: { email } })`；已存在则抛 `BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED)`。复用现有错误码 20010，不改 Controller/DTO/MailService。用 TDD：先补单测与现有用例 mock，再写实现。

**Tech Stack:** NestJS 11, Prisma 7, Jest

**Spec:** `docs/superpowers/specs/2026-07-12-send-code-email-registered-check-design.md`

## Global Constraints

- 错误码必须复用 `EMAIL_ALREADY_REGISTERED`（20010），文案「该邮箱已注册」
- 不新增错误码；不改 Controller / DTO / MailService
- 不抽共享 `assertEmailNotRegistered` 方法（本期 YAGNI）
- 邮箱匹配为精确匹配（与 `emailRegister` 一致）
- 保留 `emailRegister` 内既有查重逻辑

## File Map

| 文件 | 职责 |
| ---- | ---- |
| `src/auth/auth.service.ts` | 在 `sendEmailCode` 开头增加已注册校验 |
| `src/auth/auth.service.email.spec.ts` | 新增已注册失败用例；现有发码用例 mock `user.findUnique` → `null` |

---

### Task 1: 发码前邮箱已注册校验（TDD）

**Files:**
- Modify: `src/auth/auth.service.email.spec.ts`（`sendEmailCode` describe）
- Modify: `src/auth/auth.service.ts:102-126`（`sendEmailCode`）
- Test: `src/auth/auth.service.email.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.user.findUnique`、`ErrorCode.EMAIL_ALREADY_REGISTERED`、`BusinessException`
- Produces: `sendEmailCode(email: string): Promise<void>` — 邮箱已注册时抛 `BusinessException`（`code === 20010`）

- [ ] **Step 1: 为已注册场景写失败用例，并修正现有发码用例的 mock**

在 `src/auth/auth.service.email.spec.ts` 的 `describe('sendEmailCode')` 中：

1. 在现有成功用例开头加：

```ts
prisma.user.findUnique.mockResolvedValue(null);
```

2. 在现有 `EMAIL_SEND_FAILED` 用例开头同样加：

```ts
prisma.user.findUnique.mockResolvedValue(null);
```

3. 在该 describe 内新增用例（建议放在成功用例之前）：

```ts
it('should throw EMAIL_ALREADY_REGISTERED when email already exists', async () => {
  prisma.user.findUnique.mockResolvedValue({ id: 'existing-user-id' });

  await expect(service.sendEmailCode('existing@example.com')).rejects.toThrow(
    BusinessException,
  );

  try {
    await service.sendEmailCode('existing@example.com');
  } catch (e) {
    expect(e).toBeInstanceOf(BusinessException);
    expect((e as BusinessException).code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
  }

  expect(prisma.emailVerificationCode.create).not.toHaveBeenCalled();
  expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试，确认新用例失败**

```bash
pnpm exec jest src/auth/auth.service.email.spec.ts --testNamePattern="sendEmailCode" -v
```

Expected:
- 新用例 `should throw EMAIL_ALREADY_REGISTERED when email already exists` → **FAIL**（当前会发码成功，不会抛 20010；或断言 `create`/`sendVerificationCode` 未被调用失败）
- 另两个现有用例在加上 `findUnique → null` 后仍可通过（若未实现前 `findUnique` 返回 `undefined`，成功路径本来也可能过；以新用例 FAIL 为准）

- [ ] **Step 3: 实现 `sendEmailCode` 查重**

修改 `src/auth/auth.service.ts` 的 `sendEmailCode`，在生成验证码之前插入查重。完整方法应变为：

```ts
/**
 * 发送邮箱验证码
 * 已注册邮箱直接报错；否则生成6位随机数字，写入DB并发送邮件
 */
async sendEmailCode(email: string): Promise<void> {
  const existing = await this.prisma.user.findUnique({
    where: { email },
  });
  if (existing) {
    throw new BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED);
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  await this.prisma.emailVerificationCode.create({
    data: {
      email,
      code,
      purpose: 'register',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  try {
    await this.mailService.sendVerificationCode(email, code);
  } catch (error) {
    throw new BusinessException(
      ErrorCode.EMAIL_SEND_FAILED,
      '邮件发送失败，请稍后重试',
    );
  }
}
```

说明：`BusinessException` 与 `ErrorCode` 已在文件顶部 import，无需新增 import。

- [ ] **Step 4: 再跑测试，确认全部通过**

```bash
pnpm exec jest src/auth/auth.service.email.spec.ts -v
```

Expected: `AuthService - Email Methods` 下全部用例 PASS，含：
- `should throw EMAIL_ALREADY_REGISTERED when email already exists`
- `should generate a 6-digit code...`
- `should throw EMAIL_SEND_FAILED when mailService throws`
- 以及既有 `emailRegister` / `emailLogin` 用例

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.email.spec.ts
git commit -m "$(cat <<'EOF'
feat: reject send-code when email already registered

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | 对应步骤 |
| --------- | -------- |
| `sendEmailCode` 发码前查 `User.email` | Task 1 Step 3 |
| 已注册抛 `EMAIL_ALREADY_REGISTERED` | Task 1 Step 3 |
| 不写验证码、不发信 | Task 1 Step 1 断言 + Step 3 |
| 复用错误码 20010 | Task 1 Step 3（无新错误码） |
| 不改 Controller/DTO/Mail | 本计划无对应文件改动 |
| 保留 `emailRegister` 查重 | 本计划不改该方法 |
| 单元测试覆盖已注册 / 未注册 mock | Task 1 Step 1 |

## Self-Review Notes

- 无 TBD/TODO 占位
- 类型与符号与现有代码一致：`BusinessException`、`ErrorCode.EMAIL_ALREADY_REGISTERED`、`prisma.user.findUnique`
- 范围单一，无需拆多 plan
