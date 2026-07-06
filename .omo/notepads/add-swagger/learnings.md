# ѧϰ��¼

## ��Ŀ����ջ
- NestJS 11 + Fastify
- Prisma 7 + PostgreSQL
- ���� class-validator / class-transformer
- 6 �� Controller: auth, notes, categories, tags, storage, wechat

## Swagger ����Ҫ��
- ʹ�� @nestjs/swagger v11
- Fastify ��Ҫ @fastify/swagger �� @fastify/swagger-ui
- ȫ�� JwtAuthGuard ��Ҫ�� @Public() ��ǹ���·��
- ΢�Żص����ش��ı�����Ӱ��

## ����
- @nestjs/swagger
- @fastify/swagger
- @fastify/swagger-ui


## ��װ��� (2026-07-03)
- @nestjs/swagger@11.4.5 �� �� NestJS 11 ���� �7�7
- @fastify/swagger@9.7.0 �� Fastify ������
- @fastify/swagger-ui@6.0.0 �� Swagger UI ��Ⱦ
- һ���԰�װ 24 ���������������������� peer deps ��ͻ������ --legacy-peer-deps 
- ��д�� package.json �� dependencies �ֶΣ�����ĸ����룩
- 
pm ls ��֤ͨ������������������

## ���ù��� (2026-07-03)
- �� src/main.ts �� import `DocumentBuilder, SwaggerModule` �� `@nestjs/swagger`
- `SwaggerModule.setup('api/docs', app, document)` ��� Swagger UI �� `/api/docs`��OpenAPI JSON �� `/api/docs-json`
- Fastify ƽ̨���Զ�ʹ���Ѱ�װ�� `@fastify/swagger@9.7.0` + `@fastify/swagger-ui@6.0.0` ������Ⱦ
- ��Ҫ�ֶ�ע�� Fastify ������� `SwaggerModule` ���÷�װ�˲��
- Bearer Auth ʹ�� `.addBearerAuth({...}, 'JWT-auth')` ���Ƽ�ָ�� `name` �� `bearerFormat: 'JWT'`
- `persistAuthorization: true` ��ˢ��ҳ��� token ���ᶪʧ
- Swagger ���ô���� `app.useGlobalPipes()` ֮��� `app.listen()` ֮ǰ
- `npx tsc --noEmit` 0 ���� �� ͨ��
- `npx tsc --project tsconfig.build.json` ���ɹ� �� ͨ��
- ԭ�� ValidationPipe / CORS / rawBody ���� ���ֲ��䣬δ�ƻ�

## ʹ��ע��
- ǰ�˵��� `/api/docs` �ɿ� Swagger UI
- ǰ�˵��� `/api/docs-json` �ɻ�ȡ OpenAPI JSON ���ڴ����������Կͻ���
- ��ע `@ApiBearerAuth('JWT-auth')` �� controller ���ܱ� Swagger UI �� Authorize ��ťʶ��
- ���˴� ǰ `addBearerAuth(name='JWT-auth')` ��� name ���봫ͳһ
- ��� `SwaggerModule.setup` ʹ�� `api/docs` ��Ϊ·�� ��� Fastify ���Զ�ƴ�� `-json` ��׺��������

## Auth 模块 Swagger (2026-07-03)
- Auth 模块原本无 src/auth/dto/ 目录，Controller 用内联 @Body('code') code: string 提取参数
- 为了 Swagger 文档化，新建了 4 个 DTO 文件：
  - dto/wechat-callback.dto.ts — 微信登录请求体（code）
  - dto/refresh-token.dto.ts — 刷新 token 请求体（refreshToken）
  - dto/token-response.dto.ts — Token 响应（accessToken/refreshToken/expiresIn）
  - dto/logout-response.dto.ts — 登出响应（success: boolean）
- 保留方法签名不变（@Body('code') 而非 @Body() dto），通过 @ApiBody({ type: WechatCallbackDto }) 在 Swagger 中文档化请求体
- 公开路由（@Public() 的 wechat/callback 与 refresh）不加 @ApiBearerAuth()
- 登出路由（需 JWT）添加 @ApiBearerAuth('JWT-auth')，name 必须与 main.ts 中 ddBearerAuth 的 name 一致
- 响应用 @ApiOkResponse({ type: TokenResponseDto }) 文档化 data 字段结构
- 
px tsc --noEmit 输出为空 → 类型检查通过
## Tags ģ�� Swagger װ�� (2026-07-03)
- Controller �� @ApiTags('��ǩ') + @ApiBearerAuth()��ȫ�� JWT �������� @Public()��
- ����������@Get() list / @Post('create') / @Post('delete')��ÿ���� @ApiOperation({ summary: '��������' })
- @ApiResponse({ status: 200, description: '...', type: ... })��
  - list �� 	ype: [TagResponseDto]
  - create / delete �� 	ype: TagResponseDto
