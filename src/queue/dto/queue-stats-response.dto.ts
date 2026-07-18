import { ApiProperty } from '@nestjs/swagger';

/** 失败任务摘要 */
export class QueueFailedJobDto {
  @ApiProperty({ example: '123' })
  id!: string;

  @ApiProperty({ example: 'process-wechat-message' })
  name!: string;

  @ApiProperty({ example: 'timeout' })
  failedReason!: string;

  @ApiProperty({ example: 3 })
  attemptsMade!: number;

  @ApiProperty({ example: 1710000000000 })
  timestamp!: number;
}

/** 重试失败任务响应 */
export class QueueRetryResponseDto {
  @ApiProperty({ description: '重试的任务数量', example: 2 })
  count!: number;
}

/**
 * 队列统计响应 DTO
 */
export class QueueStatsResponseDto {
  @ApiProperty({ example: 'wechat-message' })
  name!: string;

  @ApiProperty({
    description: '各状态任务数量',
    example: { waiting: 0, active: 0, completed: 10, failed: 1, delayed: 0 },
  })
  counts!: Record<string, number>;

  @ApiProperty({ example: 1 })
  workers!: number;

  @ApiProperty({ type: [QueueFailedJobDto] })
  failedJobs!: QueueFailedJobDto[];
}
