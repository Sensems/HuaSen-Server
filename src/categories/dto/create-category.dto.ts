import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ description: '分类名称', example: '新分类' })
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ description: '父分类 ID，顶级分类为 null', example: null, nullable: true, required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
