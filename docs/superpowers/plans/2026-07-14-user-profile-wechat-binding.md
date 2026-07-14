# User Profile + WeChat Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供 App 端资料查询/更新（昵称+头像 URL），以及微信↔邮箱账号双向绑定（共用 `bindingCode`），绑定后迁移空壳笔记并清空 `categoryId`。

**Architecture:** 绑定合并逻辑集中在 `UserService`（空壳↔App 用户事务合并）。情况 2 在 `WechatService.handleMessage` 回调内同步判码并执行合并，用被动回复返回结果且不入队。情况 1 空壳照常入队存草稿，被动回复携带绑定码。App 侧 `POST /user/bind` 提交空壳码完成反向绑定。

**Tech Stack:** NestJS 11, Fastify, Prisma 7, BullMQ, Jest, class-validator, `@nestjs/throttler`

**Spec:** `docs/superpowers/specs/2026-07-14-user-profile-wechat-binding-design.md`

## Global Constraints

- 只用 GET/POST；路径 `/user/profile`、`/user/update`、`/user/bind`
- 「已 App 注册」**仅**看 `email`；微信 OAuth 不算
- 合并时 notes/media 迁 `userId`，笔记 `categoryId` **置空**；不迁 categories
- 绑定文案：回调**同步判码** + 被动回复；绑定成功**不入队**
- 无新 Prisma 模型 / 无 migration
- 包管理器 `pnpm`；单测优先，不强制 E2E
- 在当前仓库直接实现（不使用 git worktree）

## File Map

| 文件 | 职责 |
| ---- | ---- |
| `src/common/constants/error-codes.ts` | `BINDING_CODE_INVALID = 20016` |
| `src/user/user.service.ts` | 绑码生成、空壳查找/补码、profile、update、bind 合并 |
| `src/user/user.service.spec.ts` | UserService 单测（新建） |
| `src/user/dto/update-profile.dto.ts` | nickname/avatar 校验 |
| `src/user/dto/bind-user.dto.ts` | bindingCode |
| `src/user/user.controller.ts` | profile / update / bind 路由 |
| `src/user/user.module.ts` | 注册 Controller |
| `src/user/AGENTS.md` | 模块文档（新建） |
| `src/auth/auth.service.ts` | 邮箱注册改用 `UserService.generateBindingCode` |
| `src/auth/auth.module.ts` | import `UserModule` |
| `src/auth/auth.service.email.spec.ts` | mock UserService；绑码测迁到 User |
| `src/wechat/wechat.service.ts` | 同步判码、同步绑定、被动回复分支、条件入队 |
| `src/queue/processors/wechat-message.processor.ts` | 用扩展后的 user 字段；未注册客服可补提示（可选极简） |
| `src/wechat/AGENTS.md` | 同步绑定约定 |

---

### Task 1: 错误码 `BINDING_CODE_INVALID`

**Files:**
- Modify: `src/common/constants/error-codes.ts`

- [ ] **Step 1: 增加错误码与中文消息**

在 `ErrorCode` 邮箱认证段（`EMAIL_SEND_FAILED` 之后）加入：

```typescript
  BINDING_CODE_INVALID = 20016,
```

在 `ErrorMessage` 中加入：

```typescript
  [ErrorCode.BINDING_CODE_INVALID]: '绑定码无效',
```

- [ ] **Step 2: Commit**

```bash
git add src/common/constants/error-codes.ts
git commit -m "feat: add BINDING_CODE_INVALID error code"
```

---

### Task 2: `UserService` — 绑码生成 + 增强 `findOrCreateByWechat`

**Files:**
- Modify: `src/user/user.service.ts`
- Create: `src/user/user.service.spec.ts`

- [ ] **Step 1: 写失败单测（绑码生成 + 空壳补码）**

创建 `src/user/user.service.spec.ts`：

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
  note: { updateMany: jest.fn(), count: jest.fn() },
  media: { updateMany: jest.fn() },
  category: { deleteMany: jest.fn() },
};

