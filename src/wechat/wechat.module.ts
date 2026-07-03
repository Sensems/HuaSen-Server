import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';
import { WechatAccessTokenService } from './wechat-access-token.service';
import { WechatMessageProcessor } from '../queue/processors/wechat-message.processor';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'wechat-message' }),
    StorageModule,
  ],
  controllers: [WechatController],
  providers: [WechatService, WechatAccessTokenService, WechatMessageProcessor],
  exports: [WechatService, WechatAccessTokenService],
})
export class WechatModule {}
