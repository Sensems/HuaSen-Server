import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { JwtPayload } from './strategies/jwt.strategy';
import axios from 'axios';
import { MailService } from '../mail/mail.service';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import bcrypt from 'bcrypt';

/** 微信 OAuth access_token 响应 */
interface WechatOAuthToken {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
}

/** 微信用户信息 */
interface WechatUserInfo {
  openid: string;
  nickname: string;
  headimgurl: string;
  unionid?: string;
}

/**
 * 认证服务
 * 微信 OAuth 登录、JWT 签发/刷新、登出
 */
@Injectable()
export class AuthService {
  /** 存储已注销的 token（Phase 3 用内存，后续替换为 Redis） */
  private blacklistedTokens = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * 微信 OAuth 登录
   * 用 code 换取 access_token 和 openid，创建或更新用户，返回 JWT
   */
  async wechatLogin(code: string) {
    const appId = this.configService.get<string>('wechat.appId', '');
    const appSecret = this.configService.get<string>('WECHAT_APP_SECRET', '');

    // 1. 用 code 换取 access_token
    const tokenUrl =
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;

    const { data: tokenData } = await axios.get<WechatOAuthToken>(tokenUrl, {
      timeout: 10000,
    });

    if (!tokenData.openid) {
      throw new BusinessException(ErrorCode.WECHAT_AUTH_FAILED, '微信授权失败');
    }

    // 2. 获取用户信息
    let nickname = '';
    let avatar = '';
    if (tokenData.access_token) {
      try {
        const userInfoUrl =
          `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}&lang=zh_CN`;
        const { data: userInfo } = await axios.get<WechatUserInfo>(userInfoUrl, {
          timeout: 10000,
        });
        nickname = userInfo.nickname || '';
        avatar = userInfo.headimgurl || '';
      } catch {
        // 获取用户信息失败不影响登录
      }
    }

    // 3. 创建或更新用户
    const user = await this.prisma.user.upsert({
      where: { wxOpenid: tokenData.openid },
      update: { nickname, avatar, wxUnionid: tokenData.unionid },
      create: {
        wxOpenid: tokenData.openid,
        wxUnionid: tokenData.unionid,
        nickname,
        avatar,
        role: 'USER',
      },
    });

    // 4. 签发 JWT
    return this.generateTokens(user.id, user.wxOpenid || undefined);
  }

  /**
   * 发送邮箱验证码
   * 生成6位随机数字，写入DB，通过 Resend 发送邮件
   */
  async sendEmailCode(email: string): Promise<void> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.emailVerificationCode.create({
      data: {
        email,
        code,
        purpose: 'register',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    try {
      await this.mailService.sendVerificationCode(email, code);
    } catch (error) {
      throw new BusinessException(
        ErrorCode.EMAIL_SEND_FAILED,
        '邮件发送失败，请稍后重试',
      );
    }
  }

  /**
   * 生成唯一绑定码（6位大写字母数字）
   */
  private async generateBindingCode(): Promise<string> {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)],
      ).join('');
      const existing = await this.prisma.user.findUnique({
        where: { bindingCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique binding code');
  }

  /**
   * 邮箱注册
   * 校验邮箱唯一性 → 校验验证码 → 标记已用 → 哈希密码 → 创建用户 → 返回JWT
   */
  async emailRegister(dto: EmailRegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BusinessException(ErrorCode.EMAIL_ALREADY_REGISTERED);
    }

    const verification = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email: dto.email,
        code: dto.code,
        purpose: 'register',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      const anyForEmail = await this.prisma.emailVerificationCode.findFirst({
        where: {
          email: dto.email,
          code: dto.code,
          purpose: 'register',
          usedAt: null,
        },
      });
      throw new BusinessException(
        anyForEmail
          ? ErrorCode.VERIFICATION_CODE_EXPIRED
          : ErrorCode.VERIFICATION_CODE_INVALID,
      );
    }

    await this.prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const bindingCode = await this.generateBindingCode();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        bindingCode,
        role: 'USER',
      },
      select: { id: true, email: true },
    });

    return this.generateTokens(user.id, undefined, user.email || undefined);
  }

  /**
   * 邮箱登录
   * 查用户 → 校验密码 → 返回JWT
   */
  async emailLogin(dto: EmailLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, email: true },
    });

    if (!user) {
      throw new BusinessException(ErrorCode.EMAIL_NOT_FOUND);
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash!);
    if (!valid) {
      throw new BusinessException(ErrorCode.PASSWORD_INCORRECT);
    }

    return this.generateTokens(user.id, undefined, user.email || undefined);
  }

  /**
   * 刷新 access_token
   */
  async refreshToken(refreshToken: string) {
    // 检查是否在黑名单
    if (this.blacklistedTokens.has(refreshToken)) {
      throw new BusinessException(ErrorCode.TOKEN_INVALID, 'Token 已注销');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'default-refresh-secret'),
      });

      return this.generateTokens(payload.sub, payload.openid || undefined, payload.email);
    } catch {
      throw new BusinessException(ErrorCode.TOKEN_EXPIRED, 'Refresh Token 已过期');
    }
  }

  /**
   * 登出
   * 将 access_token 和 refresh_token 加入黑名单
   */
  async logout(accessToken: string, refreshToken?: string) {
    this.blacklistedTokens.add(accessToken);
    if (refreshToken) {
      this.blacklistedTokens.add(refreshToken);
    }

    // 定期清理黑名单（简单实现，生产环境用 Redis）
    setTimeout(() => {
      this.blacklistedTokens.delete(accessToken);
      if (refreshToken) this.blacklistedTokens.delete(refreshToken);
    }, 7 * 24 * 60 * 60 * 1000); // 7天后自动过期

    return { success: true };
  }

  /**
   * 检查 token 是否在黑名单中
   */
  isTokenBlacklisted(token: string): boolean {
    return this.blacklistedTokens.has(token);
  }

  /**
   * 签发 JWT（access_token + refresh_token）
   */
  private generateTokens(userId: string, openid?: string, email?: string) {
    const payload: JwtPayload = {
      sub: userId,
      openid: openid || undefined,
      email: email || undefined,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '2h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'default-refresh-secret'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, expiresIn: 7200 };
  }
}
