import { ApiProperty } from '@nestjs/swagger';

/**
 * 七牛云上传 Token 响应 DTO
 * 用于 GET /storage/upload-token 接口的 data 字段
 */
export class UploadTokenResponseDto {
  /** 七牛云直传 Token（有效期 1 小时） */
  @ApiProperty({
    description: '七牛云直传凭证 Token（有效期 1 小时，App 端使用该 Token 走直传）',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InNlbmh1YS1ub3RlcyIsImRlYWRsaW5lIjoxNzMyNDM2NDAwfQ.signature',
  })
  token!: string;
}
