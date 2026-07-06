import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { MediaStatus, type Media, type Prisma, $Enums } from '@prisma/client';

/** 创建 Media 所需参数 */
interface CreateMediaParams {
  userId: string;
  type: $Enums.MediaType;
  qiniuKey: string;
  qiniuUrl: string;
  fileSize?: number;
  mimeType?: string;
  wxMediaId?: string;
  status?: MediaStatus;
}

/**
 * 媒体服务
 * 管理 Media 实体的完整生命周期：创建、校验、关联/解绑笔记
 */
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上传后创建 Media 记录
   * @param tx - 可选事务客户端，在事务内调用时传入
   * @returns 创建的 Media 对象
   */
  async create(params: CreateMediaParams, tx?: Prisma.TransactionClient): Promise<Media> {
    const client = tx || this.prisma;
    return client.media.create({
      data: {
        userId: params.userId,
        type: params.type,
        qiniuKey: params.qiniuKey,
        qiniuUrl: params.qiniuUrl,
        fileSize: params.fileSize ?? null,
        mimeType: params.mimeType ?? null,
        wxMediaId: params.wxMediaId ?? null,
        status: params.status ?? MediaStatus.PENDING,
      },
    });
  }

  /**
   * 批量校验 mediaIds 是否属于指定用户且状态为 PENDING
   * @returns 有效媒体列表和无效 ID 列表
   */
  async checkOwnership(
    mediaIds: string[],
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ valid: Media[]; invalid: string[] }> {
    const client = tx || this.prisma;
    if (!mediaIds.length) return { valid: [], invalid: [] };

    const mediaRecords = await client.media.findMany({
      where: { id: { in: mediaIds } },
    });

    const mediaMap = new Map(mediaRecords.map((m) => [m.id, m]));
    const valid: Media[] = [];
    const invalid: string[] = [];

    for (const id of mediaIds) {
      const m = mediaMap.get(id);
      if (!m || m.userId !== userId || m.status !== MediaStatus.PENDING) {
        invalid.push(id);
      } else {
        valid.push(m);
      }
    }

    return { valid, invalid };
  }

  /**
   * 批量关联媒体到笔记（事务内调用）
   * 校验归属 + PENDING 状态后，创建 NoteMedia 关联并更新 Media 状态为 ATTACHED
   * @throws MEDIA_NOT_OWNED 或 MEDIA_NOT_PENDING 如果校验失败
   */
  async attachToNote(
    noteId: string,
    mediaIds: string[],
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;
    const { invalid } = await this.checkOwnership(mediaIds, userId, tx);

    if (invalid.length > 0) {
      const first = invalid[0];
      const media = await client.media.findUnique({ where: { id: first } });
      if (!media) {
        throw new BusinessException(ErrorCode.MEDIA_NOT_FOUND);
      }
      if (media.userId !== userId) {
        throw new BusinessException(ErrorCode.MEDIA_NOT_OWNED);
      }
      throw new BusinessException(ErrorCode.MEDIA_NOT_PENDING);
    }

    // 批量创建关联 + 更新状态
    await Promise.all([
      client.noteMedia.createMany({
        data: mediaIds.map((mediaId) => ({ noteId, mediaId })),
        skipDuplicates: true,
      }),
      client.media.updateMany({
        where: { id: { in: mediaIds } },
        data: { status: MediaStatus.ATTACHED },
      }),
    ]);
  }

  /**
   * 解绑笔记所有媒体关联，孤立无其他关联的 Media
   */
  async detachFromNote(
    noteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;

    // 获取旧关联的 mediaIds
    const oldAssociations = await client.noteMedia.findMany({
      where: { noteId },
      select: { mediaId: true },
    });
    const oldMediaIds = oldAssociations.map((a) => a.mediaId);

    if (!oldMediaIds.length) return;

    // 删除关联
    await client.noteMedia.deleteMany({ where: { noteId } });

    // 孤立没有其他关联的 Media
    const orphanIds = await this.isOrphan(oldMediaIds, tx);
    if (orphanIds.length > 0) {
      await client.media.updateMany({
        where: { id: { in: orphanIds } },
        data: { status: MediaStatus.ORPHAN },
      });
    }
  }

  /**
   * 查询笔记下的媒体列表
   */
  async findByNoteId(noteId: string): Promise<Media[]> {
    const associations = await this.prisma.noteMedia.findMany({
      where: { noteId },
      include: { media: true },
      orderBy: { media: { uploadedAt: 'asc' } },
    });
    return associations.map((a) => a.media);
  }

  /**
   * 判断给定 mediaIds 中哪些是孤儿（无任何 NoteMedia 关联）
   * @returns 孤儿 mediaId 列表
   */
  async isOrphan(
    mediaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx || this.prisma;
    const counts = await Promise.all(
      mediaIds.map(async (mediaId) => {
        const count = await client.noteMedia.count({ where: { mediaId } });
        return { mediaId, count };
      }),
    );
    return counts.filter((c) => c.count === 0).map((c) => c.mediaId);
  }
}
