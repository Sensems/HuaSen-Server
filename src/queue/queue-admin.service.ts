import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';

export interface QueueStats {
  name: string;
  counts: Record<string, number>;
  workers: number;
  failedJobs: Array<{
    id: string;
    name: string;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
  }>;
}

/**
 * 队列管理服务
 * 提供队列状态查询——无外部依赖，直接用 BullMQ API
 */
@Injectable()
export class QueueAdminService {
  constructor(
    @InjectQueue('wechat-message') private readonly queue: Queue,
  ) {}

  /**
   * 获取队列完整统计信息
   */
  async getStats(): Promise<QueueStats> {
    const [counts, workers, failedJobs] = await Promise.all([
      this.queue.getJobCounts(),
      this.queue.getWorkers(),
      this.getFailedJobs(),
    ]);

    return {
      name: this.queue.name,
      counts,
      workers: workers.length,
      failedJobs,
    };
  }

  /**
   * 获取最近 50 条失败任务详情
   */
  private async getFailedJobs() {
    try {
      const jobs = await this.queue.getJobs('failed', 0, 49, true);
      return jobs.map((job: Job) => ({
        id: job.id || '',
        name: job.name,
        failedReason: job.failedReason || '',
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp || 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * 重试所有失败任务
   */
  async retryAll(): Promise<number> {
    const jobs = await this.queue.getJobs('failed', 0, -1, true);
    for (const job of jobs) {
      await job.retry();
    }
    return jobs.length;
  }

  /**
   * 清空失败任务
   */
  async cleanFailed(): Promise<void> {
    await this.queue.clean(0, 0, 'failed');
  }

  /**
   * 暂停队列
   */
  async pause(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    await this.queue.resume();
  }
}
