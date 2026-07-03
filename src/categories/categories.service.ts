import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_USER_ID } from '../user/user.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoryDto } from './dto/reorder-category.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

/**
 * 分类服务
 * 支持树形分类结构，同级内按 sort_order 排序
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取分类列表（树形返回） */
  async findAll(userId?: string) {
    const uid = userId || DEFAULT_USER_ID;
    const categories = await this.prisma.category.findMany({
      where: { userId: uid },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { notes: true } } },
    });
    return this.buildTree(categories);
  }

  /** 创建分类 */
  async create(dto: CreateCategoryDto, userId?: string) {
    const uid = userId || DEFAULT_USER_ID;
    const exists = await this.prisma.category.findFirst({
      where: {
        userId: uid,
        name: dto.name,
        parentId: dto.parentId || null,
      },
    });
    if (exists) throw new BusinessException(ErrorCode.CATEGORY_DUPLICATE);

    if (dto.parentId) await this.checkDepth(dto.parentId, 1);

    const last = await this.prisma.category.findFirst({
      where: { userId: uid, parentId: dto.parentId || null },
      orderBy: { sortOrder: 'desc' },
    });

    return this.prisma.category.create({
      data: {
        userId: uid,
        name: dto.name,
        parentId: dto.parentId || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  /** 更新分类 */
  async update(dto: UpdateCategoryDto) {
    const { id, name, parentId } = dto;
    if (name) {
      const exists = await this.prisma.category.findFirst({
        where: { userId: DEFAULT_USER_ID, name, parentId: parentId || null, id: { not: id } },
      });
      if (exists) throw new BusinessException(ErrorCode.CATEGORY_DUPLICATE);
    }
    if (parentId && parentId === id)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不能将分类设为自己的子分类');

    return this.prisma.category.update({ where: { id }, data: { name, parentId } });
  }

  /** 删除分类（递归删除子孙，解除关联笔记） */
  async delete(id: string) {
    const children = await this.prisma.category.findMany({
      where: { parentId: id }, select: { id: true },
    });
    const childIds = children.map((c) => c.id);

    if (childIds.length > 0) {
      await this.prisma.category.deleteMany({ where: { parentId: { in: childIds } } });
    }
    await this.prisma.category.deleteMany({ where: { parentId: id } });

    const allAffectedIds = [id, ...childIds];
    const grandChildren = await this.prisma.category.findMany({
      where: { parentId: { in: childIds } }, select: { id: true },
    });
    allAffectedIds.push(...grandChildren.map((g) => g.id));

    await this.prisma.note.updateMany({
      where: { categoryId: { in: allAffectedIds } },
      data: { categoryId: null },
    });

    return this.prisma.category.delete({ where: { id } });
  }

  /** 拖拽排序 */
  async reorder(dto: ReorderCategoryDto) {
    const updates = dto.items.map((item, index) =>
      this.prisma.category.update({
        where: { id: item.id },
        data: { sortOrder: index, parentId: item.parentId },
      }),
    );
    await this.prisma.$transaction(updates);
    return this.findAll();
  }

  /** 扁平列表构建为树形 */
  private buildTree(categories: any[]): any[] {
    const map = new Map<string, any>();
    const roots: any[] = [];
    for (const cat of categories) map.set(cat.id, { ...cat, children: [] });
    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** 检查层级深度（最多 3 层） */
  private async checkDepth(parentId: string, depth: number) {
    if (depth >= 3) throw new BusinessException(ErrorCode.CATEGORY_DEPTH_EXCEEDED);
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId }, select: { parentId: true },
    });
    if (parent?.parentId) await this.checkDepth(parent.parentId, depth + 1);
  }
}
