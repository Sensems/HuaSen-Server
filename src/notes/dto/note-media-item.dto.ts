import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { MediaType } from '../../common/enums';

/**
 * 笔记关联的多媒体项
 * 对应 Prisma NoteMedia 模型，id/noteId/createdAt 由服务端生成
 */
export class NoteMediaItemDto {
  @ApiProperty({
    description: '多媒体类型',
    enum: MediaType,
    example: MediaType.IMAGE,
  })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiProperty({
    description: '七牛云存储 Key',
    required: true,
    example: 'notes/2026/07/abc123.jpg',
  })
  @IsString()
  qiniuKey!: string;

  @ApiProperty({
    description: '七牛云访问 URL',
    required: true,
    example: 'http://cdn.example.com/notes/2026/07/abc123.jpg',
  })
  @IsString()
  qiniuUrl!: string;

  @ApiProperty({
    description: '文件大小（字节）',
    required: false,
    example: 102400,
  })
  @IsOptional()
  @IsNumber()
  fileSize?: number;

  @ApiProperty({
    description: 'MIME 类型',
    required: false,
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({
    description: '微信临时素材 ID',
    required: false,
    example: 'wx_media_abc123',
  })
  @IsOptional()
  @IsString()
  wxMediaId?: string;
}
