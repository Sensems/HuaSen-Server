# Phase 1 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 NestJS + Fastify + Prisma + PostgreSQL 服务骨架，实现微信公众号文本消息接收并保存为临时笔记。

**Architecture:** 单体 NestJS 应用，Fastify 作为 HTTP 适配器，Prisma 操作 PostgreSQL。微信消息回调同步处理（不引入 BullMQ），不做鉴权（单用户 seed）。

**Tech Stack:** NestJS 11, Fastify, Prisma 6, PostgreSQL, TypeScript 5, Node 22+

**Spec:** `docs/superpowers/specs/2026-07-03-senhua-notes-server-design.md`

---

## File Structure Plan

```
senhua-notes-server/
├── src/
│   ├── main.ts                          # FastifyAdapter 启动
│   ├── app.module.ts                    # 根模块（全局注册 filter/interceptor）
│   │
│   ├── common/
│   │   ├── constants/
│   │   │   └── error-codes.ts           # 错误码枚举
│   │   ├── enums/
│   │   │   └── index.ts                 # NoteType, NoteSource, MediaType, UserRole
│   │   ├── dto/
│   │   │   └── pagination.dto.ts        # 分页 DTO
│   │   ├── exceptions/
│   │   │   └── business.exception.ts    # 业务异常类
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts  # 全局异常过滤器
│   │   └── interceptors/
│   │       └── response.interceptor.ts     # 统一响应包装
│   │
│   ├── config/
│   │   └── configuration.ts             # 类型安全配置读取
│   │
│   ├── prisma/
│   │   ├── prisma.module.ts             # Prisma 全局模块
│   │   └── prisma.service.ts            # PrismaClient 封装
│   │
│   ├── user/
│   │   ├── user.module.ts
│   │   └── user.service.ts              # 用户查询/创建
│   │
│   ├── notes/
│   │   ├── notes.module.ts
│   │   ├── notes.controller.ts
│   │   ├── notes.service.ts
│   │   └── dto/
│   │       ├── create-note.dto.ts
│   │       ├── update-note.dto.ts
│   │       ├── query-note.dto.ts
│   │       └── index.ts
│   │
│   ├── categories/
│   │   ├── categories.module.ts
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   └── dto/
│   │       ├── create-category.dto.ts
│   │       ├── update-category.dto.ts
│   │       ├── reorder-category.dto.ts
│   │       └── index.ts
│   │
│   ├── tags/
│   │   ├── tags.module.ts
│   │   ├── tags.controller.ts
│   │   ├── tags.service.ts
│   │       └── dto/
│   │           ├── create-tag.dto.ts
│   │           └── index.ts
│   │
│   └── wechat/
│       ├── wechat.module.ts
│       ├── wechat.controller.ts
│       ├── wechat.service.ts
│       ├── types/
│       │   └── wechat-message.types.ts   # 微信消息类型定义
│       └── utils/
│           ├── crypto.ts                 # AES 解密 + SHA1 签名
│           └── xml-parser.ts             # XML 解析/构建
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── test/
│   └── app.e2e-spec.ts
│
├── .env.example
├── .env
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── nest-cli.json
```

---

### Task 1：项目脚手架搭建

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`
- Create: `src/main.ts`, `src/app.module.ts`
- Create: `.env.example`, `.env`

- [ ] **Step 1：手动创建 package.json 和相关依赖**

```bash
npm init -y
npm i --save @nestjs/core @nestjs/common @nestjs/platform-fastify @nestjs/config
npm i --save @prisma/client
npm i --save class-validator class-transformer
npm i --save reflect-metadata rxjs
npm i --save xml2js  # 微信 XML 解析
npm i --save-dev @nestjs/cli @nestjs/testing
npm i --save-dev prisma
npm i --save-dev typescript @types/node
npm i --save-dev @types/xml2js
npm i --save-dev jest @types/jest ts-jest
npm i --save-dev supertest @types/supertest
```

然后配置 scripts：

```jsonc
// package.json 中替换 scripts 段：
"scripts": {
  "build": "nest build",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:prod": "node dist/main",
  "test": "jest",
  "test:e2e": "jest --config ./test/jest-e2e.json --forceExit"
},
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

- [ ] **Step 2：创建 tsconfig.json**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

```jsonc
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

```jsonc
// nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 3：创建 main.ts**
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

/**
 * 应用启动入口
 * 使用 Fastify 作为 HTTP 适配器，启用 rawBody 用于微信签名校验
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );

  // 启用全局参数校验（class-validator 装饰器生效）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // 自动剥离非 DTO 定义的字段
      transform: true,        // 自动类型转换
      transformOptions: {
        enableImplicitConversion: true, // Query 参数自动转数字等
      },
    }),
  );

  // 启用 CORS（App 端跨域访问）
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
```

- [ ] **Step 4：创建 app.module.ts（骨架版）**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';

/**
 * 应用根模块
 * 后续逐步注册各功能模块和全局过滤器/拦截器
 */
@Module({
  imports: [],
})
export class AppModule {}
```

- [ ] **Step 5：创建 .env.example 和 .env**

```
# .env.example

# 服务端口
PORT=3000

# 数据库连接
DATABASE_URL=postgresql://postgres:password@localhost:5432/senhua_notes?schema=public

# 微信公众平台配置
WECHAT_TOKEN=your_wechat_token
WECHAT_APP_ID=your_app_id
WECHAT_ENCODING_AES_KEY=your_encoding_aes_key

# 七牛云配置（Phase 2 使用，Phase 1 仅占位）
QINIU_ACCESS_KEY=
QINIU_SECRET_KEY=
QINIU_BUCKET=
QINIU_DOMAIN=
```

```bash
# 复制 .env.example 为 .env（使用真实值填充）
Copy-Item -LiteralPath ".env.example" -Destination ".env"
```

- [ ] **Step 6：确认项目能启动**

```bash
npm run start:dev
```

预期输出：`Application is running on: http://0.0.0.0:3000`

- [ ] **Step 7：提交**

```bash
git add -A
git commit -m "feat: scaffold NestJS project with Fastify adapter"
```

---

### Task 2：Prisma 数据层搭建

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `prisma/seed.ts`
- Modify: `src/app.module.ts:14` (import PrismaModule)

- [ ] **Step 1：编写 Prisma Schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/** 系统用户表 */
model User {
  id         String     @id @default(uuid()) @db.Uuid
  wxOpenid   String?    @unique @map("wx_openid") @db.VarChar(64)
  wxUnionid  String?    @map("wx_unionid") @db.VarChar(64)
  nickname   String?    @db.VarChar(64)
  avatar     String?    @db.VarChar(512)
  role       String     @default("admin") @db.VarChar(10)
  createdAt  DateTime   @default(now()) @map("created_at")
  updatedAt  DateTime   @updatedAt @map("updated_at")

  notes      Note[]
  categories Category[]

  @@map("users")
}

