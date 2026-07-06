import { ApiProperty } from '@nestjs/swagger';

/**
 * 登出响应 DTO
 * POST /auth/logout 接口的 data 字段结构
 */
export class LogoutResponseDto {
  /** 登出是否成功 */
  @ApiProperty({
    description: '登出是否成功',
    example: true,
  })
  success!: boolean;
}
