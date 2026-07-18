import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";

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

  // 注册 multipart（POST /storage/upload 等文件上传）
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // 注册 text/xml 内容类型解析器（微信 POST 消息使用此 Content-Type）
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addContentTypeParser(
    "text/xml",
    { parseAs: "string" },
    (_req, body: string, done) => {
      done(null, body);
    },
  );

  // 启用全局参数校验（class-validator 装饰器生效）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剥离非 DTO 定义的字段
      transform: true, // 自动类型转换
      transformOptions: {
        enableImplicitConversion: true, // Query 参数自动转数字等
      },
    }),
  );

  // 启用全局 CORS（任意来源可跨域访问）
  app.enableCors({
    origin: true, // 反射请求 Origin，允许任意来源
    credentials: true,
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
    ],
  });

  // 配置 Swagger / OpenAPI 文档
  // 通过 @fastify/swagger + @fastify/swagger-ui 渲染 Swagger UI
  const swaggerConfig = new DocumentBuilder()
    .setTitle("花森笔记 API")
    .setDescription(
      [
        "微信公众号驱动的个人笔记系统。",
        "",
        "## 统一响应",
        "除 `/wechat/*` 外，成功响应均为：",
        "```json",
        '{ "code": 0, "message": "ok", "data": {} }',
        "```",
        "业务错误多为 HTTP 200，通过 `code` 区分（见错误码）。",
        "",
        "## 认证",
        "需登录接口点击 Authorize，填入 `accessToken`（按 UI 提示是否加 Bearer 前缀）。",
      ].join("\n"),
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description: "请输入 JWT accessToken",
        in: "header",
      },
      "JWT-auth",
    )
    .addTag("认证", "微信 OAuth、邮箱注册登录、JWT 刷新/登出")
    .addTag("用户", "资料查询/更新、微信空壳绑定")
    .addTag("笔记", "笔记增删改查与状态流转、置顶、分享")
    .addTag("分类", "分类树管理与拖拽排序")
    .addTag("标签", "标签创建（同名复用）与删除")
    .addTag("媒体", "媒体归属校验")
    .addTag("存储", "七牛云上传 Token、上传与删除")
    .addTag("微信", "公众号服务器校验与消息接收（非 JSON）")
    .addTag("队列管理", "BullMQ 运维接口（公开，生产请加保护）")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 刷新页面后保留已填写的 token
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`Application is running on: http://127.0.0.1:${port}`);
  console.log(`Swagger UI:  http://127.0.0.1:${port}/api/docs`);
  console.log(`OpenAPI JSON: http://127.0.0.1:${port}/api/docs-json`);
}
bootstrap();