/** 笔记表 */
model Note {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  categoryId String?   @map("category_id") @db.Uuid
  type       String    @default("draft") @db.VarChar(20)
  source     String    @default("app_manual") @db.VarChar(20)
  title      String?   @db.VarChar(256)
  content    String?   @db.Text
  rawContent String?   @map("raw_content") @db.Text
  deletedAt  DateTime? @map("deleted_at")
  meta       Json?     @db.JsonB
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  user     User       @relation(fields: [userId], references: [id])
  category Category?  @relation(fields: [categoryId], references: [id])
  media    NoteMedia[]
  tags     NoteTag[]

  @@index([userId])
  @@index([categoryId])
  @@index([type])
  @@index([deletedAt])
  @@map("notes")
}

/** 笔记多媒体表 */
model NoteMedia {
  id        String   @id @default(uuid()) @db.Uuid
  noteId    String   @map("note_id") @db.Uuid
  type      String   @db.VarChar(20)
  qiniuKey  String?  @map("qiniu_key") @db.VarChar(512)
  qiniuUrl  String?  @map("qiniu_url") @db.VarChar(512)
  wxMediaId String?  @map("wx_media_id") @db.VarChar(128)
  fileSize  Int?     @map("file_size")
  mimeType  String?  @map("mime_type") @db.VarChar(64)
  createdAt DateTime @default(now()) @map("created_at")

  note Note @relation(fields: [noteId], references: [id])

  @@map("note_media")
}

/** 分类表 */
model Category {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  name      String    @db.VarChar(64)
  parentId  String?   @map("parent_id") @db.Uuid
  sortOrder Int       @default(0) @map("sort_order")
  createdAt DateTime  @default(now()) @map("created_at")

  user     User       @relation(fields: [userId], references: [id])
  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children Category[] @relation("CategoryHierarchy")
  notes    Note[]

  @@map("categories")
}

/** 标签表 */
model Tag {
  id        String    @id @default(uuid()) @db.Uuid
  name      String    @unique @db.VarChar(32)
  createdAt DateTime  @default(now()) @map("created_at")

  notes NoteTag[]

  @@map("tags")
}

/** 笔记-标签多对多关联 */
model NoteTag {
  noteId String @map("note_id") @db.Uuid
  tagId  String @map("tag_id") @db.Uuid

  note Note @relation(fields: [noteId], references: [id])
  tag  Tag  @relation(fields: [tagId], references: [id])

  @@id([noteId, tagId])
  @@map("note_tags")
}
```

- [ ] **Step 2：编写 PrismaService**

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 数据库服务
 * 封装 PrismaClient，管理数据库连接生命周期
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * 模块初始化时连接数据库
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * 模块销毁时断开数据库连接
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3：编写 PrismaModule**

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Prisma 全局模块
 * 使用 @Global() 装饰器，无需在其他模块中重复导入
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 4：编写 Seed 脚本**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 数据库初始化脚本
 * Phase 1 创建一个默认管理员用户，所有笔记关联到此用户
 */
async function main() {
  // 使用固定 UUID 便于调试
  const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

  const user = await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      nickname: '默认用户',
      role: 'admin',
    },
  });

  console.log('Seed completed. Default user:', user.id);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5：配置 package.json seed 命令**

在 `package.json` 中添加：

```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

- [ ] **Step 6：运行迁移和种子**

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

- [ ] **Step 6b：创建微信消息去重唯一索引（手动迁移）**

Prisma 不直接支持 JSONB 路径唯一索引，需创建手动迁移：

```bash
# 创建一个空的手动迁移
npx prisma migrate dev --name add_wechat_msg_id_unique_index --create-only
```

然后在生成的迁移 SQL 文件中添加：

```sql
-- 在新建的迁移 SQL 文件末尾添加
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_wechat_msg_id_unique
  ON notes ((meta->>'wechat_msg_id'))
  WHERE meta->>'wechat_msg_id' IS NOT NULL
    AND deleted_at IS NULL;
```

执行迁移：

```bash
npx prisma migrate dev
```

- [ ] **Step 7：更新 AppModule 引入 PrismaModule**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
```

- [ ] **Step 8：确认启动后数据库可连接**

```bash
npm run start:dev
```

预期：正常启动，无数据库连接错误

- [ ] **Step 9：提交**

```bash
git add -A
git commit -m "feat: add Prisma schema, PrismaService, and seed script"
```

---

### Task 3：配置模块

**Files:**
- Create: `src/config/configuration.ts`
- Modify: `src/app.module.ts:15` (import ConfigModule)

- [ ] **Step 1：编写配置模块**

```typescript
// src/config/configuration.ts
import { registerAs } from '@nestjs/config';

/**
 * 应用配置
 * 从环境变量读取并导出类型安全的配置对象
 */
export default registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
}));

/**
 * 微信公众平台配置
 */
export const wechatConfig = registerAs('wechat', () => ({
  token: process.env.WECHAT_TOKEN,
  appId: process.env.WECHAT_APP_ID,
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
}));

/**
 * 七牛云存储配置（Phase 2 预留）
 */
export const qiniuConfig = registerAs('qiniu', () => ({
  accessKey: process.env.QINIU_ACCESS_KEY,
  secretKey: process.env.QINIU_SECRET_KEY,
  bucket: process.env.QINIU_BUCKET,
  domain: process.env.QINIU_DOMAIN,
}));
```

- [ ] **Step 2：在 AppModule 中注册 ConfigModule**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import appConfig, { wechatConfig, qiniuConfig } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, wechatConfig, qiniuConfig],
    }),
    PrismaModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3：确认启动后环境变量可读取**

在 `main.ts` 中添加临时日志验证：

```typescript
import { ConfigService } from '@nestjs/config';
// 在 bootstrap 中
const configService = app.get(ConfigService);
console.log('WECHAT_APP_ID:', configService.get('wechat.appId'));
```

```bash
npm run start:dev
```

验证后删除临时日志。

- [ ] **Step 4：提交**

```bash
git add -A
git commit -m "feat: add configuration module with wechat and qiniu config"
```

---

### Task 4：通用层 - 常量、枚举、DTO、异常

**Files:**
- Create: `src/common/constants/error-codes.ts`
- Create: `src/common/enums/index.ts`
- Create: `src/common/dto/pagination.dto.ts`
- Create: `src/common/exceptions/business.exception.ts`

- [ ] **Step 1：编写错误码常量**

```typescript
// src/common/constants/error-codes.ts

/**
 * 业务错误码枚举
 * 格式：模块前缀 + 具体错误码
 */
