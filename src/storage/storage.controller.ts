import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { UploadTokenResponseDto, DeleteFileResponseDto, DeleteFileDto } from './dto';

/**
 * 存储控制器
 * 七牛云上传 Token 生成、上传回调、文件删除
 */
@ApiTags('存储')
@ApiBearerAuth('JWT-auth')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * 获取七牛云上传 Token
   * GET /storage/upload-token?key=xxx
   */
  @Get('upload-token')
  @ApiOperation({ summary: '获取七牛云直传 Token（App 端走直传）' })
  @ApiQuery({
    name: 'key',
    required: false,
    description: '七牛云对象存储的文件 key（不传则生成 scope 为整个 bucket 的 Token）',
    example: 'notes/2026/07/clxyz1234567890abcdef.jpg',
  })
  @ApiResponse({
    status: 200,
    description: '返回七牛云直传 Token，有效期 1 小时',
    type: UploadTokenResponseDto,
  })
  async getUploadToken(@Query('key') key?: string) {
    const token = this.storageService.getUploadToken(key || undefined);
    return { token };
  }

  /**
   * 删除文件
   * POST /storage/delete
   */
  @Post('delete')
  @ApiOperation({ summary: '删除七牛云上的文件' })
  @ApiBody({ type: DeleteFileDto })
  @ApiResponse({
    status: 200,
    description: '返回是否删除成功',
    type: DeleteFileResponseDto,
  })
  async delete(@Body() body: DeleteFileDto) {
    const ok = await this.storageService.deleteFile(body.key);
    return { success: ok };
  }
}