describe('UserService', () => {
  let service: UserService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UserService);
    prisma = module.get(PrismaService);
  });

  describe('generateBindingCode', () => {
    it('returns 6-char code from allowed charset', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const code = await service.generateBindingCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });

    it('retries on collision then succeeds', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'taken' })
        .mockResolvedValueOnce(null);
      const code = await service.generateBindingCode();
      expect(code).toHaveLength(6);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOrCreateByWechat', () => {
    it('creates shell user with bindingCode', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // by openid
      prisma.user.findUnique.mockResolvedValue(null); // generateBindingCode uniqueness
      prisma.user.create.mockResolvedValue({
        id: 'shell-1',
        email: null,
        bindingCode: 'ABC234',
        wxOpenid: 'oid',
      });

      const user = await service.findOrCreateByWechat('oid');
      expect(user.id).toBe('shell-1');
      expect(user.bindingCode).toBeTruthy();
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('backfills bindingCode when existing shell has none', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'shell-2',
          email: null,
          bindingCode: null,
          wxOpenid: 'oid2',
        })
        .mockResolvedValue(null); // code uniqueness
      prisma.user.update.mockResolvedValue({
        id: 'shell-2',
        email: null,
        bindingCode: 'XYZ789',
        wxOpenid: 'oid2',
      });

      const user = await service.findOrCreateByWechat('oid2');
      expect(user.bindingCode).toBe('XYZ789');
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 跑测确认失败**

```bash
pnpm test -- src/user/user.service.spec.ts
```

Expected: FAIL（方法不存在或签名不匹配）

- [ ] **Step 3: 实现 `generateBindingCode` 与增强 `findOrCreateByWechat`**

将 `src/user/user.service.ts` 改为（保留 `DEFAULT_USER_ID` 与 `getDefaultUser`）：

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export type WechatResolvedUser = {
  id: string;
  email: string | null;
  bindingCode: string | null;
  wxOpenid: string | null;
};

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultUser() {
    return this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
  }

  /**
   * 生成唯一绑定码（6 位大写字母数字，排除易混字符）
   */
  async generateBindingCode(): Promise<string> {
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

  /**
   * 根据微信 openid 查找或创建空壳用户；存量无码则补生成
   */
  async findOrCreateByWechat(wxOpenid: string): Promise<WechatResolvedUser> {
    if (!wxOpenid) {
      return {
        id: DEFAULT_USER_ID,
        email: null,
        bindingCode: null,
        wxOpenid: null,
      };
    }

    const existing = await this.prisma.user.findUnique({
      where: { wxOpenid },
      select: { id: true, email: true, bindingCode: true, wxOpenid: true },
    });

    if (existing) {
      if (!existing.bindingCode && !existing.email) {
        const bindingCode = await this.generateBindingCode();
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { bindingCode },
          select: { id: true, email: true, bindingCode: true, wxOpenid: true },
        });
      }
      return existing;
    }

    const bindingCode = await this.generateBindingCode();
    return this.prisma.user.create({
      data: {
        wxOpenid,
        bindingCode,
        role: $Enums.UserRole.USER,
      },
      select: { id: true, email: true, bindingCode: true, wxOpenid: true },
    });
  }
}
```

- [ ] **Step 4: 跑测确认通过**

```bash
pnpm test -- src/user/user.service.spec.ts
```

Expected: PASS（本 Task 相关用例）

- [ ] **Step 5: Commit**

```bash
git add src/user/user.service.ts src/user/user.service.spec.ts
git commit -m "feat: generate binding codes for WeChat shell users"
```

---

### Task 3: `UserService` — profile / update / 绑定合并

**Files:**
- Modify: `src/user/user.service.ts`
- Modify: `src/user/user.service.spec.ts`

- [ ] **Step 1: 追加失败单测（profile、update、bindByShellCode、bindOpenidToAppCode）**

在 `user.service.spec.ts` 的 `describe('UserService')` 内追加（并扩展 mock）：

```typescript
// 在 mockPrisma 增加：
// user.delete: jest.fn(),
// note: { updateMany: jest.fn(), count: jest.fn() },
// media: { updateMany: jest.fn() },
// category: { deleteMany: jest.fn() },

describe('getProfile', () => {
  it('returns wxBound false when no openid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      nickname: 'n',
      avatar: null,
      email: 'a@b.com',
      bindingCode: 'ABC234',
      wxOpenid: null,
    });
    const profile = await service.getProfile('u1');
    expect(profile.wxBound).toBe(false);
    expect(profile.bindingCode).toBe('ABC234');
  });
});

describe('updateProfile', () => {
  it('updates nickname only', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      nickname: '新昵称',
      avatar: 'https://cdn/a.png',
      email: 'a@b.com',
      bindingCode: 'ABC234',
      wxOpenid: null,
    });
    const result = await service.updateProfile('u1', { nickname: '新昵称' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { nickname: '新昵称' },
      select: expect.any(Object),
    });
    expect(result.nickname).toBe('新昵称');
  });
});

