import { Controller, Get, Post, Body } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoryDto } from './dto';
import { IdDto } from '../common/dto/id.dto';

/**
 * 分类控制器
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async list() {
    return this.categoriesService.findAll();
  }

  @Post('create')
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
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