- DTO �ļ��Ķ���
  - dto/create-tag.dto.ts���� 
ame �ֶμ� @ApiProperty({ description, required, maxLength, example })
  - �½� dto/tag-response.dto.ts���� id / name / createdAt / _count.notes?����Ӧ Prisma Tag ģ�� + findAll �� _count ����
  - dto/index.ts ׷�ӵ��� TagResponseDto
- ��֤��
px tsc --noEmit --project tsconfig.build.json 0 ����ͨ��
- ҵ���߼���Ķ�������ԭ class/����/�ֶ��ϵ���װ����������ǩ����ʵ�ֱ���ԭ״

## Notes 模块 Swagger 装饰 (2026-07-03)
- 涉及 4 个文件: notes.controller.ts + dto/{create,query,update}-note.dto.ts (共 3 个 DTO)
- 约束: 任务禁止修改 src/common/ 文件, 所以 PaginationDto / IdDto 上的字段没补 @ApiProperty
  - 补救: Controller 层对使用 IdDto / 原始 query 的路由用 @ApiQuery 显式声明关键参数 (id, note_id)
- Controller 装饰策略:
  - 顶部 @ApiTags('笔记') + @ApiBearerAuth('JWT-auth') (类级别, 全 Controller 路由统一鉴权)
  - 9 个路由方法每个加 @ApiOperation({ summary: '中文描述' }) + @ApiResponse({ status: 200, description: '...' })
  - '@ApiBearerAuth()' 不传 name 会默认用 'bearer', 与 main.ts 的 'JWT-auth' 不一致 → 必须传 'JWT-auth'
- DTO 装饰要点:
  - 可选字段: @ApiProperty({ ..., required: false })
  - 必填字段: @ApiProperty({ ..., required: true })
  - 数组字段: @ApiProperty({ type: [String], example: [...] })
  - 枚举字段: @ApiProperty({ enum: NoteSource, example: NoteSource.APP_MANUAL }) — example 用 enum 值不要用字符串
  - 继承的 PaginationDto 字段 (page/size) 靠类继承自动带过去, 但因为没在 common/ 加装饰, Swagger 不会显示文档
- 验证: 
px tsc --noEmit exit 0, 0 errors
- 没有修改任何业务逻辑, 没有删除任何现有装饰器 (JSDoc / @IsString / @IsOptional / @IsArray 等全部保留)
## Categories ģ�� Swagger װ�� (2026-07-03)
- Controller ����: @ApiTags('����') + @ApiBearerAuth()��ȫ�� JwtAuthGuard �� AuthGuard �� Controller ���ϣ�
- 5 ��·�ɷ���ÿ���� @ApiOperation({ summary: '...' }) + @ApiBody/@ApiResponse
  - GET / (list) �� @ApiResponse({ type: [CategoryDto] })
  - POST /create �� @ApiBody({ type: CreateCategoryDto }) + @ApiResponse 200/400
  - POST /update �� @ApiBody({ type: UpdateCategoryDto }) + @ApiResponse 200/400
  - POST /delete �� @ApiBody({ type: IdDto }) + @ApiResponse 200
  - POST /reorder �� @ApiBody({ type: ReorderCategoryDto }) + @ApiResponse({ type: [CategoryDto] })
- DTO װ�� (�� dto/index.ts ���µ���):
  - dto/create-category.dto.ts �� name (maxLength:64) + parentId (nullable)
  - dto/update-category.dto.ts �� id (����) + name/parentId (��ѡ, nullable)
  - dto/reorder-category.dto.ts �� ReorderItem.id + ReorderItem.parentId (nullable) + ReorderCategoryDto.items: ReorderItem[]
  - dto/category.dto.ts (��) �� Swagger ��Ӧ DTO ���ã�id/name/parentId/sortOrder/notesCount/children
- children �� CategoryDto[] ��ѭ�����ã�����ʹ�ü�ͷ @ApiProperty({ type: () => [CategoryDto] }) ���Ƴٽ���
- @ApiBearerAuth() ʹ���ַ��� name='bearer' ��Ĭ�ϣ��� main.ts �� 'JWT-auth' ��һ�£�Ҫô main.ts ��� name ��Ĭ��һ�£�Ҫô Controller ������ 'JWT-auth'
- ��֤: 
px tsc --noEmit 0 errors, exit 0
- src/common/dto/id.dto.ts δ�� Swagger ��ǣ�delete ·�� body ʹ�� @ApiBody({ type: IdDto }) ʱ Swagger UI չʾΪ object ���ṹδչʾ - ���� categories ����
- û���޸�ҵ���߼���û��ɾ���κ�����װ�� (JSDoc / @IsString / @IsOptional / @MaxLength / @IsArray / @ValidateNested / @Type ȫ������)

