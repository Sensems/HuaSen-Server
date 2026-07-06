import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 刷新 access_token 请求 DTO
 * 用于 POST /auth/refresh
 */
export class RefreshTokenDto {
  /** 刷新令牌（refresh_token），用于换取新的 access_token */
  @ApiProperty({
    description: '刷新令牌（refresh_token）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}
