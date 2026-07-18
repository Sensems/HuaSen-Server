import { ApiProperty } from '@nestjs/swagger';

/** 标签关联笔记计数 */
export class TagNotesCountDto {
  @ApiProperty({ description: '关联笔记数量', example: 5 })
  notes!: number;
}

/**
 * 标签响应 DTO
 * 包含关联笔记数量（来自 findAll 的 _count 关联查询）
 */
export class TagResponseDto {
  @ApiProperty({
    description: '标签 ID（UUID）',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id!: string;

  @ApiProperty({
    description: '标签名称',
    example: '随笔',
  })
  name!: string;

  @ApiProperty({
    description: '创建时间',
    example: '2026-07-03T10:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: '关联笔记数量（仅 list 接口返回）',
    required: false,
    type: TagNotesCountDto,
  })
  _count?: TagNotesCountDto;
}
