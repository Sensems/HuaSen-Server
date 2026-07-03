import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 标签服务
 * 标签为全局共享（不分用户），通过多对多关联到笔记
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取所有标签（含笔记数量） */
  async findAll() {
    return this.prisma.tag.findMany({
      include: { _count: { select: { notes: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 创建标签（如果已存在则返回已有的） */
  async create(name: string) {
    const existing = await this.prisma.tag.findUnique({ where: { name } });
    if (existing) return existing;
    return this.prisma.tag.create({ data: { name } });
  }

  /** 删除标签（解绑所有关联笔记） */
  async delete(id: string) {
    await this.prisma.noteTag.deleteMany({ where: { tagId: id } });
    return this.prisma.tag.delete({ where: { id } });
  }
}
