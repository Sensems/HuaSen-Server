import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { StorageService } from './storage.service';
import { MediaService } from '../media/media.service';
import { CurrentUser, type CurrentUserInfo } from '../common/decorators/current-user.decorator';
import {
  UploadTokenResponseDto,
  DeleteFileResponseDto,
  DeleteFileDto,
  UploadFileResponseDto,
} from './dto';

/** MIME 前缀 → Prisma MediaType 映射 */
function inferMediaType(mimeType: string): $Enums.MediaType {
  if (mimeType.startsWith('image/')) return $Enums.MediaType.IMAGE;
  if (mimeType.startsWith('audio/')) return $Enums.MediaType.VOICE;
  if (mimeType.startsWith('video/')) return $Enums.MediaType.VIDEO;
  return $Enums.MediaType.FILE;
}

/**
 * 存储控制器
 * 七牛云上传 Token 生成、上传回调、文件删除
 */
@ApiTags('存储')
@ApiBearerAuth('JWT-auth')
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly mediaService: MediaService,
  ) {}

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
   * 上传文件到七牛云（multipart/form-data）并创建媒体记录
   * POST /storage/upload
   */
  @Post('upload')
  @ApiOperation({ summary: '上传文件到七牛云（multipart/form-data）并创建媒体记录' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '要上传的文件' },
        type: {
          type: 'string',
          enum: ['IMAGE', 'VOICE', 'VIDEO', 'FILE'],
          description: '媒体类型（可选，不传则从 MIME 推断）',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '上传成功，返回媒体记录 ID 和文件信息', type: UploadFileResponseDto })
  async upload(@Req() req: any, @CurrentUser() user: CurrentUserInfo) {
    const file = await req.file();
    const result = await this.storageService.uploadFile(file);

    const typeRaw = (req.body?.type?.value as string) || (req.query?.type as string);
    const type: $Enums.MediaType = typeRaw
      ? ($Enums.MediaType as any)[typeRaw]
      : inferMediaType(result.mimeType);

    const media = await this.mediaService.create({
      userId: user.id,
      type,
      qiniuKey: result.key,
      qiniuUrl: result.url,
      fileSize: result.size,
      mimeType: result.mimeType,
    });

    return { mediaId: media.id, ...result };
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
