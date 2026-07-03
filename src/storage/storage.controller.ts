import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { StorageService } from './storage.service';
import { IdDto } from '../common/dto/id.dto';

/**
 * 存储控制器
 * 七牛云上传 Token 生成、上传回调、文件删除
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * 获取七牛云上传 Token
   * GET /storage/upload-token?key=xxx
   */
  @Get('upload-token')
  async getUploadToken(@Query('key') key?: string) {
    const token = this.storageService.getUploadToken(key || undefined);
    return { token };
  }

  /**
   * 删除文件
   * POST /storage/delete
   */
  @Post('delete')
  async delete(@Body() body: IdDto) {
    const ok = await this.storageService.deleteFile(body.id);
    return { success: ok };
  }
}