describe('bindByShellCode', () => {
  it('throws BINDING_CODE_INVALID when code missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.bindByShellCode('app-1', 'NOCODE')).rejects.toMatchObject({
      code: 20016,
    });
  });

  it('throws when code belongs to registered app user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-app',
      email: 'x@y.com',
      wxOpenid: null,
      bindingCode: 'APPCOD',
    });
    await expect(service.bindByShellCode('app-1', 'APPCOD')).rejects.toMatchObject({
      code: 20016,
    });
  });
});
```

（完整合并成功用例可在实现后用 `$transaction` mock 回调执行；至少覆盖无效码与非空壳码。）

- [ ] **Step 2: 跑测确认新用例失败**

```bash
pnpm test -- src/user/user.service.spec.ts
```

Expected: FAIL on missing methods

- [ ] **Step 3: 实现 profile / update / 合并核心**

在 `user.service.ts` 追加 imports 与方法：

```typescript
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

export type UserProfile = {
  id: string;
  nickname: string | null;
  avatar: string | null;
  email: string | null;
  bindingCode: string | null;
  wxBound: boolean;
};

export type BindResult = {
  wxBound: true;
  syncedDraftCount: number;
  overwritten: boolean;
  message: string;
};
```

实现要点（完整写入文件）：

```typescript
  /**
   * 获取当前用户资料
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        email: true,
        bindingCode: true,
        wxOpenid: true,
      },
    });
    if (!user) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '用户不存在');
    }
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      bindingCode: user.bindingCode,
      wxBound: user.wxOpenid != null,
    };
  }

  /**
   * 更新昵称和/或头像 URL
   */
  async updateProfile(
    userId: string,
    data: { nickname?: string; avatar?: string },
  ): Promise<UserProfile> {
    const payload: { nickname?: string; avatar?: string } = {};
    if (data.nickname !== undefined) payload.nickname = data.nickname;
    if (data.avatar !== undefined) payload.avatar = data.avatar;
    if (Object.keys(payload).length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请至少提供 nickname 或 avatar');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: payload,
      select: {
        id: true,
        nickname: true,
        avatar: true,
        email: true,
        bindingCode: true,
        wxOpenid: true,
      },
    });
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      bindingCode: user.bindingCode,
      wxBound: user.wxOpenid != null,
    };
  }

  /**
   * 规范化绑定码（trim + 大写）
   */
  normalizeBindingCode(raw: string): string {
    return raw.trim().toUpperCase();
  }

  /**
   * App 端：用微信空壳绑定码合并到当前登录用户
   */
  async bindByShellCode(appUserId: string, rawCode: string): Promise<BindResult> {
    const code = this.normalizeBindingCode(rawCode);
    const shell = await this.prisma.user.findUnique({
      where: { bindingCode: code },
      select: { id: true, email: true, wxOpenid: true, bindingCode: true },
    });
    if (!shell || shell.email || !shell.wxOpenid) {
      throw new BusinessException(ErrorCode.BINDING_CODE_INVALID);
    }
    return this.mergeWechatToAppUser({
      appUserId,
      wxOpenid: shell.wxOpenid,
      shellUserId: shell.id,
    });
  }

  /**
   * 微信端：用户发送 App 注册绑定码，将当前 openid 绑到该 App 用户
   */
  async bindOpenidToAppByCode(wxOpenid: string, rawCode: string): Promise<BindResult> {
    const code = this.normalizeBindingCode(rawCode);
    const appUser = await this.prisma.user.findUnique({
      where: { bindingCode: code },
      select: { id: true, email: true, wxOpenid: true },
    });
    if (!appUser || !appUser.email) {
      throw new BusinessException(ErrorCode.BINDING_CODE_INVALID);
    }
    const shell = await this.prisma.user.findUnique({
      where: { wxOpenid },
      select: { id: true, email: true },
    });
    const shellUserId =
      shell && !shell.email && shell.id !== appUser.id ? shell.id : undefined;
    return this.mergeWechatToAppUser({
      appUserId: appUser.id,
      wxOpenid,
      shellUserId,
    });
  }

  /**
   * 将 wxOpenid 绑定到 App 用户；可选迁移空壳 notes/media，笔记 categoryId 置空
   */
  async mergeWechatToAppUser(params: {
    appUserId: string;
    wxOpenid: string;
    shellUserId?: string;
  }): Promise<BindResult> {
    const { appUserId, wxOpenid, shellUserId } = params;

    return this.prisma.$transaction(async (tx) => {
      const appUser = await tx.user.findUnique({
        where: { id: appUserId },
        select: { id: true, email: true, wxOpenid: true },
      });
      if (!appUser?.email) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '目标账号未完成 App 注册');
      }

      // 幂等：已是该绑定
      if (appUser.wxOpenid === wxOpenid) {
        return {
          wxBound: true as const,
          syncedDraftCount: 0,
          overwritten: false,
          message: '已绑定',
        };
      }

      let overwritten = false;

      // openid 已挂在其他用户上
      const holder = await tx.user.findUnique({
        where: { wxOpenid },
        select: { id: true, email: true },
      });
      if (holder && holder.id !== appUserId && holder.id !== shellUserId) {
        if (holder.email) {
          await tx.user.update({
            where: { id: holder.id },
            data: { wxOpenid: null },
          });
          overwritten = true;
        }
      }

      // App 用户已绑其他微信 → 换绑
      if (appUser.wxOpenid && appUser.wxOpenid !== wxOpenid) {
        overwritten = true;
      }

      let syncedDraftCount = 0;
      if (shellUserId && shellUserId !== appUserId) {
        syncedDraftCount = await tx.note.count({
          where: { userId: shellUserId, deletedAt: null },
        });
        await tx.note.updateMany({
          where: { userId: shellUserId },
          data: { userId: appUserId, categoryId: null },
        });
        await tx.media.updateMany({
          where: { userId: shellUserId },
          data: { userId: appUserId },
        });
        await tx.category.deleteMany({ where: { userId: shellUserId } });
        // 先解开 openid unique，再删空壳
        await tx.user.update({
          where: { id: shellUserId },
          data: { wxOpenid: null, bindingCode: null },
        });
        await tx.user.delete({ where: { id: shellUserId } });
      }

      await tx.user.update({
        where: { id: appUserId },
        data: { wxOpenid },
      });

      const message = overwritten
        ? '绑定成功，已覆盖原有微信绑定'
        : syncedDraftCount > 0
          ? `绑定成功，已同步 ${syncedDraftCount} 条笔记`
          : '绑定成功';

      return {
        wxBound: true as const,
        syncedDraftCount,
        overwritten,
        message,
      };
    });
  }
