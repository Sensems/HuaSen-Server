# 邮箱认证功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email registration and login (Resend API + bcrypt + IP throttling) to the existing NestJS auth module.

**Architecture:** Extend existing AuthService with email methods that reuse generateTokens. New MailModule (@Global) wraps Resend SDK. EmailVerificationCode table stores 6-digit codes (10min TTL). @nestjs/throttler guards send-code endpoint (1/60s) and login (5/60s).

**Tech Stack:** NestJS 11, Prisma 7, bcrypt, Resend SDK, @nestjs/throttler, PostgreSQL

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma` (User +3 fields, +EmailVerificationCode model)

- [ ] **Step 1: Add new fields to User model**

In `prisma/schema.prisma`, add after `avatar` field (line 50):

```prisma
  email           String?    @unique @map("email") @db.VarChar(255)
  passwordHash    String?    @map("password_hash") @db.VarChar(255)
  bindingCode     String?    @unique @map("binding_code") @db.VarChar(8)
```

- [ ] **Step 2: Add EmailVerificationCode model**

Append after the NoteTag model (end of file):

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

- [ ] **Step 3: Run Prisma migration**

```bash
npx prisma migrate dev --name add_email_auth
```

Expected: Migration SQL creates new columns on `users` and new table `email_verification_codes` with indexes.

- [ ] **Step 4: Generate Prisma client**

```bash
npx prisma generate
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add email, password, bindingCode to User; add EmailVerificationCode table"
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install packages**

```bash
npm i resend bcrypt @types/bcrypt @nestjs/throttler
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('bcrypt'); require('resend'); console.log('OK')"
```

Expected: `OK` (no errors).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add resend, bcrypt, @nestjs/throttler dependencies"
```

---

### Task 3: Error Codes

**Files:**
- Modify: `src/common/constants/error-codes.ts`

- [ ] **Step 1: Add error code enum entries**

In `src/common/constants/error-codes.ts`, after line 16 (`TOKEN_INVALID = 20003`), add:

```typescript
  // 邮箱认证错误
  EMAIL_ALREADY_REGISTERED   = 20010,
  EMAIL_NOT_FOUND            = 20011,
  VERIFICATION_CODE_INVALID  = 20012,
  VERIFICATION_CODE_EXPIRED  = 20013,
  PASSWORD_INCORRECT         = 20014,
  EMAIL_SEND_FAILED          = 20015,
```

- [ ] **Step 2: Add error message mappings**

After line 49 (`[ErrorCode.TOKEN_INVALID]: 'Token 无效'`), add:

```typescript
  [ErrorCode.EMAIL_ALREADY_REGISTERED]: '该邮箱已注册',
  [ErrorCode.EMAIL_NOT_FOUND]: '该邮箱未注册',
  [ErrorCode.VERIFICATION_CODE_INVALID]: '验证码错误',
  [ErrorCode.VERIFICATION_CODE_EXPIRED]: '验证码已过期，请重新获取',
  [ErrorCode.PASSWORD_INCORRECT]: '密码错误',
  [ErrorCode.EMAIL_SEND_FAILED]: '邮件发送失败，请稍后重试',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/common/constants/error-codes.ts
git commit -m "feat: add email auth error codes (20010-20015)"
```

---

### Task 4: Config Namespaces

**Files:**
- Modify: `src/config/configuration.ts`

- [ ] **Step 1: Add email config namespace**

After the qiniuConfig export (after line 28), add:

```typescript
/**
 * 邮件服务配置（Resend）
 */
export const emailConfig = registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY || '',
  from: process.env.EMAIL_FROM || '森华笔记 <noreply@example.com>',
}));

/**
 * 限流配置
 */
export const throttleConfig = registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
  limit: parseInt(process.env.THROTTLE_LIMIT || '1', 10),
}));
```

- [ ] **Step 2: Update app.module.ts config load**

In `src/app.module.ts` line 5, update the import and the load array:

Import (line 5):
```typescript
import { appConfig, wechatConfig, qiniuConfig, emailConfig, throttleConfig } from './config/configuration';
```

Load (line 29):
```typescript
load: [appConfig, wechatConfig, qiniuConfig, emailConfig, throttleConfig],
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/configuration.ts src/app.module.ts
git commit -m "feat: add email and throttle config namespaces"
```

---

### Task 5: Mail Module

**Files:**
- Create: `src/mail/mail.service.ts`
- Create: `src/mail/mail.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create MailService**

