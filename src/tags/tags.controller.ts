import { Controller, Get, Post, Body } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { IdDto } from '../common/dto/id.dto';

/**
 * 标签控制器
 */
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  async list() {
    return this.tagsService.findAll();
  }

  @Post('create')
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto.name);
  }

  @Post('delete')
  async delete(@Body() body: IdDto) {
    return this.tagsService.delete(body.id);
  }
}