export enum ErrorCode {
  // 通用错误 1xxxx
  SUCCESS = 0,
  BAD_REQUEST = 10001,
  UNAUTHORIZED = 10002,
  RATE_LIMITED = 10003,
  NOT_FOUND = 10004,

  // 认证错误 2xxxx
  TOKEN_EXPIRED = 20001,
  WECHAT_AUTH_FAILED = 20002,
  TOKEN_INVALID = 20003,

  // 笔记错误 3xxxx
  NOTE_NOT_FOUND = 30001,
  NOTE_DELETED = 30002,
  NOTE_INVALID_OPERATION = 30003,

  // 分类/标签错误 4xxxx
  CATEGORY_DUPLICATE = 40001,
  CATEGORY_DEPTH_EXCEEDED = 40002,

  // 存储错误 6xxxx
  UPLOAD_FAILED = 60001,
  FILE_TOO_LARGE = 60002,
  SIGNATURE_EXPIRED = 60003,
}

/**
 * 错误码对应的中文消息
 */
export const ErrorMessage: Record<number, string> = {
  [ErrorCode.SUCCESS]: '操作成功',
  [ErrorCode.BAD_REQUEST]: '请求参数有误',
  [ErrorCode.UNAUTHORIZED]: '未登录或登录已过期',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.TOKEN_EXPIRED]: 'Token 已过期',
  [ErrorCode.WECHAT_AUTH_FAILED]: '微信授权失败',
  [ErrorCode.TOKEN_INVALID]: 'Token 无效',
  [ErrorCode.NOTE_NOT_FOUND]: '笔记不存在',
  [ErrorCode.NOTE_DELETED]: '笔记已删除',
  [ErrorCode.NOTE_INVALID_OPERATION]: '不允许的操作',
  [ErrorCode.CATEGORY_DUPLICATE]: '分类名称重复',
  [ErrorCode.CATEGORY_DEPTH_EXCEEDED]: '分类层级超过限制',
  [ErrorCode.UPLOAD_FAILED]: '文件上传失败',
  [ErrorCode.FILE_TOO_LARGE]: '文件大小超过限制',
  [ErrorCode.SIGNATURE_EXPIRED]: '上传凭证已过期',
};
```

- [ ] **Step 2：编写枚举**

```typescript
// src/common/enums/index.ts

/** 笔记状态 */
export enum NoteType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/** 笔记来源 */
export enum NoteSource {
  WECHAT = 'wechat',
  APP_CLIPBOARD = 'app_clipboard',
  APP_MANUAL = 'app_manual',
}

/** 多媒体类型 */
export enum MediaType {
  IMAGE = 'image',
  VOICE = 'voice',
  VIDEO = 'video',
  FILE = 'file',
}

/** 用户角色 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
```

- [ ] **Step 3：编写通用 DTO**

```typescript
// src/common/dto/pagination.dto.ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 通用分页查询 DTO
 * 所有列表查询接口继承此 DTO
 */
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;
}
```

- [ ] **Step 4：编写业务异常类**

```typescript
// src/common/exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessage } from '../constants/error-codes';

/**
 * 业务异常类
 * 统一封装业务逻辑中的异常，包含错误码和错误消息
 */
export class BusinessException extends HttpException {
  /** 业务错误码 */
  readonly code: number;
  /** 错误详情（可选，用于携带字段校验信息等） */
  readonly details: unknown;

  /**
   * @param code - 错误码，参见 ErrorCode 枚举
   * @param message - 自定义错误消息，不传则使用预定义消息
   * @param details - 额外的错误详情
   */
  constructor(
    code: number,
    message?: string,
    details?: unknown,
  ) {
    const msg = message ?? ErrorMessage[code] ?? '未知错误';
    super(msg, HttpStatus.OK); // 统一返回 200，通过 code 区分成功/失败
    this.code = code;
    this.details = details ?? null;
  }
}
```

- [ ] **Step 5：提交**

```bash
git add -A
git commit -m "feat: add common layer - error codes, enums, DTOs, business exception"
```

---

### Task 5：通用层 - 全局过滤器和拦截器

**Files:**
- Create: `src/common/filters/global-exception.filter.ts`
- Create: `src/common/interceptors/response.interceptor.ts`
- Modify: `src/app.module.ts` (注册全局 filter 和 interceptor)

- [ ] **Step 1：编写全局异常过滤器**

```typescript
// src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error-codes';

/**
 * 全局异常过滤器
 * 统一捕获所有异常，输出 { code, message, data, details } 格式
 * 微信回调路径 /wechat/* 返回纯文本 "success"，不套 JSON
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // 微信回调路径：无论发生什么都返回 success
    if (request.url?.startsWith('/wechat/')) {
      return response.send('success');
    }

    // 业务异常：使用其 code 和 message
    if (exception instanceof BusinessException) {
      return response.send({
        code: exception.code,
        message: exception.message,
        data: null,
        details: exception.details,
      });
    }

    // NestJS 内置 HTTP 异常（如参数校验失败）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      let details: unknown = null;
      let message = exception.message;

      if (typeof resp === 'object' && resp !== null) {
        const respObj = resp as Record<string, unknown>;
        if (Array.isArray(respObj.message)) {
          details = respObj.message;
          message = '请求参数校验失败';
        } else if (typeof respObj.message === 'string') {
          message = respObj.message;
        }
      }

      // 401 返回未授权
      const code = status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST;

      return response.send({
        code,
        message,
        data: null,
        details,
      });
    }

    // 未知异常：500
    console.error('Unhandled exception:', exception);
    return response.send({
      code: 500,
      message: '服务器内部错误',
      data: null,
      details: null,
    });
  }
}
```

- [ ] **Step 2：编写响应拦截器**

```typescript
// src/common/interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorCode } from '../constants/error-codes';

/**
 * 统一响应格式包装
 * 将所有成功的返回值包装为 { code: 0, message: 'ok', data: ... }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    // 微信回调路径不包装
    if (request.url?.startsWith('/wechat/')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: data ?? null,
      })),
    );
  }
}
```

- [ ] **Step 3：在 AppModule 中全局注册**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import appConfig, { wechatConfig, qiniuConfig } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, wechatConfig, qiniuConfig],
    }),
    PrismaModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
```

- [ ] **Step 4：验证**

启动应用，用 Fastify 的 inject 方法验证拦截器生效。在 `main.ts` bootstrap 末尾临时添加：

```typescript
// 临时测试代码（验证通过后删除）
const result = await app.inject({ method: 'GET', url: '/health' });
console.log('Test inject:', result.statusCode, result.payload);
```

由于不可识别的路径 Fastify 返回 HTML/text，更可靠的验证方式是检查业务接口的响应。启动后访问 `http://localhost:3000/notes`，预期返回 JSON（code 为 0 或错误码）。

- [ ] **Step 5：提交**

```bash
git add -A
git commit -m "feat: add global exception filter and response interceptor"
```

---

### Task 6：User 模块

**Files:**
- Create: `src/user/user.service.ts`
- Create: `src/user/user.module.ts`

- [ ] **Step 1：编写 UserService**

```typescript
// src/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 1 默认用户 UUID（与 seed 脚本一致）
 * Phase 3 接入认证后，用户从 JWT 中获取
 */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 用户服务
 * Phase 1 仅提供默认用户查询，Phase 3 扩展微信 OAuth 绑定
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取默认用户
   * Phase 1 所有操作都关联到此用户
   */
  async getDefaultUser() {
    return this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
  }

  /**
   * 根据微信 openId 查找用户
   * Phase 3 使用
   */
  async findByOpenId(openId: string) {
    return this.prisma.user.findUnique({
      where: { wxOpenid: openId },
    });
  }

  /**
   * 创建用户（Phase 3 使用）
   */
  async create(data: { wxOpenid?: string; nickname?: string; avatar?: string }) {
    return this.prisma.user.create({ data });
  }
}
```

- [ ] **Step 2：编写 UserModule**

```typescript
// src/user/user.module.ts
import { Module } from '@nestjs/common';
import { UserService } from './user.service';

