import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import type { FastifyRequest } from 'fastify';

/**
 * 认证控制器
 * 微信 OAuth 登录、JWT 签发/刷新/登出
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 微信 OAuth 登录
   * POST /auth/wechat/callback
   * body: { code: "微信授权 code" }
   */
  @Public()
  @Post('wechat/callback')
  async wechatLogin(@Body('code') code: string) {
    return this.authService.wechatLogin(code);
  }

  /**
   * 刷新 access_token
   * POST /auth/refresh
   * body: { refreshToken: "xxx" }
   */
  @Public()
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  /**
   * 登出
   * POST /auth/logout
   */
  @Post('logout')
  async logout(@Req() req: FastifyRequest) {
    const authHeader = req.headers['authorization'] as string;
    const accessToken = authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(accessToken);
  }
}
