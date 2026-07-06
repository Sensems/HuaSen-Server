import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * 更新笔记请求体
 */
export class UpdateNoteDto {
  @ApiProperty({
    description: '要更新的笔记 ID',
    required: true,
    example: 'clxyz1234567890abcdef',
  })
  @IsString()
  id!: string;

  @ApiProperty({
    description: '新的笔记标题',
    required: false,
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: '新的笔记正文内容',
    required: false,
    example: '更新后的正文内容...',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: '新的分类 ID（传空字符串或省略表示不修改）',
    required: false,
    example: 'clxyz1234567890abcdef',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: '新的标签 ID 列表（传空数组可清空已有标签）',
    required: false,
    type: [String],
    example: ['tag_abc123'],
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
