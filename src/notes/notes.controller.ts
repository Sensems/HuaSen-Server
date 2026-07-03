import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
import { IdDto } from '../common/dto/id.dto';

/**
 * 笔记控制器
 * 仅使用 GET 和 POST 方法
 */
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  /** GET /notes?type=&category=&tag=&keyword=&page=&size= */
  @Get()
  async list(@Query() query: QueryNoteDto) {
    return this.notesService.findAll(query);
  }

  /** GET /notes/detail?id= */
  @Get('detail')
  async detail(@Query() query: IdDto) {
    return this.notesService.findById(query.id);
  }

  /** POST /notes/create */
  @Post('create')
  async create(@Body() dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  /** POST /notes/update */
  @Post('update')
  async update(@Body() dto: UpdateNoteDto) {
    return this.notesService.update(dto);
  }

  /** POST /notes/delete */
  @Post('delete')
  async delete(@Body() body: IdDto) {
    return this.notesService.softDelete(body.id);
  }

  /** POST /notes/publish */
  @Post('publish')
  async publish(@Body() body: IdDto) {
    return this.notesService.publish(body.id);
  }

  /** POST /notes/archive */
  @Post('archive')
  async archive(@Body() body: IdDto) {
    return this.notesService.archive(body.id);
  }

  /** GET /notes/media?note_id= */
  @Get('media')
  async media(@Query('note_id') noteId: string) {
    return this.notesService.getMedia(noteId);
  }

  /** GET /notes/share?id= 获取笔记分享链接 */
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
