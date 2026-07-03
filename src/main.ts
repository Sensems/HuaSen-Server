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
