import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService, DEFAULT_USER_ID } from '../user/user.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { QueryNoteDto } from './dto/query-note.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { Prisma, $Enums } from '@prisma/client';

/**
 * 笔记服务
 * 提供笔记的完整 CRUD 及状态流转
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  /**
   * 获取笔记列表（分页 + 筛选）
   * @param userId - 可选，Phase 3 传入当前用户 ID；不传则用默认用户
   */
  async findAll(query: QueryNoteDto, userId?: string) {
    const { page = 1, size = 20, type, category, tag, keyword, mediaType } = query;
    const skip = (page - 1) * size;
    const uid = userId || DEFAULT_USER_ID;

    const where: Prisma.NoteWhereInput = {
      userId: uid,
      deletedAt: null,
    };

    if (type) where.type = type as $Enums.NoteType;
    if (category) where.categoryId = category;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }
    if (tag) {
      where.tags = { some: { tagId: tag } };
    }
    if (mediaType) {
      where.media = { some: { type: mediaType as $Enums.MediaType } };
    }

    const [items, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.note.count({ where }),
    ]);

    return { items, total, page, size };
  }

  /**
   * 获取笔记详情
   */
  async findById(id: string, userId?: string) {
    const uid = userId || DEFAULT_USER_ID;
    const note = await this.prisma.note.findFirst({
      where: { id, userId: uid, deletedAt: null },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        media: true,
      },
    });

    if (!note) {
      throw new BusinessException(ErrorCode.NOTE_NOT_FOUND);
    }

    return note;
  }

  /**
   * 创建笔记（App 手动创建或微信消息入库）
   */
  async create(dto: CreateNoteDto, userId?: string) {
    const title = dto.title || this.generateTitle(dto.content);
    const uid = userId || DEFAULT_USER_ID;

    return this.prisma.note.create({
      data: {
        userId: uid,
        type: $Enums.NoteType.DRAFT,
        source: (dto.source as unknown as $Enums.NoteSource) || $Enums.NoteSource.APP_MANUAL,
        title,
        content: dto.content,
        categoryId: dto.categoryId || null,
        tags: dto.tagIds?.length
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        media: dto.media?.length
          ? {
              create: dto.media.map((m) => ({
                type: m.type as unknown as $Enums.MediaType,
                qiniuKey: m.qiniuKey,
                qiniuUrl: m.qiniuUrl,
                fileSize: m.fileSize ?? null,
                mimeType: m.mimeType ?? null,
                wxMediaId: m.wxMediaId ?? null,
              })),
            }
          : undefined,
      },
    });
  }

  /**
   * 从微信消息创建笔记（内部调用，不走 Controller）
   * 包含去重逻辑：通过 wechat_msg_id 检查是否已存在
   */
  async createFromWechat(params: {
    content: string;
    rawContent: string;
    msgId: string;
    createTime: number;
  }) {
    // 消息去重检查
    const existing = await this.prisma.note.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        meta: { path: ['wechat_msg_id'], equals: params.msgId },
      },
    });
    if (existing) {
      return existing;
    }

    const title = this.generateTitle(params.content);

    return this.prisma.note.create({
      data: {
        userId: DEFAULT_USER_ID,
        type: $Enums.NoteType.DRAFT,
        source: $Enums.NoteSource.WECHAT,
        title,
        content: params.content,
        rawContent: params.rawContent,
        meta: {
          wechat_msg_id: params.msgId,
          wechat_create_time: params.createTime,
        },
      },
    });
  }

  /**
   * 更新笔记
   */
  async update(dto: UpdateNoteDto) {
    const { id, tagIds, media, ...data } = dto;
    await this.findById(id);

    if (tagIds !== undefined) {
      await this.prisma.noteTag.deleteMany({ where: { noteId: id } });
    }

    if (media !== undefined) {
      await this.prisma.noteMedia.deleteMany({ where: { noteId: id } });
    }

    return this.prisma.note.update({
      where: { id },
      data: {
        ...data,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        media:
          media !== undefined
            ? {
                create: media.map((m) => ({
                  type: m.type as unknown as $Enums.MediaType,
                  qiniuKey: m.qiniuKey,
                  qiniuUrl: m.qiniuUrl,
                  fileSize: m.fileSize ?? null,
                  mimeType: m.mimeType ?? null,
                  wxMediaId: m.wxMediaId ?? null,
                })),
              }
            : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
  }

  /**
   * 软删除笔记
   */
  async softDelete(id: string) {
    await this.findById(id);
    return this.prisma.note.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 发布笔记（draft → published）
   */
  async publish(id: string) {
    const note = await this.findById(id);
    if (note.type !== $Enums.NoteType.DRAFT) {
      throw new BusinessException(
        ErrorCode.NOTE_INVALID_OPERATION,
        '只有临时笔记可以发布',
      );
    }
    return this.prisma.note.update({
      where: { id },
      data: { type: $Enums.NoteType.PUBLISHED },
    });
  }

  /**
   * 归档/取消归档笔记
   */
  async archive(id: string) {
    const note = await this.findById(id);
    if (note.type === $Enums.NoteType.DRAFT) {
      throw new BusinessException(
        ErrorCode.NOTE_INVALID_OPERATION,
        '临时笔记不能归档，请先发布',
      );
    }
    const newType =
      note.type === $Enums.NoteType.ARCHIVED ? $Enums.NoteType.PUBLISHED : $Enums.NoteType.ARCHIVED;
    return this.prisma.note.update({ where: { id }, data: { type: newType } });
  }

  /**
   * 获取笔记关联的多媒体列表
   */
  async getMedia(noteId: string) {
    return this.prisma.noteMedia.findMany({
      where: { noteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 从内容自动截取标题
   * 取前 100 字符，去除换行符
   */
  private generateTitle(content?: string): string {
    if (!content) return '无标题';
    const clean = content.replace(/\n/g, ' ').trim();
    return clean.length > 100 ? clean.slice(0, 100) : clean;
  }
}