```

注意：`BusinessException` 在事务内抛出时需确认 Prisma 能回滚（会）；测试里对 `$transaction` 可 `mockImplementation(async (fn) => fn(mockPrisma))`。

- [ ] **Step 4: 跑测通过**

```bash
pnpm test -- src/user/user.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/user.service.ts src/user/user.service.spec.ts
git commit -m "feat: add user profile update and WeChat bind merge"
```

---

### Task 4: Auth 改用共享绑码生成

**Files:**
- Modify: `src/auth/auth.module.ts`
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.service.email.spec.ts`

- [ ] **Step 1: `AuthModule` import `UserModule`**

```typescript
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    // ...existing
  ],
  // ...
})
```

- [ ] **Step 2: `AuthService` 注入 `UserService`，删除私有 `generateBindingCode`**

构造函数增加 `private readonly userService: UserService`。

`emailRegister` 中：

```typescript
const bindingCode = await this.userService.generateBindingCode();
```

删除 `AuthService` 内原 `private async generateBindingCode` 方法整段。

- [ ] **Step 3: 更新 email 单测**

在 `auth.service.email.spec.ts`：

- providers 增加 `{ provide: UserService, useValue: { generateBindingCode: jest.fn().mockResolvedValue('TEST12') } }`
- 删除或改写直接调用 `(service as any).generateBindingCode` 的 `describe('generateBindingCode')`（迁到 UserService 已覆盖）
- 注册成功用例断言 `userService.generateBindingCode` 被调用

- [ ] **Step 4: 跑测**

```bash
pnpm test -- src/auth/auth.service.email.spec.ts src/user/user.service.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.module.ts src/auth/auth.service.ts src/auth/auth.service.email.spec.ts
git commit -m "refactor: share binding code generation via UserService"
```

---

### Task 5: User Controller + DTOs

**Files:**
- Create: `src/user/dto/update-profile.dto.ts`
- Create: `src/user/dto/bind-user.dto.ts`
- Create: `src/user/user.controller.ts`
- Modify: `src/user/user.module.ts`

- [ ] **Step 1: DTO**

