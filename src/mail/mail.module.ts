import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * 邮件模块（全局）
 * 导出 MailService，任何模块可直接注入
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
