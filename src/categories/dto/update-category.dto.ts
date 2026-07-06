import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ description: '分类 ID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '分类名称', example: '更新后的分类', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiProperty({ description: '父分类 ID，顶级分类为 null', example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
