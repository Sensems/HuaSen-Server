/** 笔记状态 */
export enum NoteType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/** 笔记来源 */
export enum NoteSource {
  WECHAT = 'wechat',
  APP_CLIPBOARD = 'app_clipboard',
  APP_MANUAL = 'app_manual',
}

/** 多媒体类型 */
export enum MediaType {
  IMAGE = 'image',
  VOICE = 'voice',
  VIDEO = 'video',
  FILE = 'file',
}

/** 用户角色 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
