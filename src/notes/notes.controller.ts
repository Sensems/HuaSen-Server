import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
import { IdDto } from '../common/dto/id.dto';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';

/**
 * 笔记控制器
 * 仅使用 GET 和 POST 方法，需要 JWT 认证
 */
@ApiTags('笔记')
@ApiBearerAuth('JWT-auth')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: '获取笔记列表（分页 + 筛选）' })
  @ApiResponse({ status: 200, description: '成功返回分页后的笔记列表，data: { items, total, page, size }', type: Object })
  async list(@Query() query: QueryNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findAll(query, user?.id);
  }

  @Get('detail')
  @ApiOperation({ summary: '获取笔记详情' })
  @ApiQuery({ name: 'id', description: '笔记 ID', example: 'clxyz1234567890abcdef' })
  @ApiResponse({ status: 200, description: '成功返回笔记详情（含分类、标签、媒体），data: 笔记对象', type: Object })
  async detail(@Query() query: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findById(query.id, user?.id);
  }

  @Post('create')
  @ApiOperation({ summary: '创建笔记' })
  @ApiBody({
    type: CreateNoteDto,
    examples: {
      示例: {
        value: {
          title: '我的第一篇笔记',
          content: '这是笔记的正文内容...',
          source: 'APP_MANUAL',
          categoryId: 'clxyz1234567890abcdef',
          tagIds: ['tag_abc123'],
          mediaIds: ['uuid-1'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功创建笔记，data: 创建的笔记对象', type: Object })
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.create(dto, user?.id);
  }

  @Post('update')
  @ApiOperation({ summary: '更新笔记' })
  @ApiBody({
    type: UpdateNoteDto,
    examples: {
      示例: {
        value: {
          id: 'clxyz1234567890abcdef',
          title: '更新后的标题',
          content: '更新后的正文内容...',
          categoryId: 'clxyz1234567890abcdef',
          tagIds: ['tag_abc123'],
          mediaIds: ['uuid-1'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功更新笔记，data: 更新后的笔记对象', type: Object })
  async update(@Body() dto: UpdateNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.update(dto, user?.id);
  }

  @Post('delete')
  @ApiOperation({ summary: '软删除笔记' })
  @ApiBody({
    type: IdDto,
    examples: {
      示例: {
        value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功软删除笔记，data: 被删除的笔记对象', type: Object })
  async delete(@Body() body: IdDto) {
    return this.notesService.softDelete(body.id);
  }

  @Post('publish')
  @ApiOperation({ summary: '发布笔记（草稿 → 已发布）' })
  @ApiBody({
    type: IdDto,
    examples: {
      示例: {
        value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功发布笔记，data: 发布后的笔记对象', type: Object })
  async publish(@Body() body: IdDto) {
    return this.notesService.publish(body.id);
  }

  @Post('archive')
  @ApiOperation({ summary: '归档或取消归档笔记' })
  @ApiBody({
    type: IdDto,
    examples: {
      示例: {
        value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功切换归档状态，data: 状态变更后的笔记对象', type: Object })
  async archive(@Body() body: IdDto) {
    return this.notesService.archive(body.id);
  }

  @Post('pin')
  @ApiOperation({ summary: '置顶或取消置顶笔记' })
  @ApiBody({
    type: IdDto,
    examples: {
      示例: {
        value: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '成功切换置顶状态，data: 更新后的笔记对象（含 pinnedAt）', type: Object })
  async pin(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.pin(body.id, user?.id);
  }

  @Get('media')
  @ApiOperation({ summary: '获取笔记关联的多媒体列表' })
  @ApiQuery({ name: 'note_id', description: '笔记 ID', example: 'clxyz1234567890abcdef' })
  @ApiResponse({ status: 200, description: '成功返回该笔记下的多媒体资源列表，data: Media 数组', type: Object })
  async media(@Query('note_id') noteId: string) {
    return this.notesService.getMedia(noteId);
  }

  @Get('share')
  @ApiOperation({ summary: '获取笔记分享信息' })
  @ApiQuery({ name: 'id', description: '笔记 ID', example: 'clxyz1234567890abcdef' })
  @ApiResponse({ status: 200, description: '成功返回分享所需的精简信息，data: { id, title, type, shareUrl }', type: Object })
  async share(@Query() query: IdDto) {
    const note = await this.notesService.findById(query.id);
    return {
      id: note.id,
      title: note.title,
      type: note.type,
      shareUrl: `/notes/detail?id=${note.id}`,
    };
  }
}
