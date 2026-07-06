import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 通用分页查询 DTO
 * 所有列表查询接口继承此 DTO
 */
export class PaginationDto {
  @ApiProperty({ description: '页码，从 1 开始', example: 1, type: 'number', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: '每页数量', example: 20, type: 'number', required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;
}
