import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiWrappedOkResponse } from '../common/decorators/api-wrapped-response.decorator';
import { MediaService } from './media.service';
import { CheckMediaDto } from './dto/check-media.dto';
import { CheckMediaResponseDto } from './dto/check-media-response.dto';
import { CurrentUser, type CurrentUserInfo } from '../common/decorators/current-user.decorator';

/**
 * 媒体控制器
 * 提供媒体校验等辅助接口
 */
@ApiTags('媒体')
@ApiBearerAuth('JWT-auth')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * 批量校验媒体归属
   * POST /media/check
   */
  @Post('check')
  @ApiOperation({
    summary: '批量校验媒体 ID 归属和状态',
    description: '创建/更新笔记前，校验媒体是否属于当前用户且状态可关联（PENDING 或 ORPHAN）。',
  })
  @ApiBody({
    type: CheckMediaDto,
    examples: {
      默认: {
        value: {
          mediaIds: [
            '550e8400-e29b-41d4-a716-446655440000',
            '00000000-0000-4000-8000-000000000099',
          ],
        },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '返回有效和无效的媒体 ID 列表',
    dataDto: CheckMediaResponseDto,
    dataExample: {
      valid: ['550e8400-e29b-41d4-a716-446655440000'],
      invalid: ['00000000-0000-4000-8000-000000000099'],
    },
  })
  async check(
    @Body() dto: CheckMediaDto,
    @CurrentUser() user: CurrentUserInfo,
  ) {
    const { valid, invalid } = await this.mediaService.checkOwnership(
      dto.mediaIds,
      user.id,
    );
    return { valid: valid.map((m) => m.id), invalid };
  }
}
