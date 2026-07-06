import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoryDto, CategoryDto } from './dto';
import { IdDto } from '../common/dto/id.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/** 当前用户最小信息 */
interface CurrentUserInfo {
  id: string;
  openid: string;
  nickname?: string;
  role: string;
}

/**
 * 分类控制器
 * 仅使用 GET 和 POST 方法，需要 JWT 认证
 */
@ApiTags('分类')
@ApiBearerAuth('JWT-auth')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * 获取分类树
   */
  @Get()
  @ApiOperation({ summary: '获取分类树' })
  @ApiResponse({ status: 200, type: [CategoryDto], description: '返回树形分类列表' })
  async list(@CurrentUser() user: CurrentUserInfo) {
    return this.categoriesService.findAll(user?.id);
  }

  /**
   * 创建分类
   */
  @Post('create')
  @ApiOperation({ summary: '创建分类' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      default: {
        value: { name: '新分类', parentId: null },
      },
    },
  })
  @ApiResponse({ status: 200, type: CategoryDto, description: '成功创建分类' })
  async create(@Body() dto: CreateCategoryDto, @CurrentUser() user: CurrentUserInfo) {
    return this.categoriesService.create(dto, user?.id);
  }

  /**
   * 更新分类
   */
  @Post('update')
  @ApiOperation({ summary: '更新分类' })
  @ApiBody({
    type: UpdateCategoryDto,
    examples: {
      default: {
        value: { id: 'uuid-here', name: '更新后的分类', parentId: null },
      },
    },
  })
  @ApiResponse({ status: 200, type: CategoryDto, description: '成功更新分类' })
  async update(@Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(dto);
  }

  /**
   * 删除分类
   */
  @Post('delete')
  @ApiOperation({ summary: '删除分类' })
  @ApiBody({
    type: IdDto,
    examples: {
      default: {
        value: { id: 'uuid-here' },
      },
    },
  })
  @ApiResponse({ status: 200, type: CategoryDto, description: '成功删除分类' })
  async delete(@Body() body: IdDto) {
    return this.categoriesService.delete(body.id);
  }

  /**
   * 拖拽排序分类
   */
  @Post('reorder')
  @ApiOperation({ summary: '拖拽排序分类' })
  @ApiBody({
    type: ReorderCategoryDto,
    examples: {
      default: {
        value: {
          items: [
            { id: 'uuid1', parentId: null },
            { id: 'uuid2', parentId: 'uuid1' },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功排序分类' })
  async reorder(@Body() dto: ReorderCategoryDto) {
    return this.categoriesService.reorder(dto);
  }
}
