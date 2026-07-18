import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

/**
 * 批量校验媒体归属请求体
 */
export class CheckMediaDto {
  @ApiProperty({
    description: '需要校验的媒体 ID 列表',
    type: [String],
    isArray: true,
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '00000000-0000-4000-8000-000000000099',
    ],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds!: string[];
}
