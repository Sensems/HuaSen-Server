import { ApiProperty } from '@nestjs/swagger';

/**
 * 删除文件响应 DTO
 * 用于 POST /storage/delete 接口的 data 字段
 */
export class DeleteFileResponseDto {
  /** 是否删除成功 */
  @ApiProperty({
    description: '七牛云侧文件是否删除成功（true=成功，false=失败）',
    example: true,
  })
  success!: boolean;
}