/**
 * 用户模块
 * 导出 UserService 供其他模块使用
 */
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

- [ ] **Step 3：注册到 AppModule**

在 `src/app.module.ts` 的 imports 数组中添加 `UserModule`。

- [ ] **Step 4：提交**

```bash
git add -A
git commit -m "feat: add User module with default user service"
```

---

### Task 7：Notes 模块

**Files:**
- Create: `src/notes/dto/create-note.dto.ts`
- Create: `src/notes/dto/update-note.dto.ts`
- Create: `src/notes/dto/query-note.dto.ts`
- Create: `src/notes/dto/index.ts`
- Create: `src/notes/notes.service.ts`
- Create: `src/notes/notes.controller.ts`
- Create: `src/notes/notes.module.ts`
- Modify: `src/app.module.ts` (import NotesModule)

- [ ] **Step 1：编写 Notes DTOs 并创建 barrel 文件**

（创建 create-note.dto.ts、update-note.dto.ts、query-note.dto.ts 三个 DTO 文件，内容如下）

```typescript
// src/notes/dto/create-note.dto.ts
import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { NoteSource } from '../../common/enums';

/**
 * 创建笔记请求体
 */
export class CreateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
```

```typescript
// src/notes/dto/update-note.dto.ts
import { IsString, IsOptional, IsArray } from 'class-validator';

/**
 * 更新笔记请求体
 */
export class UpdateNoteDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
```

```typescript
// src/notes/dto/query-note.dto.ts
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * 笔记列表查询参数
 */
export class QueryNoteDto extends PaginationDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  keyword?: string;
}

/**
 * 笔记详情/删除/发布/归档请求参数（通过 id 定位）
 */
export class NoteIdDto {
  @IsString()
  id: string;
}
```

- [ ] **Step 1b：创建 dto barrel 文件**

```typescript
// src/notes/dto/index.ts
export { CreateNoteDto } from './create-note.dto';
export { UpdateNoteDto } from './update-note.dto';
export { QueryNoteDto, NoteIdDto } from './query-note.dto';
```

- [ ] **Step 2：编写 NotesService**

```typescript
// src/notes/notes.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService, DEFAULT_USER_ID } from '../user/user.service';
import { CreateNoteDto, UpdateNoteDto, QueryNoteDto } from './dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { NoteType, NoteSource } from '../common/enums';
import { Prisma } from '@prisma/client';

/**
 * 笔记服务
 * 提供笔记的完整 CRUD 及状态流转
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  /**
   * 获取笔记列表（分页 + 筛选）
   */
  async findAll(query: QueryNoteDto) {
    const { page = 1, size = 20, type, category, tag, keyword } = query;
    const skip = (page - 1) * size;

    // 构建查询条件
    const where: Prisma.NoteWhereInput = {
      userId: DEFAULT_USER_ID,
      deletedAt: null, // 默认过滤已删除
    };

    if (type) where.type = type;
    if (category) where.categoryId = category;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }
    if (tag) {
      where.tags = { some: { tagId: tag } };
    }

    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.note.count({ where }),
    ]);

    return { items, total, page, size };
  }

  /**
   * 获取笔记详情
   */
  async findById(id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, userId: DEFAULT_USER_ID, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        media: true,
      },
    });

    if (!note) {
      throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
    }

    return note;
  }

  /**
   * 创建笔记（App 手动创建或微信消息入库）
   */
  async create(dto: CreateNoteDto) {
    const title = dto.title || this.generateTitle(dto.content);

    return this.prisma.note.create({
      data: {
        userId: DEFAULT_USER_ID,
        type: NoteType.DRAFT,
        source: dto.source || NoteSource.APP_MANUAL,
        title,
        content: dto.content,
        categoryId: dto.categoryId || null,
        tags: dto.tagIds?.length
          ? {
              create: dto.tagIds.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
    });
  }

  /**
   * 从微信消息创建笔记（内部调用，不走 Controller）
   * 包含去重逻辑：通过 wechat_msg_id 检查是否已存在
   */
  async createFromWechat(params: {
    content: string;
    rawContent: string;
    msgId: string;
    createTime: number;
  }) {
    // 消息去重检查
    const existing = await this.prisma.note.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        meta: { path: ['wechat_msg_id'], equals: params.msgId },
      },
    });
    if (existing) {
      return existing; // 重复消息，返回已有笔记
    }

    const title = this.generateTitle(params.content);

    return this.prisma.note.create({
      data: {
        userId: DEFAULT_USER_ID,
        type: NoteType.DRAFT,
        source: NoteSource.WECHAT,
        title,
        content: params.content,
        rawContent: params.rawContent,
        meta: {
          wechat_msg_id: params.msgId,
          wechat_create_time: params.createTime,
        },
      },
    });
  }

  /**
   * 更新笔记
   */
  async update(dto: UpdateNoteDto) {
    const { id, tagIds, ...data } = dto;

    // 验证笔记存在且未被删除
    await this.findById(id);

    // 如果传了 tagIds，先删后建
    if (tagIds !== undefined) {
      await this.prisma.noteTag.deleteMany({ where: { noteId: id } });
    }

    return this.prisma.note.update({
      where: { id },
      data: {
        ...data,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
  }

  /**
   * 软删除笔记
   */
  async softDelete(id: string) {
    await this.findById(id); // 验证存在

    return this.prisma.note.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 发布笔记（draft → published）
   */
  async publish(id: string) {
    const note = await this.findById(id);

    if (note.type !== NoteType.DRAFT) {
      throw new BusinessException(
        ErrorCode.NOTE_INVALID_OPERATION,
        '只有临时笔记可以发布',
      );
    }

    return this.prisma.note.update({
      where: { id },
      data: { type: NoteType.PUBLISHED },
    });
  }

  /**
   * 归档/取消归档笔记
   */
  async archive(id: string) {
    const note = await this.findById(id);

    if (note.type === NoteType.DRAFT) {
      throw new BusinessException(
        ErrorCode.NOTE_INVALID_OPERATION,
        '临时笔记不能归档，请先发布',
      );
    }

    const newType =
      note.type === NoteType.ARCHIVED ? NoteType.PUBLISHED : NoteType.ARCHIVED;

    return this.prisma.note.update({
      where: { id },
      data: { type: newType },
    });
  }

  /**
   * 获取笔记关联的多媒体列表
   */
  async getMedia(noteId: string) {
    return this.prisma.noteMedia.findMany({
      where: { noteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 从内容自动截取标题
   * 取前 100 字符，去除换行符
   */
  private generateTitle(content?: string): string {
    if (!content) return '无标题';
    const clean = content.replace(/\n/g, ' ').trim();
    return clean.length > 100 ? clean.slice(0, 100) : clean;
  }
}
```

