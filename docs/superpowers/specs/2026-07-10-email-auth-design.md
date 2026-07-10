# 邮箱认证功能设计文档

**日期**: 2026-07-10
**状态**: 已确认，待实现
**关联**: 微信绑定功能（后续扩展）

---

## 1. 需求概述

为森华笔记添加邮箱注册和邮箱登录功能，作为微信登录之外的独立认证渠道。未来支持微信账号与邮箱账号的互相绑定（通过 bindingCode 机制），本期仅实现邮箱注册/登录核心流程。

### 1.1 功能范围（本期）

- 发送邮箱验证码（Resend API）
- 邮箱 + 密码 + 验证码注册
- 邮箱 + 密码登录
- 注册时自动生成 bindingCode，为未来微信绑定预留
- IP 限流保护验证码发送接口

### 1.2 不包含（后续扩展）

- 微信绑定码的回调处理
- 密码重置/找回
- 邮箱变更

---

## 2. 技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 架构方案 | Auth 模块扩展 + 独立 Mail 模块 | 复用 generateTokens，邮件发送隔离可测 |
| 邮件服务 | Resend API | 免费额度 100封/天，SDK 轻量 |
| 验证码存储 | Prisma 数据库表 | 与现有 DB-first 模式一致，无需新建 Redis 服务 |
| 注册流程 | 两步注册（发码 → 注册） | 简洁，一次交互完成 |
| 密码策略 | ≥8位，必须包含字母和数字 | 适度安全，不过度复杂 |
| 验证码格式 | 6位数字，10分钟有效 | 简单，用户体验好 |
| 限流策略 | IP 限流（@nestjs/throttler） | 实现简单，覆盖主要滥用场景 |
| 账号模型 | 统一 User 表，email/wxOpenid 均可空 | 同一用户可同时拥有两种身份 |

---

## 3. 数据模型

### 3.1 User 表新增字段

```prisma
model User {
  // --- 现有字段 ---
  id         String     @id @default(uuid()) @db.Uuid
  wxOpenid   String?    @unique @map("wx_openid") @db.VarChar(64)
  wxUnionid  String?    @map("wx_unionid") @db.VarChar(64)
  nickname   String?    @db.VarChar(64)
  avatar     String?    @db.VarChar(512)
  role       UserRole   @default(ADMIN)
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")

  // --- 新增字段 ---
  email           String?    @unique @map("email") @db.VarChar(255)
  passwordHash    String?    @map("password_hash") @db.VarChar(255)
  bindingCode     String?    @unique @map("binding_code") @db.VarChar(8)

  // --- 关联 ---
  notes              Note[]
  categories         Category[]
  media              Media[]
  verificationCodes  EmailVerificationCode[]

  @@map("users")
}
```

**字段说明**：

- `email`：可空，有值时唯一。微信用户无 email，邮箱用户无 wxOpenid。未来绑定后两者可共存。
- `passwordHash`：bcrypt 哈希结果（固定 60 字符），仅邮箱用户有值。
- `bindingCode`：6 位大写字母数字组合（如 `XA4B3R`），注册时自动生成。唯一约束保证不重复。用于未来微信绑定。

### 3.2 EmailVerificationCode 表（新建）

```prisma
model EmailVerificationCode {
  id        String    @id @default(uuid()) @db.Uuid
  email     String    @map("email") @db.VarChar(255)
  code      String    @map("code") @db.VarChar(6)
  purpose   String    @map("purpose") @db.VarChar(16)
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([email])
  @@index([expiresAt])
  @@map("email_verification_codes")
}
```

**字段说明**：

- `email`：接收验证码的邮箱地址。不关联 User 表（注册时用户尚不存在）。
- `code`：6 位纯数字验证码。
- `purpose`：验证码用途。当前值 `'register'`，为密码重置等场景预留。
- `expiresAt`：过期时间 = 创建时间 + 10 分钟。
- `usedAt`：使用时间。非空表示已使用，防止验证码重用。

**验证码校验逻辑**：
```sql
SELECT * FROM email_verification_codes
WHERE email = ? AND code = ? AND purpose = 'register'
  AND used_at IS NULL AND expires_at > NOW()
ORDER BY created_at DESC LIMIT 1
```

---

## 4. 错误码

在 `src/common/constants/error-codes.ts` 2xxxx 认证区块新增：

