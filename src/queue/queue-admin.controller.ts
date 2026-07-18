import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiWrappedOkResponse } from '../common/decorators/api-wrapped-response.decorator';
import { Public } from '../common/decorators/public.decorator';
import { QueueAdminService } from './queue-admin.service';
import {
  QueueRetryResponseDto,
  QueueStatsResponseDto,
} from './dto/queue-stats-response.dto';

/**
 * 队列管理 API
 * GET /admin/queues — 查看队列状态、失败任务
 * POST /admin/queues/retry — 重试所有失败任务
 */
@Public()
@ApiTags('队列管理')
@Controller('admin/queues')
export class QueueAdminController {
  constructor(private readonly queueAdminService: QueueAdminService) {}

  /**
   * 获取队列统计
   */
  @Get()
  @ApiOperation({
    summary: '获取队列统计',
    description: '公开接口，生产环境请自行加保护。',
  })
  @ApiWrappedOkResponse({
    dataDto: QueueStatsResponseDto,
    dataExample: {
      name: 'wechat-message',
      counts: { waiting: 0, active: 0, completed: 10, failed: 1, delayed: 0 },
      workers: 1,
      failedJobs: [
        {
          id: '123',
          name: 'process-wechat-message',
          failedReason: 'timeout',
          attemptsMade: 3,
          timestamp: 1710000000000,
        },
      ],
    },
  })
  async stats() {
    return this.queueAdminService.getStats();
  }

  /**
   * 重试所有失败任务
   */
  @Post('retry')
  @ApiOperation({ summary: '重试全部失败任务' })
  @ApiWrappedOkResponse({
    dataDto: QueueRetryResponseDto,
    dataExample: { count: 2 },
  })
  async retryAll() {
    const count = await this.queueAdminService.retryAll();
    return { count };
  }

  /**
   * 清空失败任务
   */
  @Post('clean-failed')
  @ApiOperation({ summary: '清空失败任务' })
  @ApiWrappedOkResponse({ dataExample: null })
  async cleanFailed() {
    await this.queueAdminService.cleanFailed();
  }

  /**
   * 暂停队列
   */
  @Post('pause')
  @ApiOperation({ summary: '暂停队列' })
  @ApiWrappedOkResponse({ dataExample: null })
  async pause() {
    await this.queueAdminService.pause();
  }

  /**
   * 恢复队列
   */
  @Post('resume')
  @ApiOperation({ summary: '恢复队列' })
  @ApiWrappedOkResponse({ dataExample: null })
  async resume() {
    await this.queueAdminService.resume();
  }
}
