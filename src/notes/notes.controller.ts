import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
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
 * 笔记控制器
 * 仅使用 GET 和 POST 方法，需要 JWT 认证
 */
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async list(@Query() query: QueryNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findAll(query, user?.id);
  }

  @Get('detail')
  async detail(@Query() query: IdDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.findById(query.id, user?.id);
  }

  @Post('create')
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: CurrentUserInfo) {
    return this.notesService.create(dto, user?.id);
  }

  @Post('update')
  async update(@Body() dto: UpdateNoteDto) {
    return this.notesService.update(dto);
  }

  @Post('delete')
  async delete(@Body() body: IdDto) {
    return this.notesService.softDelete(body.id);
  }

  @Post('publish')
  async publish(@Body() body: IdDto) {
    return this.notesService.publish(body.id);
  }

  @Post('archive')
  async archive(@Body() body: IdDto) {
    return this.notesService.archive(body.id);
  }

  @Get('media')
  async media(@Query('note_id') noteId: string) {
    return this.notesService.getMedia(noteId);
  }

  @Get('share')
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
