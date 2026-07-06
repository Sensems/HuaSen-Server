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
    example: ['uuid-1', 'uuid-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds!: string[];
}