`src/user/dto/update-profile.dto.ts`：

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: '花森' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/a.png' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @ValidateIf((_, v) => v !== undefined && v !== '')
  @IsUrl({ require_protocol: true })
  avatar?: string;
}
```

`src/user/dto/bind-user.dto.ts`：

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class BindUserDto {
  @ApiProperty({ example: 'ABC234', description: '微信空壳下发的绑定码' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  bindingCode!: string;
}
```

- [ ] **Step 2: Controller**

`src/user/user.controller.ts`：

```typescript
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BindUserDto } from './dto/bind-user.dto';

@ApiTags('用户')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取当前用户资料' })
  @ApiResponse({ status: 200, description: '成功' })
  async profile(@CurrentUser() user: CurrentUserInfo) {
    return this.userService.getProfile(user.id);
  }

  @Post('update')
  @ApiOperation({ summary: '更新昵称和/或头像 URL' })
  @ApiBody({ type: UpdateProfileDto })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.id, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bind')
  @ApiOperation({ summary: '用微信空壳绑定码绑定当前账号' })
  @ApiBody({ type: BindUserDto })
  async bind(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: BindUserDto,
  ) {
    return this.userService.bindByShellCode(user.id, dto.bindingCode);
  }
}
```

- [ ] **Step 3: Module 注册 Controller**

```typescript
import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

- [ ] **Step 4: 编译检查**

```bash
pnpm exec tsc --project tsconfig.build.json --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/user/
git commit -m "feat: add user profile and bind API endpoints"
```

---

### Task 6: 微信回调同步判码与被动回复

**Files:**
- Modify: `src/wechat/wechat.service.ts`
- Modify: `src/wechat/wechat.module.ts`（若需显式保证 UserService 可用；已 import UserModule 则跳过）

- [ ] **Step 1: 注入 `UserService`，改造 `handleMessage`**

构造函数增加 `private readonly userService: UserService`。

在解密得到 `message` 之后、去重/入队之前，加入同步分支逻辑（保持现有去重可对「将入队」的消息执行；绑定类跳过入队也跳过去重笔记查询亦可）：

伪代码落地为真实 TypeScript：

```typescript
    const fromUserName = (message as any).FromUserName as string || '';
    const toUserName = (message as any).ToUserName as string || '';
    const msgType = message.MsgType as string;
    const encodingAESKey = /* 已取 */;
    const appId = /* 已取 */;

    const resolved = await this.userService.findOrCreateByWechat(fromUserName);

    // 文本：同步判码
    if (msgType === 'text') {
      const content = String((message as any).Content || '');
      const normalized = this.userService.normalizeBindingCode(content);

      // 本人空壳码 → 只回复引导，不入队
      if (
        resolved.bindingCode &&
        normalized === resolved.bindingCode &&
        !resolved.email
      ) {
        return this.buildEncryptedReply(
          fromUserName,
          toUserName,
          this.buildBindGuideText(resolved.bindingCode),
          encodingAESKey,
          appId,
        );
      }

      // 尝试匹配全局绑定码
      const codeOwner = await this.prisma.user.findUnique({
        where: { bindingCode: normalized },
        select: { id: true, email: true },
      });

      if (codeOwner?.email) {
        try {
          const result = await this.userService.bindOpenidToAppByCode(
            fromUserName,
            normalized,
          );
          return this.buildEncryptedReply(
            fromUserName,
            toUserName,
            result.message,
            encodingAESKey,
            appId,
          );
        } catch {
          return this.buildEncryptedReply(
            fromUserName,
            toUserName,
            '绑定失败，请稍后重试',
            encodingAESKey,
            appId,
          );
        }
      }
    }

    // …现有 msgId 去重…

    // 入队
    await this.messageQueue.add(/* 现有 */);

    // 被动回复文案
    let replyContent: string;
    if (!resolved.email) {
      replyContent = this.buildBindGuideText(resolved.bindingCode || '');
    } else {
      replyContent = this.contentMapForMsgType(msgType); // 原 contentMap
    }

    return this.buildEncryptedReply(
      fromUserName,
      toUserName,
      replyContent,
      encodingAESKey,
      appId,
    );
