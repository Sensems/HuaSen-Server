import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
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

  // 启用 CORS（App 端跨域访问）
  app.enableCors();

  // 配置 Swagger / OpenAPI 文档
  // 通过 @fastify/swagger + @fastify/swagger-ui 渲染 Swagger UI
  const swaggerConfig = new DocumentBuilder()
    .setTitle("森花笔记 API")
    .setDescription("微信公众号驱动的个人笔记系统")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description: "请输入 JWT Token",
        in: "header",
      },
      "JWT-auth",
    )
    .addTag("认证", "微信 OAuth 登录、JWT 签发/刷新/登出")
    .addTag("笔记", "笔记的增删改查与状态流转")
    .addTag("分类", "分类树管理与拖拽排序")
    .addTag("标签", "标签的创建与删除")
    .addTag("存储", "七牛云上传 Token 与文件删除")
    .addTag("微信", "公众号服务器配置验证与消息接收")
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
