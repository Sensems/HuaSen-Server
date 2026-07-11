import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

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
      host: this.configService.get<string>("email.smtpHost"),
      port: this.configService.get<number>("email.smtpPort", 465),
      secure: true, // 465端口使用 SSL
      auth: {
        user: this.configService.get<string>("email.smtpUser"),
        pass: this.configService.get<string>("email.smtpPass"),
      },
    });

    const from = this.configService.get<string>("email.from") || "";
    const supportEmail = this.resolveSupportEmail(from);
    const spacedCode = code.split("").join(" ");

    await transporter.sendMail({
      from,
      to: email,
      subject: "你的花森笔记验证码",
      html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:48px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6;">
    <div style="text-align:center;margin-bottom:40px;">
      <span style="font-size:28px;font-weight:700;letter-spacing:-0.5px;color:#111111;">花森</span><span style="font-size:28px;font-weight:600;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#E55B48;">笔记</span>
    </div>

    <p style="margin:0 0 8px;font-size:15px;color:#1a1a1a;">你好，</p>
    <p style="margin:0 0 28px;font-size:15px;color:#1a1a1a;">你正在使用此邮箱注册花森笔记账号。请使用以下验证码完成验证：</p>

    <div style="background:#F5F5F5;border-radius:12px;padding:28px 24px;text-align:center;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:2px;color:#9a9a9a;margin-bottom:12px;">VERIFICATION CODE</div>
      <div style="font-size:36px;font-weight:700;letter-spacing:.1rem;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${spacedCode}</div>
      <p style="margin:16px 0 0;font-size:13px;color:#666666;">验证码将在 <span style="color:#E55B48;font-weight:600;">10 分钟</span>内有效，请尽快使用。</p>
    </div>

    <div style="background:#FFF5F5;border-left:4px solid #E55B48;padding:14px 16px;margin-bottom:32px;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:13px;color:#555555;line-height:1.5;"><strong style="color:#333333;">安全提示：</strong>花森笔记工作人员不会以任何理由向你索要此验证码。请勿将验证码泄露给他人。</p>
    </div>

    <div style="border-top:1px solid #EAEAEA;padding-top:24px;text-align:center;">
      <p style="margin:0 0 20px;font-size:13px;color:#888888;">如果这不是你的操作，请忽略此邮件，或联系 <a href="mailto:${supportEmail}" style="color:#888888;text-decoration:underline;">${supportEmail}</a></p>
      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#AAAAAA;">花森<span style="color:#E55B48;">笔记</span> · MMXXVI</p>
    </div>
  </div>
</body>
</html>
      `,
    });
  }

  /**
   * 从发件人地址推导 support 邮箱
   */
  private resolveSupportEmail(from: string): string {
    const match = from.match(/<([^>]+)>/) ?? from.match(/([\w.+-]+@[\w.-]+)/);
    const address = match?.[1] ?? "support@example.com";
    return address.replace(/^noreply@/i, "support@");
  }
}