```

将原 `buildPassiveReply` 拆成：

- `contentMapForMsgType(msgType)` — 返回原「正在保存…」文案
- `buildBindGuideText(code: string)` — 例如：`请打开花森笔记 App，在绑定页输入绑定码：${code}`
- `buildEncryptedReply(toOpenid, fromGh, content, encodingAESKey, appId)` — 原加密信封逻辑，`Content` 用传入的 `content`

注意：`normalized` 长度不是 6 或字符集不符时，不必查库（可选优化：`/^[A-Z0-9]{6}$/` 才查）。

- [ ] **Step 2: 手工核对逻辑路径（无自动化微信回调测时）**

用注释或临时 log 确认四条路径：本人空壳码、App 码绑定、未注册普通消息、已注册普通消息。

- [ ] **Step 3: Commit**

```bash
git add src/wechat/wechat.service.ts
git commit -m "feat: sync WeChat binding code detection in callback"
```

---

### Task 7: Worker 对齐（返回字段 + 客服确认）

**Files:**
- Modify: `src/queue/processors/wechat-message.processor.ts`

- [ ] **Step 1: 使用增强后的 resolved user**

`process` 中：

```typescript
    const user = await this.userService.findOrCreateByWechat(data.fromUserName);
    const userId = user.id;
```

客服确认保持「仅当 note 创建成功」；未注册用户被动回复已含绑定引导，Worker **不必**再发绑定提示（YAGNI），避免双条骚扰。

若 `userId === DEFAULT_USER_ID` 行为不变。

- [ ] **Step 2: 编译**

```bash
pnpm exec tsc --project tsconfig.build.json --noEmit
```

Expected: 无错误（`findOrCreateByWechat` 新返回值兼容 `.id`）

- [ ] **Step 3: Commit**

```bash
git add src/queue/processors/wechat-message.processor.ts
git commit -m "chore: align wechat processor with enriched user resolve"
```

---

### Task 8: 文档

**Files:**
- Create: `src/user/AGENTS.md`
- Modify: `src/wechat/AGENTS.md`
- Modify: `AGENTS.md`（WHERE TO LOOK 可加一行用户资料/绑定）

- [ ] **Step 1: 写 `src/user/AGENTS.md`**

内容覆盖：profile/update/bind API、空壳定义（无 email）、`mergeWechatToAppUser`、绑码生成、与 auth/wechat 的关系。

- [ ] **Step 2: 更新 `src/wechat/AGENTS.md`**

在消息链路中注明：文本绑定码在 `WechatService.handleMessage` **同步**处理，成功不入队；被动回复含绑定/引导文案。

- [ ] **Step 3: Commit**

```bash
git add src/user/AGENTS.md src/wechat/AGENTS.md AGENTS.md
git commit -m "docs: document user profile and WeChat binding"
```

---

### Task 9: 最终验证

- [ ] **Step 1: 跑全部单测**

```bash
pnpm test
```

Expected: 全部 PASS

- [ ] **Step 2: 构建**

```bash
pnpm exec tsc --project tsconfig.build.json
```

Expected: `dist/` 产出成功

- [ ] **Step 3: Swagger 手工核对清单**

启动 `pnpm start:dev`，打开 `/api/docs`：

1. JWT 登录后 `GET /user/profile` 有 `bindingCode`、`wxBound`
2. `POST /user/update` 改 nickname / avatar
3. `POST /user/bind` 无效码 → `code: 20016`
4.（可选）微信环境：未注册发消息被动回复含码；发 App 绑码被动回复绑定成功且无新笔记

---

## Spec Coverage Checklist

| Spec 项 | Task |
| ------- | ---- |
| `GET /user/profile` | 3, 5 |
| `POST /user/update` nickname/avatar URL | 3, 5 |
| `POST /user/bind` 空壳码 | 3, 5 |
| 情况 1 被动回复绑码 + 草稿 | 2, 6, 7 |
| 情况 2 回调同步绑定不入队 | 3, 6 |
| 覆盖 + 操作方提示 | 3, 6 |
| `categoryId` 置空 | 3 |
| 仅 email 算 App 注册 | 3, 6 |
| 存量空壳补码 | 2 |
| `BINDING_CODE_INVALID` | 1, 3 |
| bind throttle | 5 |
| 共享 `generateBindingCode` | 2, 4 |
| AGENTS 文档 | 8 |

## Self-Review Notes

- 无 TBD/占位步骤；合并逻辑以 Task 3 代码块为准
- `bindOpenidToAppByCode` 与 `bindByShellCode` 均走 `mergeWechatToAppUser`，避免双份合并
- 回调内对「非 6 位形态」文本跳过绑码查询，防止误伤普通短句（实现时加上）
