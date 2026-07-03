import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { NoteSource } from '../../common/enums';

/**
 * 创建笔记请求体
 */
export class CreateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
