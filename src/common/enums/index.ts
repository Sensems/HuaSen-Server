/** 笔记状态（值须与 Prisma NoteType 一致） */
export enum NoteType {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/** 笔记来源（值须与 Prisma NoteSource 一致） */
export enum NoteSource {
  WECHAT = 'WECHAT',
  APP_CLIPBOARD = 'APP_CLIPBOARD',
  APP_MANUAL = 'APP_MANUAL',
}

/** 多媒体类型（值须与 Prisma MediaType 一致） */
export enum MediaType {
  IMAGE = 'IMAGE',
  VOICE = 'VOICE',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  TEXT = 'TEXT',
}

/** 用户角色（值须与 Prisma UserRole 一致） */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}
