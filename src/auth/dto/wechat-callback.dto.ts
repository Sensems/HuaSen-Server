import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 微信 OAuth 回调请求 DTO
 * 用于 POST /auth/wechat/callback
 */
export class WechatCallbackDto {
  /** 微信授权回调 code（由前端 wx.login 或网页授权获取） */
  @ApiProperty({
    description: '微信授权回调 code',
    example: '081aB6tM0xj3bV1eYz2oM1tLqM0aB6tM',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  code!: string;
}
