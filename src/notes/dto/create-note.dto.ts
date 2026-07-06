import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NoteSource } from '../../common/enums';

/**
 * 创建笔记请求体
 */
export class CreateNoteDto {
  @ApiProperty({
    description: '笔记标题，留空时自动从正文截取前 100 字符',
    required: false,
    example: '我的第一篇笔记',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: '笔记正文内容',
    required: false,
    example: '这是笔记的正文内容...',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: '笔记来源',
    enum: NoteSource,
    required: false,
    example: NoteSource.APP_MANUAL,
  })
  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;

  @ApiProperty({
    description: '所属分类 ID',
    required: false,
    example: 'clxyz1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: '关联标签 ID 列表',
    required: false,
    type: [String],
    example: ['tag_abc123', 'tag_def456'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiProperty({ description: '已上传的媒体 ID 列表', required: false, type: [String], isArray: true, example: ['uuid-1', 'uuid-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