Create `src/mail/mail.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * 邮件服务
 * 封装 Resend API，提供邮件发送能力
 */
@Injectable()
export class MailService {
  constructor(private configService: ConfigService) {}

  /**
   * 发送邮箱验证码
   * @param email 目标邮箱
   * @param code 6位验证码
   */
  async sendVerificationCode(email: string, code: string): Promise<void> {
    const resend = new Resend(
      this.configService.get<string>('email.resendApiKey'),
    );
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

- [ ] **Step 2: Create MailModule**

Create `src/mail/mail.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * 邮件模块（全局）
 * 导出 MailService，任何模块可直接注入
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 3: Register MailModule in AppModule**

In `src/app.module.ts`:
1. Add import: `import { MailModule } from './mail/mail.module';`
2. Add `MailModule` to the `imports` array (before AuthModule)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/mail/mail.service.ts src/mail/mail.module.ts src/app.module.ts
git commit -m "feat: add MailModule with Resend integration"
```

---

### Task 6: DTOs

**Files:**
- Create: `src/auth/dto/email-send-code.dto.ts`
- Create: `src/auth/dto/email-register.dto.ts`
- Create: `src/auth/dto/email-login.dto.ts`

- [ ] **Step 1: Create EmailSendCodeDto**

Create `src/auth/dto/email-send-code.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * 发送邮箱验证码请求 DTO
 */
