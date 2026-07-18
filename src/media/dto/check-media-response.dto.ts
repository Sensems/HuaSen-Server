import { ApiProperty } from '@nestjs/swagger';

/**
 * 批量校验媒体归属响应 DTO
 */
export class CheckMediaResponseDto {
  @ApiProperty({
    description: '校验通过的媒体 ID（归属当前用户且为 PENDING 或 ORPHAN）',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  valid!: string[];

  @ApiProperty({
    description: '校验未通过的媒体 ID',
    type: [String],
    example: ['00000000-0000-4000-8000-000000000099'],
  })
  invalid!: string[];
}
