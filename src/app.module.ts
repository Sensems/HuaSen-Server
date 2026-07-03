import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

/**
 * 应用根模块
 * 后续逐步注册各功能模块和全局过滤器/拦截器
 */
@Module({
  imports: [PrismaModule],
})
export class AppModule {}
