import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagResponseDto } from './dto/tag-response.dto';
import { IdDto } from '../common/dto/id.dto';

/**
 * 标签控制器
 * 提供全站标签的列表、创建（同名复用）和删除功能
 */
@ApiTags('标签')
@ApiBearerAuth('JWT-auth')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * 获取全站标签列表
   */
  @Get()
  @ApiOperation({ summary: '获取全站标签列表' })
  @ApiResponse({ status: 200, type: [TagResponseDto], description: '返回所有标签及关联笔记数量' })
  async list() {
    return this.tagsService.findAll();
  }

  /**
   * 创建标签（同名复用）
   */
  @Post('create')
  @ApiOperation({ summary: '创建标签（同名复用）' })
  @ApiBody({ type: CreateTagDto, examples: { 创建新标签: { value: { name: '随笔' } } } })
  @ApiResponse({ status: 200, type: TagResponseDto })
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto.name);
  }

  /**
   * 删除标签
   */
  @Post('delete')
  @ApiOperation({ summary: '删除标签' })
  @ApiBody({ type: IdDto, examples: { 示例: { value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } } } })
  @ApiResponse({ status: 200, type: TagResponseDto })
  async delete(@Body() body: IdDto) {
    return this.tagsService.delete(body.id);
  }
}
