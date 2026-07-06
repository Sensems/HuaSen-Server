import { ApiProperty } from '@nestjs/swagger';

/**
 * Token 响应 DTO
 * 微信登录 / 刷新 access_token 接口的 data 字段结构
 */
export class TokenResponseDto {
  /** 访问令牌（2 小时有效） */
  @ApiProperty({
    description: '访问令牌（access_token，2 小时有效）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  /** 刷新令牌（7 天有效，用于换取新的 access_token） */
  @ApiProperty({
    description: '刷新令牌（refresh_token，7 天有效）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;

  /** access_token 过期时间（秒） */
  @ApiProperty({
    description: 'access_token 过期时间（秒）',
    example: 7200,
  })
  expiresIn!: number;
}