- [ ] **Step 3：编写 NotesController**

```typescript
// src/notes/notes.controller.ts
import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto, QueryNoteDto, NoteIdDto } from './dto';

/**
 * 笔记控制器
 * 仅使用 GET 和 POST 方法
 */
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /**
   * 获取笔记列表
   * GET /notes?type=draft&category=xxx&tag=xxx&keyword=xxx&page=1&size=20
   */
  @Get()
  async list(@Query() query: QueryNoteDto) {
    return this.notesService.findAll(query);
  }

  /**
   * 获取笔记详情
   * GET /notes/detail?id=xxx
   */
  @Get('detail')
  async detail(@Query() query: NoteIdDto) {
    return this.notesService.findById(query.id);
  }

  /**
   * 创建笔记
   * POST /notes/create
   */
  @Post('create')
  async create(@Body() dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  /**
   * 更新笔记
   * POST /notes/update
   */
  @Post('update')
  async update(@Body() dto: UpdateNoteDto) {
    return this.notesService.update(dto);
  }

  /**
   * 删除笔记（软删除）
   * POST /notes/delete
   */
  @Post('delete')
  async delete(@Body() dto: NoteIdDto) {
    return this.notesService.softDelete(dto.id);
  }

  /**
   * 发布笔记
   * POST /notes/publish
   */
  @Post('publish')
  async publish(@Body() dto: NoteIdDto) {
    return this.notesService.publish(dto.id);
  }

  /**
   * 归档/取消归档笔记
   * POST /notes/archive
   */
  @Post('archive')
  async archive(@Body() dto: NoteIdDto) {
    return this.notesService.archive(dto.id);
  }

  /**
   * 获取笔记关联的多媒体列表
   * GET /notes/media?note_id=xxx
   */
  @Get('media')
  async media(@Query('note_id') noteId: string) {
    return this.notesService.getMedia(noteId);
  }
}
```

- [ ] **Step 4：编写 NotesModule**

```typescript
// src/notes/notes.module.ts
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
```

- [ ] **Step 5：注册到 AppModule**

在 `src/app.module.ts` 的 imports 数组中添加 `NotesModule`。

- [ ] **Step 6：手动测试笔记创建**

```bash
npm run start:dev

# 另一终端测试
Invoke-RestMethod -Uri "http://localhost:3000/notes/create" -Method POST -ContentType "application/json" -Body '{"content":"这是测试笔记"}'
```

预期返回 code=0 的响应。

- [ ] **Step 7：提交**

```bash
git add -A
git commit -m "feat: add Notes module with full CRUD and state transitions"
```

---

### Task 8：Categories 模块

**Files:**
- Create: `src/categories/dto/create-category.dto.ts`
- Create: `src/categories/dto/update-category.dto.ts`
- Create: `src/categories/dto/reorder-category.dto.ts`
- Create: `src/categories/categories.service.ts`
- Create: `src/categories/categories.controller.ts`
- Create: `src/categories/categories.module.ts`
- Modify: `src/app.module.ts` (import CategoriesModule)

- [ ] **Step 1：编写 Categories DTOs**

```typescript
// src/categories/dto/create-category.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
```

```typescript
// src/categories/dto/update-category.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
```

```typescript
// src/categories/dto/reorder-category.dto.ts
import { IsArray, IsString, IsOptional } from 'class-validator';

/** 排序项 */
export class ReorderItem {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  parentId: string | null;
}

export class ReorderCategoryDto {
  @IsArray()
  items: ReorderItem[];
}
```

- [ ] **Step 1b：创建 Categories dto barrel 文件**

```typescript
// src/categories/dto/index.ts
export { CreateCategoryDto } from './create-category.dto';
export { UpdateCategoryDto } from './update-category.dto';
export { ReorderCategoryDto } from './reorder-category.dto';
```

- [ ] **Step 2：编写 CategoriesService**

