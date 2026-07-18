import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiWrappedErrorResponse,
  ApiWrappedOkResponse,
} from '../common/decorators/api-wrapped-response.decorator';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BindUserDto } from './dto/bind-user.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { BindUserResponseDto } from './dto/bind-user-response.dto';

const PROFILE_EXAMPLE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  nickname: '花森',
  avatar: 'https://cdn.example.com/a.png',
  email: 'user@example.com',
  bindingCode: 'ABC234',
  wxBound: false,
};

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
  @ApiWrappedOkResponse({
    dataDto: UserProfileResponseDto,
    dataExample: PROFILE_EXAMPLE,
  })
  async profile(@CurrentUser() user: CurrentUserInfo) {
    return this.userService.getProfile(user.id);
  }

  /**
   * 更新昵称和/或头像 URL
   */
  @Post('update')
  @ApiOperation({
    summary: '更新昵称和/或头像 URL',
    description: '至少提供 nickname 或 avatar 其中一项。',
  })
  @ApiBody({
    type: UpdateProfileDto,
    examples: {
      改昵称: { value: { nickname: '花森' } },
      改头像: { value: { avatar: 'https://cdn.example.com/a.png' } },
    },
  })
  @ApiWrappedOkResponse({
    dataDto: UserProfileResponseDto,
    dataExample: PROFILE_EXAMPLE,
  })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.id, dto);
  }

  /**
   * 用微信空壳绑定码绑定当前账号
   */
  @Post('bind')
  @ApiOperation({
    summary: '用微信空壳绑定码绑定当前账号',
    description: '将公众号侧空壳账号合并到当前登录用户。',
  })
  @ApiBody({
    type: BindUserDto,
    examples: {
      默认: { value: { bindingCode: 'ABC234' } },
    },
  })
  @ApiWrappedOkResponse({
    dataDto: BindUserResponseDto,
    dataExample: {
      wxBound: true,
      syncedDraftCount: 3,
      overwritten: false,
      message: '绑定成功',
    },
  })
  @ApiWrappedErrorResponse({
    description: '绑定码无效',
    example: { code: 20016, message: '绑定码无效', data: null },
  })
  async bind(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: BindUserDto,
  ) {
    return this.userService.bindByShellCode(user.id, dto.bindingCode);
  }
}