```typescript
// 邮箱认证错误
EMAIL_ALREADY_REGISTERED   = 20010,  // 该邮箱已注册
EMAIL_NOT_FOUND            = 20011,  // 该邮箱未注册
VERIFICATION_CODE_INVALID  = 20012,  // 验证码错误
VERIFICATION_CODE_EXPIRED  = 20013,  // 验证码已过期
PASSWORD_INCORRECT         = 20014,  // 密码错误
EMAIL_SEND_FAILED          = 20015,  // 邮件发送失败

// ErrorMessage 映射
[ErrorCode.EMAIL_ALREADY_REGISTERED]: '该邮箱已注册',
[ErrorCode.EMAIL_NOT_FOUND]: '该邮箱未注册',
[ErrorCode.VERIFICATION_CODE_INVALID]: '验证码错误',
[ErrorCode.VERIFICATION_CODE_EXPIRED]: '验证码已过期，请重新获取',
[ErrorCode.PASSWORD_INCORRECT]: '密码错误',
[ErrorCode.EMAIL_SEND_FAILED]: '邮件发送失败，请稍后重试',
```

---

## 5. 环境变量与配置

### 5.1 新增环境变量（.env / .env.example）

```env
# Resend 邮件服务
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=森华笔记 <noreply@your-domain.com>

# 限流配置（可选，有默认值）
THROTTLE_TTL=60000
THROTTLE_LIMIT=1
```

### 5.2 配置命名空间（src/config/configuration.ts）

```typescript
emailConfig: registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY || '',
  from: process.env.EMAIL_FROM || '森华笔记 <noreply@example.com>',
})),
throttleConfig: registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT || '1', 10),
})),
```

---

## 6. API 设计

约定：遵循项目现有的 GET-only 读取、POST-only 写入、路径末尾为动作名、响应格式 `{ code, data, message }`。

### 6.1 发送验证码

```
POST /auth/email/send-code
Auth: @Public()
Throttle: 同一 IP 60秒内最多 1 次
```

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**DTO 校验**：
- `email`：`@IsEmail()`, `@IsNotEmpty()`，`!:` 断言

**成功响应**：
```json
{ "code": 0, "message": "ok", "data": null }
```

**错误响应**：
```json
{ "code": 20015, "message": "邮件发送失败，请稍后重试", "data": null }
{ "code": 10003, "message": "请求过于频繁", "data": null }
```

**处理逻辑**：
1. IP 限流检查（`@Throttle({ default: { limit: 1, ttl: 60000 } })`）
2. 生成 6 位随机数字验证码
3. 写入 `email_verification_codes` 表（`purpose='register'`, `expiresAt = now + 10min`）
4. 调用 `MailService.sendVerificationCode(email, code)` 发送邮件
5. 返回成功（不返回验证码内容）

**注意**：同一邮箱重复发码时，不覆盖旧记录。允许短时间内多条未过期验证码共存，任一可用。

### 6.2 邮箱注册

```
POST /auth/email/register
Auth: @Public()
```

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "Abc12345",
  "code": "482931"
}
```

**DTO 校验**：
- `email`：`@IsEmail()`, `@IsNotEmpty()`
- `password`：`@IsString()`, `@MinLength(8)`, `@Matches(/^(?=.*[a-zA-Z])(?=.*\d)/)`
- `code`：`@IsString()`, `@Length(6, 6)`
- 全部使用 `!:` 断言

**成功响应**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 7200
  }
}
```

**错误响应**：
```json
{ "code": 20010, "message": "该邮箱已注册", "data": null }
{ "code": 20012, "message": "验证码错误", "data": null }
{ "code": 20013, "message": "验证码已过期，请重新获取", "data": null }
```

**处理逻辑**：
1. 检查邮箱是否已注册（`User.findUnique({ where: { email } })`）
2. 校验验证码（查 `email_verification_codes` 表，匹配 `email + code + purpose='register' + usedAt IS NULL + expiresAt > now()` 的最新一条）
3. 标记验证码已使用（`UPDATE email_verification_codes SET used_at = NOW()`）
4. 密码哈希（`bcrypt.hash(password, 10)`）
5. 生成 bindingCode（6 位大写字母数字，排除易混淆字符 I/O/0）
6. 创建 User（`email, passwordHash, bindingCode, role = USER`）
7. 调用 `generateTokens(userId, '')` 返回 JWT

### 6.3 邮箱登录

```
POST /auth/email/login
Auth: @Public()
```

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "Abc12345"
}
```

**DTO 校验**：
- `email`：`@IsEmail()`, `@IsNotEmpty()`
- `password`：`@IsString()`, `@IsNotEmpty()`
- 全部使用 `!:` 断言

**成功响应**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 7200
  }
}
```