```typescript
// src/categories/categories.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_USER_ID } from '../user/user.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoryDto } from './dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

/**
 * 分类服务
 * 支持树形分类结构，同级内按 sort_order 排序
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取分类列表（树形返回）
   */
  async findAll() {
    const categories = await this.prisma.category.findMany({
      where: { userId: DEFAULT_USER_ID },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { notes: true } },
      },
    });

    return this.buildTree(categories);
  }

  /**
   * 创建分类
   */
  async create(dto: CreateCategoryDto) {
    // 检查同级名称是否重复
    const exists = await this.prisma.category.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        name: dto.name,
        parentId: dto.parentId || null,
      },
    });
    if (exists) {
      throw new BusinessException(ErrorCode.CATEGORY_DUPLICATE);
    }

    // 检查层级深度（最多 3 层）
    if (dto.parentId) {
      await this.checkDepth(dto.parentId, 1);
    }

    // 计算同级 sort_order（追加到末尾）
    const last = await this.prisma.category.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        parentId: dto.parentId || null,
      },
      orderBy: { sortOrder: 'desc' },
    });

    return this.prisma.category.create({
      data: {
        userId: DEFAULT_USER_ID,
        name: dto.name,
        parentId: dto.parentId || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  /**
   * 更新分类
   */
  async update(dto: UpdateCategoryDto) {
    const { id, name, parentId } = dto;

    // 检查名称重复（排除自身）
    if (name) {
      const exists = await this.prisma.category.findFirst({
        where: {
          userId: DEFAULT_USER_ID,
          name,
          parentId: parentId || null,
          id: { not: id },
        },
      });
      if (exists) {
        throw new BusinessException(ErrorCode.CATEGORY_DUPLICATE);
      }
    }

    // 不能把分类设为自己的子分类
    if (parentId && parentId === id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不能将分类设为自己的子分类');
    }

    return this.prisma.category.update({
      where: { id },
      data: { name, parentId },
    });
  }

  /**
   * 删除分类
   * 关联笔记的 categoryId 置空
   */
  async delete(id: string) {
    // 子分类一并删除
    await this.prisma.category.deleteMany({
      where: { parentId: id },
    });

    // 解除关联笔记的分类
    await this.prisma.note.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    return this.prisma.category.delete({ where: { id } });
  }

  /**
   * 拖拽排序
   * items 按顺序传入，服务端按序号更新 sort_order
   */
  async reorder(dto: ReorderCategoryDto) {
    const updates = dto.items.map((item, index) =>
      this.prisma.category.update({
        where: { id: item.id },
        data: {
          sortOrder: index,
          parentId: item.parentId,
        },
      }),
    );

    await this.prisma.$transaction(updates);
    return this.findAll();
  }

  /**
   * 将扁平分类列表构建为树形结构
   */
  private buildTree(categories: any[]): any[] {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // 建立映射
    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    // 构建树
    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * 检查分类层级深度（递归，最多 3 层）
   */
  private async checkDepth(parentId: string, depth: number) {
    if (depth >= 3) {
      throw new BusinessException(ErrorCode.CATEGORY_DEPTH_EXCEEDED);
    }

    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });

    if (parent?.parentId) {
      await this.checkDepth(parent.parentId, depth + 1);
    }
  }
}
```

- [ ] **Step 3：编写 CategoriesController**

```typescript
// src/categories/categories.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoryDto } from './dto';

/**
 * 分类控制器
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * 获取分类列表（树形）
   * GET /categories
   */
  @Get()
  async list() {
    return this.categoriesService.findAll();
  }

  /**
   * 创建分类
   * POST /categories/create
   */
  @Post('create')
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  /**
   * 更新分类
   * POST /categories/update
   */
  @Post('update')
  async update(@Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(dto);
  }

  /**
   * 删除分类
   * POST /categories/delete
   */
  @Post('delete')
  async delete(@Body('id') id: string) {
    return this.categoriesService.delete(id);
  }

  /**
   * 拖拽排序
   * POST /categories/reorder
   */
  @Post('reorder')
  async reorder(@Body() dto: ReorderCategoryDto) {
    return this.categoriesService.reorder(dto);
  }
}
```

- [ ] **Step 4：编写 CategoriesModule**

```typescript
// src/categories/categories.module.ts
import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 5：注册到 AppModule 并提交**

```bash
git add -A
git commit -m "feat: add Categories module with tree structure and reorder"
```

---

### Task 9：Tags 模块

**Files:**
- Create: `src/tags/dto/create-tag.dto.ts`
- Create: `src/tags/tags.service.ts`
- Create: `src/tags/tags.controller.ts`
- Create: `src/tags/tags.module.ts`
- Modify: `src/app.module.ts` (import TagsModule)

- [ ] **Step 1：编写 Tags DTO**

```typescript
// src/tags/dto/create-tag.dto.ts
import { IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(32)
  name: string;
}
```

- [ ] **Step 1b：创建 Tags dto barrel 文件**

```typescript
// src/tags/dto/index.ts
export { CreateTagDto } from './create-tag.dto';
```

- [ ] **Step 2：编写 TagsService**

```typescript
// src/tags/tags.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 标签服务
 * 标签为全局共享（不分用户），通过多对多关联到笔记
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取所有标签（含笔记数量）
   */
  async findAll() {
    return this.prisma.tag.findMany({
      include: {
        _count: { select: { notes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 创建标签（如果已存在则返回已有的）
   */
  async create(name: string) {
    const existing = await this.prisma.tag.findUnique({
      where: { name },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.tag.create({ data: { name } });
  }

  /**
   * 删除标签（解绑所有关联笔记）
   */
  async delete(id: string) {
    // 先解绑
    await this.prisma.noteTag.deleteMany({
      where: { tagId: id },
    });

    return this.prisma.tag.delete({ where: { id } });
  }
}
```

- [ ] **Step 3：编写 TagsController**

```typescript
// src/tags/tags.controller.ts
import { Controller, Get, Post, Body } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';

/**
 * 标签控制器
 */
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * 获取所有标签
   * GET /tags
   */
  @Get()
  async list() {
    return this.tagsService.findAll();
  }

  /**
   * 创建标签
   * POST /tags/create
   */
  @Post('create')
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto.name);
  }

  /**
   * 删除标签
   * POST /tags/delete
   */
  @Post('delete')
  async delete(@Body('id') id: string) {
    return this.tagsService.delete(id);
  }
}
```

- [ ] **Step 4：编写 TagsModule**

```typescript
// src/tags/tags.module.ts
import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
```

- [ ] **Step 5：注册到 AppModule 并提交**

```bash
git add -A
git commit -m "feat: add Tags module with upsert and unbind-on-delete"
```

---

### Task 10：WeChat 模块

**Files:**
- Create: `src/wechat/types/wechat-message.types.ts`
- Create: `src/wechat/utils/xml-parser.ts`
- Create: `src/wechat/utils/crypto.ts`
- Create: `src/wechat/wechat.service.ts`
- Create: `src/wechat/wechat.controller.ts`
- Create: `src/wechat/wechat.module.ts`
- Modify: `src/app.module.ts` (import WechatModule)

- [ ] **Step 1：编写微信消息类型定义**

```typescript
// src/wechat/types/wechat-message.types.ts

/** 微信回调 URL 验证参数 */
export interface WechatVerifyParams {
  signature: string;
  timestamp: string;
  nonce: string;
  echostr: string;
}

/** 微信推送的加密消息体 */
export interface WechatEncryptedMessage {
  ToUserName: string;
  Encrypt: string;
}

/** 解密后的基础消息字段（所有消息类型共有） */
export interface WechatBaseMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  MsgId: string;
}

/** 文本消息 */
export interface WechatTextMessage extends WechatBaseMessage {
  MsgType: 'text';
  Content: string;
}

/** 图片消息 */
export interface WechatImageMessage extends WechatBaseMessage {
  MsgType: 'image';
  PicUrl: string;
  MediaId: string;
}

/** 语音消息 */
export interface WechatVoiceMessage extends WechatBaseMessage {
  MsgType: 'voice';
  MediaId: string;
  Format: string;
  /** 语音识别结果（开通语音识别后才有） */
  Recognition?: string;
}

/** 视频消息 */
export interface WechatVideoMessage extends WechatBaseMessage {
  MsgType: 'video';
  MediaId: string;
  ThumbMediaId: string;
}

/** 链接消息 */
export interface WechatLinkMessage extends WechatBaseMessage {
  MsgType: 'link';
  Title: string;
  Description: string;
  Url: string;
}

/** 文件消息（公众号可接收） */
export interface WechatFileMessage extends WechatBaseMessage {
  MsgType: 'file';
  Title: string;
  Description: string;
  FileKey: string;
  FileMd5: string;
  FileTotalLen: number;
}

/** 所有微信消息类型联合 */
export type WechatMessage =
  | WechatTextMessage
  | WechatImageMessage
  | WechatVoiceMessage
  | WechatVideoMessage
  | WechatLinkMessage
  | WechatFileMessage;
```

- [ ] **Step 2：编写 XML 解析工具**

```typescript
// src/wechat/utils/xml-parser.ts
import { parseStringPromise, Builder } from 'xml2js';

/**
 * 解析微信 XML 消息体为 JavaScript 对象
 */
export async function parseWechatXml<T = Record<string, unknown>>(
  xml: string,
): Promise<T> {
  const result = await parseStringPromise(xml, {
    explicitArray: false, // 不包装为数组
    trim: true,
  });
  return result.xml as T;
}

/**
 * 构建微信回复 XML
 * 微信回调要求返回纯文本 success，此函数为 Phase 2+ 预留
 */
export function buildReplyXml(data: Record<string, unknown>): string {
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    cdata: true,
  });
  return builder.buildObject({ xml: data });
}
```

- [ ] **Step 3：编写加解密工具**

```typescript
// src/wechat/utils/crypto.ts
import * as crypto from 'crypto';

/**
 * 微信消息加解密工具
 * 基于微信公众平台技术文档：https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
 */

/**
 * 验证微信服务器签名
 * @param token - 公众号 Token
 * @param timestamp - 时间戳
 * @param nonce - 随机数
 * @param signature - 微信传来的签名
 * @returns 验证是否通过
 */
export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
): boolean {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1').update(str, 'utf-8').digest('hex');
  return sha1 === signature;
}

