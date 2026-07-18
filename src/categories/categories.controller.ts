import { Controller, Get, Post, Body } from '@nestjs/common';
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

const CAT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CATEGORY_EXAMPLE = {
  id: CAT_ID,
  name: '工作',
  parentId: null,
  sortOrder: 0,
  notesCount: 12,
  children: [
    {
      id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      name: '会议',
      parentId: CAT_ID,
      sortOrder: 0,
      notesCount: 3,
      children: [],
    },
  ],
};

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
  @ApiWrappedOkResponse({
    description: '返回树形分类列表',
    dataDto: CategoryDto,
    isArray: true,
    dataExample: [CATEGORY_EXAMPLE],
  })
  async list(@CurrentUser() user: CurrentUserInfo) {
    return this.categoriesService.findAll(user?.id);
  }

  /**
   * 创建分类
   */
  @Post('create')
  @ApiOperation({ summary: '创建分类', description: '最多 3 层；同级自动追加 sortOrder。' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      default: {
        value: { name: '新分类', parentId: null },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '成功创建分类',
    dataDto: CategoryDto,
    dataExample: {
      id: CAT_ID,
      name: '新分类',
      parentId: null,
      sortOrder: 0,
      notesCount: 0,
      children: [],
    },
  })
  @ApiWrappedErrorResponse({
    description: '分类层级超过限制',
    example: { code: 40002, message: '分类层级超过限制', data: null },
  })
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
        value: { id: CAT_ID, name: '更新后的分类', parentId: null },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '成功更新分类',
    dataDto: CategoryDto,
    dataExample: {
      id: CAT_ID,
      name: '更新后的分类',
      parentId: null,
      sortOrder: 0,
      notesCount: 12,
      children: [],
    },
  })
  async update(@Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(dto);
  }

  /**
   * 删除分类
   */
  @Post('delete')
  @ApiOperation({
    summary: '删除分类',
    description: '递归删子孙，关联笔记 categoryId 置空（不删笔记）。',
  })
  @ApiBody({
    type: IdDto,
    examples: {
      default: {
        value: { id: CAT_ID },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '成功删除分类',
    dataDto: CategoryDto,
    dataExample: {
      id: CAT_ID,
      name: '工作',
      parentId: null,
      sortOrder: 0,
      notesCount: 0,
      children: [],
    },
  })
  async delete(@Body() body: IdDto) {
    return this.categoriesService.delete(body.id);
  }

  /**
   * 拖拽排序分类
   */
  @Post('reorder')
  @ApiOperation({ summary: '拖拽排序分类', description: '成功后返回更新后的分类树。' })
  @ApiBody({
    type: ReorderCategoryDto,
    examples: {
      default: {
        value: {
          items: [
            { id: CAT_ID, parentId: null },
            { id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', parentId: CAT_ID },
          ],
        },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '成功排序并返回分类树',
    dataDto: CategoryDto,
    isArray: true,
    dataExample: [CATEGORY_EXAMPLE],
  })
  async reorder(@Body() dto: ReorderCategoryDto) {
    return this.categoriesService.reorder(dto);
  }
}
