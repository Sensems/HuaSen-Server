import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 排序项 */
export class ReorderItem {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  parentId!: string | null;
}

export class ReorderCategoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items!: ReorderItem[];
}
