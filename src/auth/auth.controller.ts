import { Controller, Post, Body, Headers, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import {
  ApiWrappedErrorResponse,
  ApiWrappedOkResponse,
} from '../common/decorators/api-wrapped-response.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
} from '@nestjs/swagger';
import { WechatCallbackDto } from './dto/wechat-callback.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { EmailSendCodeDto } from './dto/email-send-code.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailResetPasswordDto } from './dto/email-reset-password.dto';

const TOKEN_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh',
  expiresIn: 7200,
};

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
  @ApiOperation({ summary: '微信 OAuth 登录', description: '用微信授权 code 换取 JWT。' })
  @ApiBody({
    type: WechatCallbackDto,
    examples: {
      默认: { value: { code: '081aB6tM0xj3bV1eYz2oM1tLqM0aB6tM' } },
    },
  })
  @ApiWrappedOkResponse({
    description: '登录成功',
    dataDto: TokenResponseDto,
    dataExample: TOKEN_EXAMPLE,
  })
  @ApiWrappedErrorResponse({
    description: '认证失败',
    example: { code: 10002, message: '未登录或登录已过期', data: null },
  })
  async wechatLogin(@Body() body: WechatCallbackDto) {
    return this.authService.wechatLogin(body.code);
  }

  /**
   * 发送邮箱验证码
   * POST /auth/email/send-code
   * 全站唯一启用 IP 限流的接口
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @Public()
  @Post('email/send-code')
  @ApiOperation({
    summary: '发送邮箱验证码',
    description: '限流 1 次/分钟。register：已注册报错；reset_password：未注册报错。',
  })
  @ApiBody({
    type: EmailSendCodeDto,
    examples: {
      注册: { value: { email: 'user@example.com', purpose: 'register' } },
      重置密码: { value: { email: 'user@example.com', purpose: 'reset_password' } },
    },
  })
  @ApiWrappedOkResponse({ description: '发送成功（data 为 null）', dataExample: null })
  @ApiWrappedErrorResponse({
    description: '邮箱未注册（reset_password）',
    example: { code: 20011, message: '该邮箱未注册', data: null },
  })
  async sendEmailCode(@Body() body: EmailSendCodeDto) {
    return this.authService.sendEmailCode(body.email, body.purpose);
  }

  /**
   * 邮箱注册
   * POST /auth/email/register
   */
  @Public()
  @Post('email/register')
  @ApiOperation({
    summary: '邮箱注册',
    description: '注册成功后 data 为 null，需再调用登录接口获取 JWT。',
  })
  @ApiBody({
    type: EmailRegisterDto,
    examples: {
      默认: {
        value: {
          email: 'user@example.com',
          password: 'Abc12345',
          code: '482931',
        },
      },
    },
  })
  @ApiWrappedOkResponse({ description: '注册成功（data 为 null）', dataExample: null })
  @ApiWrappedErrorResponse({
    description: '邮箱已注册',
    example: { code: 20010, message: '该邮箱已注册', data: null },
  })
  async emailRegister(@Body() body: EmailRegisterDto) {
    return this.authService.emailRegister(body);
  }

  /**
   * 邮箱重置密码
   * POST /auth/email/reset-password
   */
  @Public()
  @Post('email/reset-password')
  @ApiOperation({
    summary: '邮箱重置密码',
    description: '成功只返回提示，不签发 JWT。',
  })
  @ApiBody({
    type: EmailResetPasswordDto,
    examples: {
      默认: {
        value: {
          email: 'user@example.com',
          password: 'Abc12345',
          code: '482931',
        },
      },
    },
  })
  @ApiWrappedOkResponse({ description: '重置成功（data 为 null）', dataExample: null })
  @ApiWrappedErrorResponse({
    description: '验证码错误',
    example: { code: 20012, message: '验证码错误', data: null },
  })
  async emailResetPassword(@Body() body: EmailResetPasswordDto) {
    return this.authService.emailResetPassword(body);
  }

  /**
   * 邮箱登录
   * POST /auth/email/login
   */
  @Public()
  @Post('email/login')
  @ApiOperation({
    summary: '邮箱登录',
    description: '成功返回 JWT。',
  })
  @ApiBody({
    type: EmailLoginDto,
    examples: {
      默认: { value: { email: 'user@example.com', password: 'Abc12345' } },
    },
  })
  @ApiWrappedOkResponse({
    description: '登录成功',
    dataDto: TokenResponseDto,
    dataExample: TOKEN_EXAMPLE,
  })
  @ApiWrappedErrorResponse({
    description: '密码错误',
    example: { code: 20014, message: '密码错误', data: null },
  })
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
  @ApiOperation({ summary: '刷新 access_token', description: '用 refreshToken 换新的 access / refresh。' })
  @ApiBody({
    type: RefreshTokenDto,
    examples: {
      默认: {
        value: { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh' },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '刷新成功',
    dataDto: TokenResponseDto,
    dataExample: TOKEN_EXAMPLE,
  })
  @ApiWrappedErrorResponse({
    description: '认证失败',
    example: { code: 10002, message: '未登录或登录已过期', data: null },
  })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /**
   * 登出
   * POST /auth/logout
   * 将当前 access_token 加入黑名单
   */
  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '登出', description: '将当前 accessToken 加入黑名单。' })
  @ApiWrappedOkResponse({
    description: '登出成功',
    dataDto: LogoutResponseDto,
    dataExample: { success: true },
  })
  async logout(
    @CurrentUser() user: CurrentUserInfo,
    @Headers('authorization') authHeader?: string,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') || '';
    return this.authService.logout(accessToken);
  }
}
