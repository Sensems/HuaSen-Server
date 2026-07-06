import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueAdminService } from './queue-admin.service';
import { QueueAdminController } from './queue-admin.controller';

/**
 * 任务队列模块
 * 基于 BullMQ + Redis，处理微信消息的异步下载和上传
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD', '') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'wechat-message',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  controllers: [QueueAdminController],
  providers: [QueueAdminService],
  exports: [BullModule],
})
export class QueueModule {}
