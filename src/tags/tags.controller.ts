import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiWrappedOkResponse } from '../common/decorators/api-wrapped-response.decorator';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagResponseDto } from './dto/tag-response.dto';
import { IdDto } from '../common/dto/id.dto';

const TAG_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TAG_EXAMPLE = {
  id: TAG_ID,
  name: '随笔',
  createdAt: '2026-07-03T10:00:00.000Z',
  _count: { notes: 5 },
};

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
  @ApiWrappedOkResponse({
    description: '返回所有标签及关联笔记数量',
    dataDto: TagResponseDto,
    isArray: true,
    dataExample: [TAG_EXAMPLE],
  })
  async list() {
    return this.tagsService.findAll();
  }

  /**
   * 创建标签（同名复用）
   */
  @Post('create')
  @ApiOperation({
    summary: '创建标签（同名复用）',
    description: '同名标签直接返回已有记录，不报错。',
  })
  @ApiBody({
    type: CreateTagDto,
    examples: { 创建新标签: { value: { name: '随笔' } } },
  })
  @ApiWrappedOkResponse({
    dataDto: TagResponseDto,
    dataExample: {
      id: TAG_ID,
      name: '随笔',
      createdAt: '2026-07-03T10:00:00.000Z',
    },
  })
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto.name);
  }

  /**
   * 删除标签
   */
  @Post('delete')
  @ApiOperation({ summary: '删除标签', description: '先解绑笔记关联再删除。' })
  @ApiBody({
    type: IdDto,
    examples: { 示例: { value: { id: TAG_ID } } },
  })
  @ApiWrappedOkResponse({
    dataDto: TagResponseDto,
    dataExample: {
      id: TAG_ID,
      name: '随笔',
      createdAt: '2026-07-03T10:00:00.000Z',
    },
  })
  async delete(@Body() body: IdDto) {
    return this.tagsService.delete(body.id);
  }
}
