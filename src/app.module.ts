import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { appConfig, wechatConfig, qiniuConfig, emailConfig, throttleConfig } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpLoggerInterceptor } from './common/interceptors/http-logger.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { NotesModule } from './notes/notes.module';
import { CategoriesModule } from './categories/categories.module';
import { TagsModule } from './tags/tags.module';
import { WechatModule } from './wechat/wechat.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { MailModule } from './mail/mail.module';

/**
 * 应用根模块
 * 注册全局配置、过滤器、拦截器、JWT 守卫和所有功能模块
 * 限流不走全局 Guard，仅 /auth/email/send-code 局部启用
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, wechatConfig, qiniuConfig, emailConfig, throttleConfig],
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    UserModule,
    NotesModule,
    CategoriesModule,
    TagsModule,
    WechatModule,
    QueueModule,
    StorageModule,
    MediaModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggerInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