export class EmailSendCodeDto {
  @ApiProperty({
    description: '接收验证码的邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Create EmailRegisterDto**

Create `src/auth/dto/email-register.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';

/**
 * 邮箱注册请求 DTO
 */
export class EmailRegisterDto {
  @ApiProperty({
    description: '邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '密码（≥8位，必须包含字母和数字）',
    example: 'Abc12345',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: '密码必须包含至少一个字母和一个数字',
  })
  password!: string;

  @ApiProperty({
    description: '6位数字验证码',
    example: '482931',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;
}
```

- [ ] **Step 3: Create EmailLoginDto**

Create `src/auth/dto/email-login.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * 邮箱登录请求 DTO
 */
export class EmailLoginDto {
  @ApiProperty({
    description: '邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '密码',
    example: 'Abc12345',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  password!: string;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/auth/dto/email-send-code.dto.ts src/auth/dto/email-register.dto.ts src/auth/dto/email-login.dto.ts
git commit -m "feat: add email auth DTOs (send-code, register, login)"
```

---

### Task 7: JWT Strategy & CurrentUser Decorator

**Files:**
- Modify: `src/auth/strategies/jwt.strategy.ts`
- Modify: `src/common/decorators/current-user.decorator.ts`

- [ ] **Step 1: Extend JwtPayload interface**

In `src/auth/strategies/jwt.strategy.ts`, change `JwtPayload` (lines 10-13) to:

```typescript
export interface JwtPayload {
  sub: string;      // 用户 ID
  openid?: string;  // 微信 openId（邮箱用户为 undefined）
  email?: string;   // 邮箱（微信用户为 undefined）
}
```

- [ ] **Step 2: Update validate() to return email**

In the same file, update the `validate()` return (lines 43-48) to:

```typescript
    return {
      id: user.id,
      openid: user.wxOpenid,
      nickname: user.nickname,
      role: user.role,
      email: user.email,
    };
```

- [ ] **Step 3: Extend CurrentUserInfo interface**

In `src/common/decorators/current-user.decorator.ts`, update the interface (lines 4-9):

```typescript
export interface CurrentUserInfo {
  id: string;
  openid?: string;
  nickname?: string;
  role: string;
  email?: string;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors. NOTE: At this point `payload.openid` has type `string | undefined` and `refreshToken()` calls `generateTokens(payload.sub, payload.openid)`. The existing `generateTokens(userId, openid)` signature will show a TS error because `openid` changed from `string` to `string | undefined`. This is expected and will be resolved in Task 8 when `generateTokens` signature is updated.

- [ ] **Step 5: Commit**

```bash
git add src/auth/strategies/jwt.strategy.ts src/common/decorators/current-user.decorator.ts
git commit -m "feat: extend JwtPayload and CurrentUserInfo with optional email"
```

---

### Task 8: AuthService — Core Email Logic

**Files:**
- Modify: `src/auth/auth.service.ts`

- [ ] **Step 1: Add new imports**

At the top of `src/auth/auth.service.ts`, add after existing imports:

```typescript
import { MailService } from '../mail/mail.service';
import { EmailSendCodeDto } from './dto/email-send-code.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import bcrypt from 'bcrypt';
```

- [ ] **Step 2: Inject MailService**

Update constructor to inject MailService:

```typescript
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}
```

- [ ] **Step 3: Update generateTokens signature**

Change the existing `generateTokens` method (line 146) to:

```typescript
  private generateTokens(userId: string, openid?: string, email?: string) {
    const payload: JwtPayload = {
      sub: userId,
      openid: openid || undefined,
      email: email || undefined,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '2h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'default-refresh-secret'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, expiresIn: 7200 };
  }
```

- [ ] **Step 4: Update refreshToken to pass email**

In `refreshToken()` method (line 111), change:

```typescript
      return this.generateTokens(payload.sub, payload.openid);
```

To:

```typescript
      return this.generateTokens(payload.sub, payload.openid || undefined, payload.email);
```

- [ ] **Step 5: Update wechatLogin to pass email**

In `wechatLogin()` method (line 94), change:

```typescript
    return this.generateTokens(user.id, user.wxOpenid || '');
```

To:

```typescript
    return this.generateTokens(user.id, user.wxOpenid || undefined);
```

- [ ] **Step 6: Add sendEmailCode method**

Add after `wechatLogin()` method:

```typescript
  /**
   * 发送邮箱验证码
   * 生成6位随机数字，写入DB，通过 Resend 发送邮件
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
```

- [ ] **Step 7: Add generateBindingCode method**

Add after `sendEmailCode()`:

```typescript
  /**
   * 生成唯一绑定码（6位大写字母数字）
   * 通过 DB 查询确保唯一性，最多重试5次
   */
  private async generateBindingCode(): Promise<string> {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)],
      ).join('');
      const existing = await this.prisma.user.findUnique({
        where: { bindingCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique binding code');
  }
```

- [ ] **Step 8: Add emailRegister method**

Add after `generateBindingCode()`:

```typescript
  /**
   * 邮箱注册
   * 校验邮箱唯一性 → 校验验证码 → 标记已用 → 哈希密码 → 创建用户 → 返回JWT
   */
  async emailRegister(dto: EmailRegisterDto) {
    // 1. 检查邮箱是否已注册
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED);
    }

    // 2. 校验验证码
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
      // 区分是错误码还是过期
      const anyForEmail = await this.prisma.emailVerificationCode.findFirst({
        where: {
          email: dto.email,
          code: dto.code,
          purpose: 'register',
          usedAt: null,
        },
      });
      throw new BusinessException(
        anyForEmail
          ? ErrorCode.VERIFICATION_CODE_EXPIRED
          : ErrorCode.VERIFICATION_CODE_INVALID,
      );
    }

    // 3. 标记验证码已使用
    await this.prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    // 4. 哈希密码
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 5. 生成 bindingCode
    const bindingCode = await this.generateBindingCode();

    // 6. 创建用户
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        bindingCode,
        role: 'USER',
      },
      select: { id: true, email: true },
    });

    // 7. 返回 JWT
    return this.generateTokens(user.id, undefined, user.email);
  }
