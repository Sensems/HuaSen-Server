import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiWrappedErrorResponse,
  ApiWrappedOkResponse,
} from '../common/decorators/api-wrapped-response.decorator';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
import {
  MediaItemDto,
  NoteDetailDto,
  NoteListResponseDto,
  NoteShareResponseDto,
} from './dto/note-response.dto';
import { IdDto } from '../common/dto/id.dto';
import { CurrentUser, CurrentUserInfo } from '../common/decorators/current-user.decorator';

const NOTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MEDIA_ID = '550e8400-e29b-41d4-a716-446655440000';

const MEDIA_EXAMPLE = {
  id: MEDIA_ID,
  type: 'IMAGE',
  qiniuKey: 'notes/2026/07/a.jpg',
  qiniuUrl: 'https://cdn.example.com/notes/2026/07/a.jpg',
  status: 'ATTACHED',
  mimeType: 'image/jpeg',
  fileSize: 204800,
  originalFilename: 'vacation.jpg',
};

const NOTE_DETAIL_EXAMPLE = {
  id: NOTE_ID,
  type: 'DRAFT',
  source: 'APP_MANUAL',
  title: '我的第一篇笔记',
  content: '这是笔记的正文内容...',
  categoryId: NOTE_ID,
  category: { id: NOTE_ID, name: '工作' },
  tags: [{ tag: { id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', name: '随笔' } }],
  media: [MEDIA_EXAMPLE],
  pinnedAt: null,
  createdAt: '2026-07-15T10:00:00.000Z',
  updatedAt: '2026-07-15T10:00:00.000Z',
};

const ID_BODY_EXAMPLES = {
  示例: { value: { id: NOTE_ID } },
};

/**
 * 笔记控制器
 * 仅使用 GET 和 POST 方法，需要 JWT 认证
 */
@ApiTags('笔记')
@ApiBearerAuth('JWT-auth')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /**
   * 获取笔记列表（分页 + 筛选）
   */
  @Get()
  @ApiOperation({
    summary: '获取笔记列表（分页 + 筛选）',
    description:
      'view=pinned 仅置顶；view=recent 按创建时间；不传=置顶优先再按创建时间。枚举值须为大写（如 type=DRAFT）。',
  })
  @ApiWrappedOkResponse({
    description: '分页笔记列表',
    dataDto: NoteListResponseDto,
    dataExample: {
      items: [
        {
          id: NOTE_ID,
          type: 'PUBLISHED',
          source: 'APP_MANUAL',
          title: '我的第一篇笔记',
          content: '这是笔记的正文内容...',
          categoryId: NOTE_ID,
          category: { id: NOTE_ID, name: '工作' },
          tags: [
            {
              tag: {
                id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
                name: '随笔',
              },
            },
          ],
          media: [MEDIA_EXAMPLE],
          pinnedAt: null,
          createdAt: '2026-07-15T10:00:00.000Z',
          updatedAt: '2026-07-15T10:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      size: 20,
    },
  })
  async list(@Query() query: QueryNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findAll(query, user?.id);
  }

  /**
   * 获取笔记详情
   */
  @Get('detail')
  @ApiOperation({ summary: '获取笔记详情' })
  @ApiQuery({ name: 'id', description: '笔记 ID', example: NOTE_ID })
  @ApiWrappedOkResponse({
    description: '笔记详情（含分类、标签、媒体）',
    dataDto: NoteDetailDto,
    dataExample: NOTE_DETAIL_EXAMPLE,
  })
  @ApiWrappedErrorResponse({
    description: '笔记不存在',
    example: { code: 30001, message: '笔记不存在', data: null },
  })
  async detail(@Query() query: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findById(query.id, user?.id);
  }

  /**
   * 创建笔记
   */
  @Post('create')
  @ApiOperation({ summary: '创建笔记', description: '默认创建为草稿 DRAFT。' })
  @ApiBody({
    type: CreateNoteDto,
    examples: {
      示例: {
        value: {
          title: '我的第一篇笔记',
          content: '这是笔记的正文内容...',
          source: 'APP_MANUAL',
          categoryId: NOTE_ID,
          tagIds: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
          mediaIds: [MEDIA_ID],
        },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '创建成功',
    dataDto: NoteDetailDto,
    dataExample: NOTE_DETAIL_EXAMPLE,
  })
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.create(dto, user?.id);
  }

  /**
   * 更新笔记
   */
  @Post('update')
  @ApiOperation({
    summary: '更新笔记',
    description: '勿通过本接口写 pinnedAt，置顶请用 /notes/pin。',
  })
  @ApiBody({
    type: UpdateNoteDto,
    examples: {
      示例: {
        value: {
          id: NOTE_ID,
          title: '更新后的标题',
          content: '更新后的正文内容...',
          categoryId: NOTE_ID,
          tagIds: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
          mediaIds: [MEDIA_ID],
        },
      },
    },
  })
  @ApiWrappedOkResponse({
    description: '更新成功',
    dataDto: NoteDetailDto,
    dataExample: { ...NOTE_DETAIL_EXAMPLE, title: '更新后的标题' },
  })
  async update(@Body() dto: UpdateNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.update(dto, user?.id);
  }

  /**
   * 软删除笔记
   */
  @Post('delete')
  @ApiOperation({ summary: '软删除笔记' })
  @ApiBody({ type: IdDto, examples: ID_BODY_EXAMPLES })
  @ApiWrappedOkResponse({
    description: '软删除成功',
    dataExample: { id: NOTE_ID, deletedAt: '2026-07-16T02:00:00.000Z' },
  })
  async delete(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.softDelete(body.id, user?.id);
  }

  /**
   * 发布笔记
   */
  @Post('publish')
  @ApiOperation({ summary: '发布笔记（草稿 → 已发布）' })
  @ApiBody({ type: IdDto, examples: ID_BODY_EXAMPLES })
  @ApiWrappedOkResponse({
    description: '发布成功',
    dataDto: NoteDetailDto,
    dataExample: { ...NOTE_DETAIL_EXAMPLE, type: 'PUBLISHED' },
  })
  async publish(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.publish(body.id, user?.id);
  }

  /**
   * 归档或取消归档
   */
  @Post('archive')
  @ApiOperation({ summary: '归档或取消归档笔记' })
  @ApiBody({ type: IdDto, examples: ID_BODY_EXAMPLES })
  @ApiWrappedOkResponse({
    description: '状态切换成功',
    dataDto: NoteDetailDto,
    dataExample: { ...NOTE_DETAIL_EXAMPLE, type: 'ARCHIVED' },
  })
  @ApiWrappedErrorResponse({
    description: '草稿不可归档',
    example: { code: 30003, message: '不允许的操作', data: null },
  })
  async archive(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.archive(body.id, user?.id);
  }

  /**
   * 置顶或取消置顶
   */
  @Post('pin')
  @ApiOperation({ summary: '置顶或取消置顶笔记' })
  @ApiBody({ type: IdDto, examples: ID_BODY_EXAMPLES })
  @ApiWrappedOkResponse({
    description: '置顶状态切换成功',
    dataDto: NoteDetailDto,
    dataExample: {
      ...NOTE_DETAIL_EXAMPLE,
      type: 'PUBLISHED',
      pinnedAt: '2026-07-16T02:00:00.000Z',
    },
  })
  async pin(@Body() body: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.pin(body.id, user?.id);
  }

  /**
   * 获取笔记关联的多媒体列表
   */
  @Get('media')
  @ApiOperation({ summary: '获取笔记关联的多媒体列表' })
  @ApiQuery({ name: 'note_id', description: '笔记 ID', example: NOTE_ID })
  @ApiWrappedOkResponse({
    description: '媒体列表',
    dataDto: MediaItemDto,
    isArray: true,
    dataExample: [MEDIA_EXAMPLE],
  })
  async media(@Query('note_id') noteId: string) {
    return this.notesService.getMedia(noteId);
  }

  /**
   * 获取笔记分享信息
   */
  @Get('share')
  @ApiOperation({ summary: '获取笔记分享信息' })
  @ApiQuery({ name: 'id', description: '笔记 ID', example: NOTE_ID })
  @ApiWrappedOkResponse({
    description: '分享精简信息',
    dataDto: NoteShareResponseDto,
    dataExample: {
      id: NOTE_ID,
      title: '我的第一篇笔记',
      type: 'PUBLISHED',
      shareUrl: `/notes/detail?id=${NOTE_ID}`,
    },
  })
  async share(@Query() query: IdDto, @CurrentUser() user: CurrentUserInfo) {
    const note = await this.notesService.findById(query.id, user?.id);
    return {
      id: note.id,
      title: note.title,
      type: note.type,
      shareUrl: `/notes/detail?id=${note.id}`,
    };
  }
}
