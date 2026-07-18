import { ApiProperty } from '@nestjs/swagger';

/**
 * 微信空壳绑定响应 DTO
 */
export class BindUserResponseDto {
  @ApiProperty({ example: true })
  wxBound!: true;

  @ApiProperty({ description: '从空壳同步过来的草稿数', example: 3 })
  syncedDraftCount!: number;

  @ApiProperty({ description: '是否覆盖了其他账号上的同 openid', example: false })
  overwritten!: boolean;

  @ApiProperty({ example: '绑定成功' })
  message!: string;
}