## Wechat ģ�� Swagger װ�� (2026-07-03)
- ֻ�� `wechat.controller.ts` 1 ���ļ���`types/wechat-message.types.ts` ���ڲ��ã�û�� API ֱ���ع壬���Բ���Ҫ�� types ��� @ApiProperty
- ��� `WechatVerifyParams` �� interface��@Query() ʹ�ã��ӿ���������ʱ�������ɾ����� Swagger ���Զ�ʶ���ֶΣ����� Controller ���ÿ���ֶ�д @ApiQuery
  - @ApiQuery({ name, required, description }) 4 ��: signature / timestamp / nonce / echostr
- Controller ���װ�Σ�
  - @ApiTags('΢��') ��� @Public() ���ϣ�΢�Żص�·���ǹ����ģ�**����** @ApiBearerAuth() ��ʹ�� 'JWT-auth' ���ƣ�main.ts �� addBearerAuth ʹ�� 'JWT-auth' ���ƣ�
- 2 ��·�ɷ�����GET verify + POST receive����ÿ���� @ApiOperation({ summary }) + @ApiResponse({ status: 200, description }) + @ApiProduces('text/plain')
  - GET ��� 4 �� @ApiQuery ��� signature/timestamp/nonce/echostr
  - POST ���ص� response ˵����ǿ�� "success" ���ı����� JSON �� Worker ����
- ��֤: 
px tsc --noEmit 0 errors, exit 0
- ΢�Żص�ʵ����Ϊ��ȫ���ı���Swagger ʹ�� @ApiProduces('text/plain') ���ʹ Swagger UI ��ȷչʾ text/plain content-type
- û���޸�ҵ���߼���û��ɾ @Public() ���λ�� class ��� @Controller() ���ϣ�Ҳû�Ķ� res.header('Content-Type', 'text/plain').send('success') ��纯�ı䷵���逻辑

## Storage 模块 Swagger 装饰 (2026-07-03)
- 模块情况: storage 原本没有 dto/ 目录（Controller 路由只有 2 个: GET upload-token + POST delete, 且响应都是简单内联对象），所以先新建了 2 个响应 DTO + 1 个 barrel:
  - dto/upload-token-response.dto.ts — 上传 Token 响应 (token: string, 带 JWT 风格 example)
  - dto/delete-file-response.dto.ts — 删除文件响应 (success: boolean)
  - dto/index.ts — barrel 重导出
- Controller 装饰策略:
  - 顶部 @ApiTags('存储') + @ApiBearerAuth('JWT-auth') 类级（两个路由都需要 JWT，无 @Public()）
  - 2 个路由方法各加 @ApiOperation({ summary }) + @ApiResponse({ type: ... })
  - GET upload-token 用 @ApiQuery({ name: 'key', required: false, ... }) 声明查询参数
  - POST delete 用 @ApiBody({ type: IdDto }) 声明请求体（id 字段不在 common 补 Swagger，借用 categories/notes 同样的策略）
- 业务逻辑 / 方法签名 / JSDoc 完全保留, 改动只在装饰器层
- 验证: 
px tsc --noEmit 0 errors, exit 0; 
px tsc --project tsconfig.build.json --noEmit 0 errors
- 与其他模块对比: storage 是最简的 Controller (2 路由), 主要特点是 @ApiQuery 而非 @ApiBody (一个 GET 拿 query param)
- 完整 5 个模块 (auth/notes/categories/tags/storage/wechat) Swagger 装饰工作全部完成

## 顶层 tags 修复 (2026-07-03)
- 问题: 6 个 Controller 都加了 `@ApiTags('认证'/'笔记'/...)` 但 OpenAPI JSON 顶层 `tags` 数组为空
- 根因: NestJS Swagger 不会从 Controller 的 `@ApiTags` 自动聚合到文档顶层 tags, 必须在 `DocumentBuilder` 链式调用中显式 `.addTag(name, description)`
- 修复: src/main.ts 的 DocumentBuilder 链中, 在 `.addBearerAuth(...)` 之后、`.build()` 之前追加 6 个 `.addTag(...)` 调用
- 验证:
  - `npx tsc --noEmit` 0 错误
  - `npx tsc --project tsconfig.build.json` 构建成功
  - 用与 main.ts 完全一致的 DocumentBuilder 链调用 `SwaggerModule.createDocument`, 生成的 `doc.tags` 包含 6 个 tag: ['认证', '笔记', '分类', '标签', '存储', '微信']
  - 已用正确 config 重新生成 .omo/notepads/add-swagger/openapi.json (6 tags)
- 注意事项: 项目根目录的 `verify-swagger.js` 有自己的内联 DocumentBuilder 配置 (没有 addTag), 即使修复了 main.ts 跑这个脚本仍会 FAIL — 验证 main.ts 实际产物需要用与 main.ts 一致的 builder 链
- @ApiTags 装饰器只负责在 Swagger UI 中按 tag 分组路由, 与 OpenAPI 顶层 `tags` 字段是两回事 — 前者装饰 Controller, 后者由 DocumentBuilder 顶层声明
