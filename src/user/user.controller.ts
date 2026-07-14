import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BindUserDto } from './dto/bind-user.dto';

/**
 * 用户控制器
 * 资料查询/更新、微信空壳绑定码绑定
 */
@ApiTags('用户')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 获取当前用户资料
   */
  @Get('profile')
  @ApiOperation({ summary: '获取当前用户资料' })
  @ApiResponse({ status: 200, description: '成功' })
  async profile(@CurrentUser() user: CurrentUserInfo) {
    return this.userService.getProfile(user.id);
  }

  /**
   * 更新昵称和/或头像 URL
   */
  @Post('update')
  @ApiOperation({ summary: '更新昵称和/或头像 URL' })
  @ApiBody({ type: UpdateProfileDto })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.id, dto);
  }

  /**
   * 用微信空壳绑定码绑定当前账号
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bind')
  @ApiOperation({ summary: '用微信空壳绑定码绑定当前账号' })
  @ApiBody({ type: BindUserDto })
  async bind(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: BindUserDto,
  ) {
    return this.userService.bindByShellCode(user.id, dto.bindingCode);
  }
}
