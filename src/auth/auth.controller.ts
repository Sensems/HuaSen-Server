import { Controller, Post, Body, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { WechatCallbackDto } from './dto/wechat-callback.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { EmailSendCodeDto } from './dto/email-send-code.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';

/**
 * 认证控制器
 * 微信 OAuth 登录、JWT 签发/刷新/登出
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 微信 OAuth 登录
   * POST /auth/wechat/callback
   * 用微信授权 code 换取 JWT 令牌
   */
  @Public()
  @Post('wechat/callback')
  @ApiOperation({ summary: '微信 OAuth 登录' })
  @ApiBody({ type: WechatCallbackDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @ApiResponse({ status: 401, description: '认证失败' })
  async wechatLogin(@Body() body: WechatCallbackDto) {
    return this.authService.wechatLogin(body.code);
  }

  /**
   * 发送邮箱验证码
   * POST /auth/email/send-code
   */
  @Public()
  @Post('email/send-code')
  @ApiOperation({ summary: '发送邮箱验证码' })
  @ApiBody({ type: EmailSendCodeDto })
  @ApiResponse({ status: 200, description: '发送成功' })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async sendEmailCode(@Body() body: EmailSendCodeDto) {
    return this.authService.sendEmailCode(body.email);
  }

  /**
   * 邮箱注册
   * POST /auth/email/register
   */
  @Public()
  @Post('email/register')
  @ApiOperation({ summary: '邮箱注册' })
  @ApiBody({ type: EmailRegisterDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async emailRegister(@Body() body: EmailRegisterDto) {
    return this.authService.emailRegister(body);
  }

  /**
   * 邮箱登录
   * POST /auth/email/login
   */
  @Public()
  @Post('email/login')
  @ApiOperation({ summary: '邮箱登录' })
  @ApiBody({ type: EmailLoginDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  async emailLogin(@Body() body: EmailLoginDto) {
    return this.authService.emailLogin(body);
  }

  /**
   * 刷新 access_token
   * POST /auth/refresh
   * 用 refresh_token 换取新的 access_token
   */
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '刷新 access_token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  @ApiResponse({ status: 401, description: '认证失败' })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /**
   * 登出
   * POST /auth/logout
   * 将当前 access_token 加入黑名单
   */
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出' })
  @ApiResponse({ status: 200, type: LogoutResponseDto })
  @ApiResponse({ status: 401, description: '认证失败' })
  async logout(
    @CurrentUser() user: CurrentUserInfo,
    @Headers('authorization') authHeader?: string,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(accessToken);
  }
}
