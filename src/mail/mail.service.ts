import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * 邮件服务
 * 通过 SMTP 发送邮件
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
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>('email.smtpHost'),
      port: this.configService.get<number>('email.smtpPort', 465),
      secure: true,  // 465端口使用 SSL
      auth: {
        user: this.configService.get<string>('email.smtpUser'),
        pass: this.configService.get<string>('email.smtpPass'),
      },
    });

    await transporter.sendMail({
      from: this.configService.get<string>('email.from'),
      to: email,
      subject: '森华笔记 - 邮箱验证码',
      html: `
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
          <div style="padding:24px 0;text-align:center;background:#f5f7fa;border-radius:8px 8px 0 0">
            <div style="font-size:28px;margin-bottom:4px">📝</div>
            <div style="font-size:18px;font-weight:600;color:#1a1a2e">森华笔记</div>
          </div>
          <div style="padding:32px 24px;background:#fff;border:1px solid #e8ecf1;border-top:none;border-radius:0 0 8px 8px">
            <p style="margin:0 0 16px;font-size:15px;color:#333">您好，您正在进行邮箱验证：</p>
            <div style="text-align:center;padding:20px;background:#f0f4ff;border-radius:6px;margin-bottom:20px">
              <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2d5af0">${code}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#999">验证码 10 分钟内有效，请勿转发给他人。如非本人操作，请忽略此邮件。</p>
          </div>
        </div>
      `,
    });
  }
}
