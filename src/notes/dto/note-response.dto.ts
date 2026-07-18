import { ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';

/** 笔记关联分类简要信息 */
export class NoteCategoryBriefDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: '工作' })
  name!: string;
}

/** 标签简要信息 */
export class NoteTagBriefDto {
  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  id!: string;

  @ApiProperty({ example: '随笔' })
  name!: string;
}

/** 笔记-标签关联 */
export class NoteTagLinkDto {
  @ApiProperty({ type: NoteTagBriefDto })
  tag!: NoteTagBriefDto;
}

/** 媒体项（详情/媒体列表） */
export class MediaItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: $Enums.MediaType, example: 'IMAGE' })
  type!: $Enums.MediaType;

  @ApiProperty({ example: 'notes/2026/07/a.jpg' })
  qiniuKey!: string;

  @ApiProperty({ example: 'https://cdn.example.com/notes/2026/07/a.jpg' })
  qiniuUrl!: string;

  @ApiProperty({ enum: $Enums.MediaStatus, example: 'ATTACHED' })
  status!: $Enums.MediaStatus;

  @ApiProperty({ example: 'image/jpeg', nullable: true })
  mimeType!: string | null;

  @ApiProperty({ example: 204800, nullable: true })
  fileSize!: number | null;

  @ApiProperty({
    description: '用户上传时的原始文件名',
    example: 'vacation.jpg',
    nullable: true,
  })
  originalFilename!: string | null;
}

/** 列表项（含 category + tags + 展平 media，排除 TEXT 占位） */
export class NoteListItemDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ enum: $Enums.NoteType, example: 'PUBLISHED' })
  type!: $Enums.NoteType;

  @ApiProperty({ enum: $Enums.NoteSource, example: 'APP_MANUAL' })
  source!: $Enums.NoteSource;

  @ApiProperty({ example: '我的第一篇笔记', nullable: true })
  title!: string | null;

  @ApiProperty({ example: '这是笔记的正文内容...', nullable: true })
  content!: string | null;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    nullable: true,
  })
  categoryId!: string | null;

  @ApiProperty({ type: NoteCategoryBriefDto, nullable: true })
  category!: NoteCategoryBriefDto | null;

  @ApiProperty({ type: [NoteTagLinkDto] })
  tags!: NoteTagLinkDto[];

  @ApiProperty({ type: [MediaItemDto], description: '关联媒体（排除 TEXT 占位）' })
  media!: MediaItemDto[];

  @ApiProperty({ example: null, nullable: true })
  pinnedAt!: Date | null;

  @ApiProperty({ example: '2026-07-15T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-15T10:00:00.000Z' })
  updatedAt!: Date;
}

/** 笔记详情（字段同列表项，含展平 media） */
export class NoteDetailDto extends NoteListItemDto {}

/** 笔记分页列表 */
export class NoteListResponseDto {
  @ApiProperty({ type: [NoteListItemDto] })
  items!: NoteListItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  size!: number;
}

/** 笔记分享信息 */
export class NoteShareResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: '我的第一篇笔记', nullable: true })
  title!: string | null;

  @ApiProperty({ enum: $Enums.NoteType, example: 'PUBLISHED' })
  type!: $Enums.NoteType;

  @ApiProperty({
    example: '/notes/detail?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  shareUrl!: string;
}