/**
 * 解密微信加密消息
 * @param encryptText - Base64 编码的密文
 * @param encodingAESKey - 消息加解密密钥（43 位）
 * @param appId - 公众号 AppId
 * @returns 解密后的明文 XML
 */
export function decryptMessage(
  encryptText: string,
  encodingAESKey: string,
  appId: string,
): string {
  // 43 位 EncodingAESKey 转为 32 位 AES Key
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');

  // Base64 解码密文
  const encrypted = Buffer.from(encryptText, 'base64');

  // AES-256-CBC 解密（IV 为 AES Key 的前 16 字节）
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    aesKey,
    aesKey.slice(0, 16),
  );
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  // 去除 PKCS#7 填充
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.slice(0, decrypted.length - pad);

  // 去除前 16 字节随机字符串
  const content = decrypted.slice(16);

  // 读取消息长度（4 字节大端序）
  const msgLen = content.readUInt32BE(0);

  // 提取消息体（跳过前 4 字节长度字段）
  const message = content.slice(4, 4 + msgLen).toString('utf-8');

  // 验证尾部 AppId
  const tailAppId = content.slice(4 + msgLen).toString('utf-8');
  if (tailAppId !== appId) {
    throw new Error('AppId verification failed');
  }

  return message;
}
```

- [ ] **Step 4：编写 WechatService**

```typescript
// src/wechat/wechat.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotesService } from '../notes/notes.service';
import { decryptMessage, verifySignature } from './utils/crypto';
import { parseWechatXml } from './utils/xml-parser';
import {
  WechatEncryptedMessage,
  WechatTextMessage,
} from './types/wechat-message.types';

/**
 * 微信消息服务
 * 处理公众号回调：Token 验证、消息解密、消息分发
 */
@Injectable()
export class WechatService {
  constructor(
    private readonly configService: ConfigService,
    private readonly notesService: NotesService,
  ) {}

  /**
   * 验证微信服务器签名
   * 用于 GET 回调的 Token 验证
   */
  verifyToken(signature: string, timestamp: string, nonce: string): boolean {
    const token = this.configService.get<string>('wechat.token', '');
    return verifySignature(token, timestamp, nonce, signature);
  }

  /**
   * 处理微信推送的消息
   * Phase 1 仅处理文本消息，其他类型忽略
   */
  async handleMessage(body: string): Promise<string> {
    // 1. 解析加密 XML
    const encrypted = await parseWechatXml<WechatEncryptedMessage>(body);

    // 2. 解密消息
    const encodingAESKey = this.configService.get<string>(
      'wechat.encodingAESKey',
      '',
    );
    const appId = this.configService.get<string>('wechat.appId', '');
    const plainXml = decryptMessage(
      encrypted.Encrypt,
      encodingAESKey,
      appId,
    );

    // 3. 解析明文 XML 为消息对象
    const message = await parseWechatXml<WechatTextMessage>(plainXml);

    // 4. 根据消息类型分发处理
    await this.dispatchMessage(message);

    // 5. 返回 success 给微信（由 Controller 返回）
    return 'success';
  }

  /**
   * 消息类型分发
   */
  private async dispatchMessage(message: WechatTextMessage) {
    switch (message.MsgType) {
      case 'text':
        await this.handleTextMessage(message);
        break;
      case 'image':
      case 'voice':
      case 'video':
      case 'file':
        // Phase 2 处理：入 BullMQ 队列异步下载上传
        console.log(`Multimedia message type ${message.MsgType} received, ignored in Phase 1`);
        break;
      default:
        console.log(`Unknown message type: ${message.MsgType}, ignored`);
    }
  }

  /**
   * 处理文本消息
   * 同步创建临时笔记
   */
  private async handleTextMessage(message: WechatTextMessage) {
    await this.notesService.createFromWechat({
      content: message.Content,
      rawContent: JSON.stringify(message), // 保留完整原始消息
      msgId: message.MsgId,
      createTime: message.CreateTime,
    });
  }
}
```

- [ ] **Step 5：编写 WechatController**

```typescript
// src/wechat/wechat.controller.ts
import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { WechatService } from './wechat.service';
import { WechatVerifyParams } from './types/wechat-message.types';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 微信回调控制器
 * 处理公众号服务器配置验证和消息接收
 */