**错误响应**：
```json
{ "code": 20011, "message": "该邮箱未注册", "data": null }
{ "code": 20014, "message": "密码错误", "data": null }
```

**处理逻辑**：
1. 查 User by email（`User.findUnique({ where: { email } })`）
2. 不存在 → 抛 `EMAIL_NOT_FOUND`
3. bcrypt.compare(password, user.passwordHash)
4. 不匹配 → 抛 `PASSWORD_INCORRECT`
5. 调用 `generateTokens(userId, '')` 返回 JWT

---

## 7. 模块结构

### 7.1 新增文件

```
src/mail/                              ← 新建模块
├── mail.module.ts                     ← @Global(), exports MailService
└── mail.service.ts                    ← sendVerificationCode()

src/auth/dto/                          ← 新建 DTO
├── email-send-code.dto.ts
├── email-register.dto.ts
└── email-login.dto.ts
```

### 7.2 修改文件

| 文件 | 变更 |
|---|---|
| `prisma/schema.prisma` | User +3字段，+EmailVerificationCode 表 |
| `src/common/constants/error-codes.ts` | +6 错误码 + ErrorMessage |
| `src/config/configuration.ts` | +emailConfig, +throttleConfig |
| `src/auth/auth.module.ts` | imports 加 MailModule, ThrottlerModule |
| `src/auth/auth.controller.ts` | +3 路由（send-code, register, login） |
| `src/auth/auth.service.ts` | +sendEmailCode, emailRegister, emailLogin |
| `src/auth/strategies/jwt.strategy.ts` | JwtPayload +email?, validate() 加 email |
| `src/common/decorators/current-user.decorator.ts` | CurrentUserInfo +email? |
| `src/app.module.ts` | imports 加 MailModule, ThrottlerModule（APP_GUARD） |
| `.env` / `.env.example` | +3 环境变量 |

### 7.3 新增依赖

```
npm i resend bcrypt @nestjs/throttler
```

| 包 | 版本 | 用途 |
|---|---|---|
| `resend` | ^4.x | Resend 邮件发送 SDK |
| `bcrypt` | ^5.x | 密码哈希与校验 |
| `@nestjs/throttler` | ^6.x | IP 限流 |

---

## 8. 核心逻辑细节

### 8.1 MailService

```typescript
// src/mail/mail.service.ts
@Injectable()
export class MailService {
  constructor(private configService: ConfigService) {}

  /**
   * 发送邮箱验证码
   * @param email 目标邮箱
   * @param code 6位验证码
   */
  async sendVerificationCode(email: string, code: string): Promise<void> {
    const resend = new Resend(this.configService.get<string>('email.resendApiKey'));
    const { error } = await resend.emails.send({
      from: this.configService.get<string>('email.from'),
      to: email,
      subject: '森华笔记 - 邮箱验证码',
      html: `<p>您的验证码是：<strong>${code}</strong>，10分钟内有效。</p>`,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}
```

### 8.2 AuthService 新增方法

```typescript
/**
 * 发送邮箱验证码
 * 1. 生成6位随机数字 → 2. 写入DB → 3. 发送邮件
 */
async sendEmailCode(email: string): Promise<void> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await this.prisma.emailVerificationCode.create({
    data: {
      email,
      code,
      purpose: 'register',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await this.mailService.sendVerificationCode(email, code);
}

/**
 * 邮箱注册
 * 校验邮箱唯一性 → 校验验证码 → 标记已用 → 哈希密码 → 创建用户 → 返回JWT
 */
async emailRegister(dto: EmailRegisterDto): Promise<TokenResponseDto> {
  const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw new BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED);

  const verification = await this.prisma.emailVerificationCode.findFirst({
    where: {
      email: dto.email,
      code: dto.code,
      purpose: 'register',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!verification) {
    // 区分是错误码还是过期：重新查询不限制 expiresAt
    const anyForEmail = await this.prisma.emailVerificationCode.findFirst({
      where: { email: dto.email, code: dto.code, purpose: 'register', usedAt: null },
    });
    throw new BusinessException(
      anyForEmail ? ErrorCode.VERIFICATION_CODE_EXPIRED : ErrorCode.VERIFICATION_CODE_INVALID,
    );
  }

  await this.prisma.emailVerificationCode.update({
    where: { id: verification.id },
    data: { usedAt: new Date() },
  });

  const passwordHash = await bcrypt.hash(dto.password, 10);
  const bindingCode = this.generateBindingCode();

  const user = await this.prisma.user.create({
    data: {
      email: dto.email,
      passwordHash,
      bindingCode,
      role: 'USER',
    },
    select: { id: true },
  });

  return this.generateTokens(user.id, '');
}

/**
 * 邮箱登录
 * 查用户 → 校验密码 → 返回JWT
 */
async emailLogin(dto: EmailLoginDto): Promise<TokenResponseDto> {
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new BusinessException(ErrorCode.EMAIL_NOT_FOUND);

  const valid = await bcrypt.compare(dto.password, user.passwordHash!);
  if (!valid) throw new BusinessException(ErrorCode.PASSWORD_INCORRECT);

  return this.generateTokens(user.id, '');
}
```

