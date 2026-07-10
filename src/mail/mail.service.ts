import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * 邮件服务
 * 封装 Resend API，提供邮件发送能力
 */
@Injectable()
export class MailService {
  constructor(private configService: ConfigService) {}

  /**
   * 发送邮箱验证码
   * @param email 目标邮箱
   * @param code 6位验证码
   */
  async sendVerificationCode(email: string, code: string): Promise<void> {
    const resend = new Resend(
      this.configService.get<string>('email.resendApiKey'),
    );
    const { error } = await resend.emails.send({
      from: this.configService.get<string>('email.from')!,
      to: email,
      subject: '森华笔记 - 邮箱验证码',
      html: `<p>您的验证码是：<strong>${code}</strong>，10分钟内有效。</p>`,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}
