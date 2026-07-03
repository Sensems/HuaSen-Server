import { Controller, Get, Post, Body } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoryDto } from './dto';
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
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserInfo) {
    return this.categoriesService.findAll(user?.id);
  }

  @Post('create')
  async create(@Body() dto: CreateCategoryDto, @CurrentUser() user: CurrentUserInfo) {
    return this.categoriesService.create(dto, user?.id);
  }

  @Post('update')
  async update(@Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(dto);
  }

  @Post('delete')
  async delete(@Body() body: IdDto) {
    return this.categoriesService.delete(body.id);
  }

  @Post('reorder')
  async reorder(@Body() dto: ReorderCategoryDto) {
    return this.categoriesService.reorder(dto);
  }
}
