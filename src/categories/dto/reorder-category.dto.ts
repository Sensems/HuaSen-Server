import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 排序项 */
export class ReorderItem {
  @ApiProperty({ description: '分类 ID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '父分类 ID，顶级分类为 null', example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  parentId!: string | null;
}

export class ReorderCategoryDto {
  @ApiProperty({
    description: '排序项列表',
    type: () => [ReorderItem],
    example: [
      { id: 'uuid1', parentId: null },
      { id: 'uuid2', parentId: 'uuid1' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items!: ReorderItem[];
}
