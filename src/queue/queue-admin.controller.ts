import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { QueueAdminService, QueueStats } from './queue-admin.service';

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
  async stats(): Promise<{ code: number; data: QueueStats; message: string }> {
    const data = await this.queueAdminService.getStats();
    return { code: 0, data, message: 'ok' };
  }

  /**
   * 重试所有失败任务
   */
  @Post('retry')
  async retryAll(): Promise<{ code: number; data: { count: number }; message: string }> {
    const count = await this.queueAdminService.retryAll();
    return { code: 0, data: { count }, message: `Retried ${count} failed jobs` };
  }

  /**
   * 清空失败任务
   */
  @Post('clean-failed')
  async cleanFailed(): Promise<{ code: number; data: null; message: string }> {
    await this.queueAdminService.cleanFailed();
    return { code: 0, data: null, message: 'Failed jobs cleaned' };
  }

  /**
   * 暂停队列
   */
  @Post('pause')
  async pause(): Promise<{ code: number; data: null; message: string }> {
    await this.queueAdminService.pause();
    return { code: 0, data: null, message: 'Queue paused' };
  }

  /**
   * 恢复队列
   */
  @Post('resume')
  async resume(): Promise<{ code: number; data: null; message: string }> {
    await this.queueAdminService.resume();
    return { code: 0, data: null, message: 'Queue resumed' };
  }
}
