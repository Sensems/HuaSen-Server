/**
 * 业务错误码枚举
 * 格式：模块前缀 + 具体错误码
 */
export enum ErrorCode {
  // 通用错误 1xxxx
  SUCCESS = 0,
  BAD_REQUEST = 10001,
  UNAUTHORIZED = 10002,
  RATE_LIMITED = 10003,
  NOT_FOUND = 10004,

  // 认证错误 2xxxx
  TOKEN_EXPIRED = 20001,
  WECHAT_AUTH_FAILED = 20002,
  TOKEN_INVALID = 20003,

  // 笔记错误 3xxxx
  NOTE_NOT_FOUND = 30001,
  NOTE_DELETED = 30002,
  NOTE_INVALID_OPERATION = 30003,

  // 分类/标签错误 4xxxx
  CATEGORY_DUPLICATE = 40001,
  CATEGORY_DEPTH_EXCEEDED = 40002,

  // ===== 5xxxx 多媒体 =====
  MEDIA_NOT_FOUND = 50001,
  MEDIA_NOT_OWNED = 50002,
  MEDIA_NOT_PENDING = 50003,

  // 存储错误 6xxxx
  UPLOAD_FAILED = 60001,
  FILE_TOO_LARGE = 60002,
  SIGNATURE_EXPIRED = 60003,
}

/**
 * 错误码对应的中文消息
 */
export const ErrorMessage: Record<number, string> = {
  [ErrorCode.SUCCESS]: '操作成功',
  [ErrorCode.BAD_REQUEST]: '请求参数有误',
  [ErrorCode.UNAUTHORIZED]: '未登录或登录已过期',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.TOKEN_EXPIRED]: 'Token 已过期',
  [ErrorCode.WECHAT_AUTH_FAILED]: '微信授权失败',
  [ErrorCode.TOKEN_INVALID]: 'Token 无效',
  [ErrorCode.NOTE_NOT_FOUND]: '笔记不存在',
  [ErrorCode.NOTE_DELETED]: '笔记已删除',
  [ErrorCode.NOTE_INVALID_OPERATION]: '不允许的操作',
  [ErrorCode.CATEGORY_DUPLICATE]: '分类名称重复',
  [ErrorCode.CATEGORY_DEPTH_EXCEEDED]: '分类层级超过限制',
  [ErrorCode.MEDIA_NOT_FOUND]: '媒体记录不存在',
  [ErrorCode.MEDIA_NOT_OWNED]: '媒体不属于当前用户',
  [ErrorCode.MEDIA_NOT_PENDING]: '媒体状态不是待关联',
  [ErrorCode.UPLOAD_FAILED]: '文件上传失败',
  [ErrorCode.FILE_TOO_LARGE]: '文件大小超过限制',
  [ErrorCode.SIGNATURE_EXPIRED]: '上传凭证已过期',
};
