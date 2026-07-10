import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * JWT 负载内容
 */
export interface JwtPayload {
  sub: string;      // 用户 ID
  openid?: string;  // 微信 openId（邮箱用户为 undefined）
  email?: string;   // 邮箱（微信用户为 undefined）
}

/**
 * JWT 验证策略
 * 从 Authorization header 提取 Bearer token，验证并解析用户信息
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'default-secret-change-me'),
    });
  }

  /**
   * 验证 JWT payload 并返回用户信息
   * 返回的对象会被注入到 req.user
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) return null;

    return {
      id: user.id,
      openid: user.wxOpenid,
      nickname: user.nickname,
      role: user.role,
      email: user.email,
    };
  }
}
