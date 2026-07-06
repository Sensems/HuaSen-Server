import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WechatController } from './wechat.controller';
import { WechatService } from './wechat.service';
import { WechatAccessTokenService } from './wechat-access-token.service';
import { WechatReplyService } from './wechat-reply.service';
import { WechatMessageProcessor } from '../queue/processors/wechat-message.processor';
import { StorageModule } from '../storage/storage.module';
import { MediaModule } from '../media/media.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'wechat-message' }),
    StorageModule,
    MediaModule,
    UserModule,
  ],
  controllers: [WechatController],
  providers: [WechatService, WechatAccessTokenService, WechatReplyService, WechatMessageProcessor],
  exports: [WechatService, WechatAccessTokenService],
})
export class WechatModule {}
