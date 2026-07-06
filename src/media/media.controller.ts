import { Controller, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CheckMediaDto } from './dto/check-media.dto';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';

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
  @ApiOperation({ summary: '批量校验媒体 ID 归属和状态' })
  @ApiResponse({
    status: 200,
    description: '返回有效和无效的媒体 ID 列表',
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
