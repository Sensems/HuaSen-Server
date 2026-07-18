import { ApiProperty } from '@nestjs/swagger';

/**
 * 上传文件响应 DTO
 * 用于 POST /storage/upload 接口的 data 字段
 */
export class UploadFileResponseDto {
  /** 媒体记录 ID（后续用于关联笔记） */
  @ApiProperty({
    description: '媒体记录 ID（后续用于关联笔记）',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  mediaId!: string;

  /** 文件在七牛云的存储 Key */
  @ApiProperty({
    description: '文件在七牛云存储的 Key（唯一标识，后续可用于访问或删除）',
    example: 'notes/2026/07/abc123.jpg',
  })
  key!: string;

  /** 文件公开访问 URL */
  @ApiProperty({
    description: '文件公开访问 URL（七牛云 CDN 域名拼接）',
    example: 'http://cdn.example.com/notes/2026/07/abc123.jpg',
  })
  url!: string;

  /** 文件 MIME 类型 */
  @ApiProperty({
    description: '文件 MIME 类型（如 image/jpeg、video/mp4）',
    example: 'image/jpeg',
  })
  mimeType!: string;

  /** 文件大小（字节） */
  @ApiProperty({
    description: '文件大小（字节）',
    example: 204800,
  })
  size!: number;

  /** 用户上传时的原始文件名 */
  @ApiProperty({
    description: '用户上传时的原始文件名（multipart filename）',
    example: 'vacation.jpg',
    nullable: true,
  })
  originalFilename!: string | null;
}