@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  /**
   * 微信服务器 Token 验证
   * GET /wechat/callback?signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
   */
  @Get('callback')
  verify(@Query() params: WechatVerifyParams): string {
    const valid = this.wechatService.verifyToken(
      params.signature,
      params.timestamp,
      params.nonce,
    );
    return valid ? params.echostr : 'verification failed';
  }

  /**
   * 接收微信消息事件
   * POST /wechat/callback
   * 返回纯文本 success 给微信服务器
   */
  @Post('callback')
  async receive(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    // 获取原始 XML 请求体
    const body = (req as any).rawBody || (req.body as string);
    await this.wechatService.handleMessage(body);

    // 设置响应类型为 text/plain
    res.header('Content-Type', 'text/plain').send('success');
  }
}
```

> 注意：POST 回调需要获取 raw body，因为微信 XML 解密需要原始字节流。Fastify 默认解析为 JSON，需要在 WechatModule 中配置 `rawBody: true` 或者在 Controller 中直接读取 raw body。

- [ ] **Step 6：编写 WechatModule**

```typescript
// src/wechat/wechat.module.ts
import { Module } from '@nestjs/common';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';
import { NotesModule } from '../notes/notes.module';

@Module({
  imports: [NotesModule],
  controllers: [WechatController],
  providers: [WechatService],
})
export class WechatModule {}
```

- [ ] **Step 7：注册到 AppModule**

在 `src/app.module.ts` 的 imports 数组中添加 `WechatModule`。

- [ ] **Step 8：配置 WeChat Fastify 插件以保留 raw body**

在 `main.ts` 中，Fastify 需要处理 `text/xml` 类型的 body。添加 content type parser：

```typescript
// src/main.ts 中添加（在 app.listen 之前）
const fastifyInstance = app.getHttpAdapter().getInstance();

// 保留 XML content-type 的原始 body
fastifyInstance.addContentTypeParser(
  'text/xml',
  { parseAs: 'string' },
  (_req, body: string, _done) => {
    return body;
  },
);
```

- [ ] **Step 9：提交**

```bash
git add -A
git commit -m "feat: add WeChat module with message decryption and text note creation"
```

---

### Task 11：端到端整合测试

**Files:**
- Create: `test/app.e2e-spec.ts`
- Modify: `test/jest-e2e.json` (确保配置正确)

- [ ] **Step 1：安装测试依赖并创建 Jest 配置**

```bash
npm i --save-dev @nestjs/testing
npm i --save-dev supertest @types/supertest
```

创建 `test/jest-e2e.json`：

```jsonc
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [ ] **Step 2：编写 E2E 测试**

```typescript
// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

/**
 * E2E 集成测试
 * 通过设置环境变量覆盖 .env 配置，使用独立的 test 数据库
 */
describe('App E2E (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    // 覆盖数据库连接为测试库
    process.env.DATABASE_URL =
      'postgresql://postgres:password@localhost:5432/senhua_notes_test?schema=public';
    process.env.WECHAT_TOKEN = 'test_token';
    process.env.WECHAT_APP_ID = 'test_app_id';
    process.env.WECHAT_ENCODING_AES_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notes returns code 0 with items array', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/notes',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('total');
  });

  it('POST /notes/create creates a note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: 'E2E 测试笔记' },
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.title).toBe('E2E 测试笔记');
    expect(body.data.type).toBe('draft');
  });

  it('GET /categories returns tree structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/categories',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('GET /tags returns list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tags',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('POST /notes/delete soft-deletes a note', async () => {
    // 先创建一个笔记
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待删除笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    // 删除
    const deleteRes = await app.inject({
      method: 'POST',
      url: '/notes/delete',
      payload: { id: noteId },
    });

    const body = JSON.parse(deleteRes.payload);
    expect(body.code).toBe(0);

    // 查询列表不应包含已删除笔记
    const listRes = await app.inject({
      method: 'GET',
      url: '/notes',
    });
    const listBody = JSON.parse(listRes.payload);
    const found = listBody.data.items.find((n: any) => n.id === noteId);
    expect(found).toBeUndefined();
  });

  it('POST /notes/publish publishes a draft note', async () => {
    // 先创建一个临时笔记
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待发布笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    // 发布
    const publishRes = await app.inject({
      method: 'POST',
      url: '/notes/publish',
      payload: { id: noteId },
    });

    const body = JSON.parse(publishRes.payload);
    expect(body.code).toBe(0);
    expect(body.data.type).toBe('published');
  });

  it('POST /notes/archive toggles archive status', async () => {
    // 发布后归档
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待归档笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    // 先发布
    await app.inject({
      method: 'POST',
      url: '/notes/publish',
      payload: { id: noteId },
    });

    // 归档
    const archiveRes = await app.inject({
      method: 'POST',
      url: '/notes/archive',
      payload: { id: noteId },
    });
    const body = JSON.parse(archiveRes.payload);
    expect(body.code).toBe(0);
    expect(body.data.type).toBe('archived');

    // 取消归档
    const unarchiveRes = await app.inject({
      method: 'POST',
      url: '/notes/archive',
      payload: { id: noteId },
    });
    const unarchiveBody = JSON.parse(unarchiveRes.payload);
    expect(unarchiveBody.code).toBe(0);
    expect(unarchiveBody.data.type).toBe('published');
  });
});
```

- [ ] **Step 3：配置测试数据库环境变量**

创建 `.env.test`：

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/senhua_notes_test?schema=public
WECHAT_TOKEN=test_token
WECHAT_APP_ID=test_app_id
WECHAT_ENCODING_AES_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 4：运行测试数据库迁移和种子**

```bash
npx dotenv -e .env.test -- npx prisma migrate deploy
npx dotenv -e .env.test -- npx prisma db seed
```

- [ ] **Step 5：运行 E2E 测试**

```bash
npx jest --config test/jest-e2e.json --forceExit
```

预期：所有测试通过。

- [ ] **Step 6：提交**

```bash
git add -A
git commit -m "test: add E2E integration tests for notes, categories, and tags"
```

---

## 最终 AppModule 完整态

```typescript
// src/app.module.ts（完整版，Task 完成后的最终状态）
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import appConfig, { wechatConfig, qiniuConfig } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UserModule } from './user/user.module';
import { NotesModule } from './notes/notes.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { WechatModule } from './wechat/wechat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, wechatConfig, qiniuConfig],
    }),
    PrismaModule,
    UserModule,
    NotesModule,
    CategoriesModule,
    TagsModule,
    WechatModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
```

## 最终 main.ts 完整态

```typescript
// src/main.ts（完整版）
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true },
  );

  // 全局参数校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors();

  // 保留 text/xml 类型请求的原始 body（微信回调需要）
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addContentTypeParser(
    'text/xml',
    { parseAs: 'string' },
    (_req, body: string, _done) => {
      return body;
    },
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
```
