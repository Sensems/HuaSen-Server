import { ApiProperty } from '@nestjs/swagger';

/**
 * 分类响应 DTO（Swagger 文档用）
 * 描述 categories 接口返回的分类对象结构
 */
export class CategoryDto {
  /** 分类 ID */
  @ApiProperty({ description: '分类 ID', example: 'clxxxxxxxxxxxxxxxx' })
  id!: string;

  /** 分类名称 */
  @ApiProperty({ description: '分类名称', example: '工作' })
  name!: string;

  /** 父分类 ID，顶级分类为 null */
  @ApiProperty({
    description: '父分类 ID，顶级分类为 null',
    example: null,
    nullable: true,
    required: false,
  })
  parentId?: string | null;

  /** 排序值，数字越小越靠前 */
  @ApiProperty({ description: '排序值，数字越小越靠前', example: 0 })
  sortOrder!: number;

  /** 关联笔记数（来自 _count.notes） */
  @ApiProperty({ description: '该分类下关联的笔记数量', example: 12 })
  notesCount!: number;

  /** 子分类列表 */
  @ApiProperty({
    description: '子分类列表（树形结构）',
    type: () => [CategoryDto],
    required: false,
  })
  children?: CategoryDto[];
}