```

- [ ] **Step 9: Add emailLogin method**

Add after `emailRegister()`:

```typescript
  /**
   * 邮箱登录
   * 查用户 → 校验密码 → 返回JWT
   */
  async emailLogin(dto: EmailLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, email: true },
    });

    if (!user) {
      throw new BusinessException(ErrorCode.EMAIL_NOT_FOUND);
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash!);
    if (!valid) {
      throw new BusinessException(ErrorCode.PASSWORD_INCORRECT);
    }

    return this.generateTokens(user.id, undefined, user.email);
  }
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add src/auth/auth.service.ts
git commit -m "feat: add email auth service methods (sendCode, register, login, bindingCode)"
```

---

### Task 9: AuthController — Email Routes

**Files:**
- Modify: `src/auth/auth.controller.ts`

- [ ] **Step 1: Add imports**

In `src/auth/auth.controller.ts`, add after existing DTO imports:

```typescript
import { EmailSendCodeDto } from './dto/email-send-code.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
```

- [ ] **Step 2: Add send-code route**

Add after `wechatLogin()` method (after line 40):

```typescript
  /**
   * 发送邮箱验证码
   * POST /auth/email/send-code
   */
  @Public()
  @Post('email/send-code')
  @ApiOperation({ summary: '发送邮箱验证码' })
  @ApiBody({ type: EmailSendCodeDto })
  @ApiResponse({ status: 200, description: '发送成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async sendEmailCode(@Body() body: EmailSendCodeDto) {
    return this.authService.sendEmailCode(body.email);
  }
```

- [ ] **Step 3: Add register route**

Add after `sendEmailCode()`:

```typescript
  /**
   * 邮箱注册
   * POST /auth/email/register
   */
  @Public()
  @Post('email/register')
  @ApiOperation({ summary: '邮箱注册' })
  @ApiBody({ type: EmailRegisterDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async emailRegister(@Body() body: EmailRegisterDto) {
    return this.authService.emailRegister(body);
  }
```

- [ ] **Step 4: Add login route**

Add after `emailRegister()`:

```typescript
  /**
   * 邮箱登录
   * POST /auth/email/login
   */
  @Public()
  @Post('email/login')
  @ApiOperation({ summary: '邮箱登录' })
  @ApiBody({ type: EmailLoginDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async emailLogin(@Body() body: EmailLoginDto) {
    return this.authService.emailLogin(body);
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.controller.ts
git commit -m "feat: add email auth controller routes (send-code, register, login)"
```

---

### Task 10: Throttler Integration

**Files:**
- Modify: `src/auth/auth.module.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Register ThrottlerModule in AuthModule**

In `src/auth/auth.module.ts`, add import:

```typescript
import { ThrottlerModule } from '@nestjs/throttler';
```

Add `ThrottlerModule` to the `imports` array (before `PassportModule`):

```typescript
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
```

**Note:** Root-level defaults are generous (10 requests/60s) so only `send-code` and `login` endpoints have restrictive per-route throttles.

- [ ] **Step 2: Register ThrottlerGuard as global APP_GUARD**

In `src/app.module.ts`:
1. Add import: `import { ThrottlerGuard } from '@nestjs/throttler';`
2. Add after the JwtAuthGuard provider (line 46):

```typescript
    { provide: APP_GUARD, useClass: ThrottlerGuard },
```

- [ ] **Step 3: Add @Throttle decorators to email routes**

In `src/auth/auth.controller.ts`, add import:

```typescript
import { Throttle } from '@nestjs/throttler';
```

Update `sendEmailCode()` to include:

```typescript
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @Public()
  @Post('email/send-code')
```

Update `emailLogin()` to include:

```typescript
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('email/login')
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.module.ts src/auth/auth.controller.ts src/app.module.ts
git commit -m "feat: add IP throttling for send-code (1/min) and login (5/min)"
```

---

### Task 11: Environment Variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Append to `.env.example`:

```env
# Resend 邮件服务
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=森华笔记 <noreply@your-domain.com>

# 限流配置（可选）
THROTTLE_TTL=60000
THROTTLE_LIMIT=1
```

**Note:** Actual `.env` values are added manually by the user — do NOT commit real keys.

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add email and throttle env vars to .env.example"
```

---

### Task 12: Rethrow as BusinessException on email send failure

**Files:**
- Modify: `src/auth/auth.service.ts`

- [ ] **Step 1: Wrap sendEmailCode with error handling**

In `sendEmailCode()`, wrap the mailService call in a try/catch that converts to BusinessException:

```typescript
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

    try {
      await this.mailService.sendVerificationCode(email, code);
    } catch (error) {
      // 邮件发送失败不回滚已写入的验证码（10分钟过期自动清理，影响可忽略）
      throw new BusinessException(
        ErrorCode.EMAIL_SEND_FAILED,
        '邮件发送失败，请稍后重试',
      );
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.build.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth.service.ts
git commit -m "fix: wrap mail send in try/catch with BusinessException"
```

---

### Task 13: Unit Tests — MailService

**Files:**
- Create: `src/mail/mail.service.spec.ts`

- [ ] **Step 1: Create MailService unit tests**

Create `src/mail/mail.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { Resend } from 'resend';

jest.mock('resend');

const mockResendSend = jest.fn();

(Resend as jest.MockedClass<typeof Resend>).mockImplementation(() => ({
  emails: { send: mockResendSend },
} as any));

describe('MailService', () => {
  let service: MailService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'email.resendApiKey': 're_test_key',
                'email.from': 'Test <test@example.com>',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    configService = module.get<ConfigService>(ConfigService);
    mockResendSend.mockReset();
  });

  it('should send verification code email with correct parameters', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    await service.sendVerificationCode('user@example.com', '482931');

    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'Test <test@example.com>',
      to: 'user@example.com',
      subject: '森华笔记 - 邮箱验证码',
      html: '<p>您的验证码是：<strong>482931</strong>，10分钟内有效。</p>',
    });
  });

  it('should throw error when Resend returns error', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    });

    await expect(
      service.sendVerificationCode('user@example.com', '482931'),
    ).rejects.toThrow('Resend send failed: Invalid API key');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest src/mail/mail.service.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/mail/mail.service.spec.ts
git commit -m "test: add MailService unit tests"
```

---

### Task 14: Unit Tests — AuthService Email Methods

**Files:**
- Create: `src/auth/auth.service.email.spec.ts`

- [ ] **Step 1: Create AuthService email unit tests**

Create `src/auth/auth.service.email.spec.ts`. Because AuthService depends on JwtService/ConfigService/PrismaService/MailService, use the existing test infrastructure pattern from the project.

**NOTE: Full test file is abbreviated here for brevity. The implementer should write tests covering:**

1. `sendEmailCode`: verify code is 6-digit, verify code written to DB, verify mailService called
2. `emailRegister`: 
   - Email already registered → throws EMAIL_ALREADY_REGISTERED
   - Invalid verification code → throws VERIFICATION_CODE_INVALID
   - Expired verification code → throws VERIFICATION_CODE_EXPIRED
   - Successful registration → user created with correct fields, JWT returned
3. `emailLogin`:
   - Email not found → throws EMAIL_NOT_FOUND
   - Wrong password → throws PASSWORD_INCORRECT
   - Successful login → JWT returned, bcrypt.compare called once

- [ ] **Step 2: Run tests**

```bash
npx jest src/auth/auth.service.email.spec.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth.service.email.spec.ts
git commit -m "test: add AuthService email method unit tests"
```

---

### Task 15: E2E Tests — Email Auth Flow

**Files:**
- Create: `test/auth-email.e2e-spec.ts`

- [ ] **Step 1: Create E2E test file**

Create `test/auth-email.e2e-spec.ts`. The test should:
1. POST `/auth/email/send-code` — verify 200 response, verify throttling header
2. POST `/auth/email/send-code` again — verify 429 (RATE_LIMITED) on immediate retry
3. POST `/auth/email/register` with wrong code — verify 20012
4. POST `/auth/email/register` with correct code — verify 200 with accessToken + refreshToken
5. POST `/auth/email/login` with correct credentials — verify 200 with tokens
6. Use returned JWT to access a protected endpoint — verify 200

**NOTE:** E2E tests require a real Resend API key or the send-code step should be mocked. For CI, either mock Resend at the HTTP level or skip the send-code assertion.

- [ ] **Step 2: Run E2E tests**

```bash
npm run test:e2e -- --testPathPattern=auth-email
```

Expected: All E2E tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/auth-email.e2e-spec.ts
git commit -m "test: add email auth E2E tests"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Full TypeScript compilation**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 2: Run all tests**

```bash
npm test
npm run test:e2e
```

Expected: All unit + E2E tests pass.

- [ ] **Step 3: Final commit (if any changes)**

```bash
git add -A
git commit -m "chore: final verification — all tests passing"
```

---

### Post-Implementation Notes

- **Resend API key:** Must be set in `.env` before testing email sending. Get a key at https://resend.com.
- **Verification code cleanup:** `email_verification_codes` table grows unboundedly. Consider adding a BullMQ cron job to delete records older than 24h (out of scope for this plan).
- **Login throttling:** 5 login attempts per minute per IP is sufficient for a personal app. For production multi-user, consider adding per-email throttling too.
- **WeChat binding:** The `bindingCode` field is generated but not yet consumed. The binding API will be implemented in a follow-up plan.