### 8.3 bindingCode 生成规则

```typescript
private generateBindingCode(): string {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除 I/O/0/1
  let code: string;
  do {
    code = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');
  } while (/* 检查 code 唯一性，冲突重试 */);
  return code;
}
```

### 8.4 JwtPayload 扩展

```typescript
// strategies/jwt.strategy.ts
export interface JwtPayload {
  sub: string;
  openid?: string;   // 微信用户有值，邮箱用户 undefined
  email?: string;    // 邮箱用户有值，微信用户 undefined
}

async validate(payload: JwtPayload) {
  const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return {
    id: user.id,
    openid: user.wxOpenid,
    nickname: user.nickname,
    role: user.role,
    email: user.email,    // 新增
  };
}
```

### 8.5 CurrentUserInfo 扩展

```typescript
// common/decorators/current-user.decorator.ts
export interface CurrentUserInfo {
  id: string;
  openid?: string;    // 改为可选
  nickname?: string;
  role: string;
  email?: string;     // 新增
}
```

### 8.6 限流配置

```typescript
// app.module.ts — 新增 APP_GUARD
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
}

// Controller
@Throttle({ default: { limit: 1, ttl: 60000 } })
@Public()
@Post('email/send-code')
async sendCode(@Body() body: EmailSendCodeDto) { ... }
```

---

## 9. 测试策略

| 层级 | 范围 | 内容 |
|---|---|---|
| **单元** | MailService | Mock Resend SDK，验证 `sendVerificationCode` 参数正确传入。Resend 返回 error 时正确抛出异常。 |
| **单元** | AuthService.sendEmailCode | Mock MailService + Prisma：验证码写入 DB、邮件发送调用、验证码格式校验（6位数字）。 |
| **单元** | AuthService.emailRegister | 场景覆盖：①邮箱已注册→20010；②验证码错误→20012；③验证码过期→20013；④成功后 User 创建字段正确、JWT 返回。 |
| **单元** | AuthService.emailLogin | 场景覆盖：①邮箱不存在→20011；②密码错误→20014；③登录成功→JWT 返回、bcrypt.compare 调用次数。 |
| **E2E** | AuthController | 完整 HTTP 链路：发送验证码 → 注册 → 登录。验证限流头返回（`Retry-After`），验证 token 有效性（用拿到的 JWT 访问受保护接口）。 |

---

## 10. 迁移计划

```bash
# 1. 安装依赖
npm i resend bcrypt @nestjs/throttler

# 2. 修改 Prisma schema（手动编辑，见第3节）
# 3. 生成迁移
npx prisma migrate dev --name add_email_auth

# 4. 实现代码（按第7节文件清单逐一完成）

# 5. 验证
npm run test:e2e
```

---

## 11. 风险与注意事项

- **验证码表清理**：`email_verification_codes` 会随使用持续增长。建议添加定时任务清理过期记录（可后续用 BullMQ 定时任务实现）。
- **bindingCode 碰撞**：字符集 30 个字符，6 位组合共 30^6 ≈ 7.3 亿种可能。结合唯一约束，碰撞概率极低但仍需 DB 唯一约束兜底。
- **Resend 免费额度**：100 封/天。个人使用足够，但需注意 Resend API key 泄漏风险（仅存 `.env`，不提交仓库）。
- **微信用户迁移**：现有微信用户无 email/passwordHash/bindingCode 字段，新增字段全可空不影响现有数据。
- **openid 字段**：`generateTokens(userId, '')` 中 openid 传空字符串，邮箱用户的 JWT 中 `openid` 为空。下游依赖 `user.openid` 的代码需处理空值。
- **限流全局影响**：添加 `ThrottlerGuard` 为 `APP_GUARD` 后，默认对所有路由生效。需确保仅 `send-code` 路由有实际限流（通过 `@Throttle()` 或 `@SkipThrottle()` 控制）。
