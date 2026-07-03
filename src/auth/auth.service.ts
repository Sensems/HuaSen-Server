import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { JwtPayload } from './strategies/jwt.strategy';
import axios from 'axios';

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
    return this.generateTokens(user.id, user.wxOpenid || '');
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

      return this.generateTokens(payload.sub, payload.openid);
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
  private generateTokens(userId: string, openid: string) {
    const payload: JwtPayload = { sub: userId, openid };

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
