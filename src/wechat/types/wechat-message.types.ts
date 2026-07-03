/** 微信回调 URL 验证参数 */
export interface WechatVerifyParams {
  signature: string;
  timestamp: string;
  nonce: string;
  echostr: string;
}

/** 微信推送的加密消息体 */
export interface WechatEncryptedMessage {
  ToUserName: string;
  Encrypt: string;
}

/** 解密后的基础消息字段 */
export interface WechatBaseMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  MsgId: string;
}

/** 文本消息 */
export interface WechatTextMessage extends WechatBaseMessage {
  MsgType: 'text';
  Content: string;
}

/** 图片消息 */
export interface WechatImageMessage extends WechatBaseMessage {
  MsgType: 'image';
  PicUrl: string;
  MediaId: string;
}

/** 语音消息 */
export interface WechatVoiceMessage extends WechatBaseMessage {
  MsgType: 'voice';
  MediaId: string;
  Format: string;
  Recognition?: string;
}

/** 视频消息 */
export interface WechatVideoMessage extends WechatBaseMessage {
  MsgType: 'video';
  MediaId: string;
  ThumbMediaId: string;
}

/** 链接消息 */
export interface WechatLinkMessage extends WechatBaseMessage {
  MsgType: 'link';
  Title: string;
  Description: string;
  Url: string;
}

/** 文件消息 */
export interface WechatFileMessage extends WechatBaseMessage {
  MsgType: 'file';
  Title: string;
  Description: string;
  FileKey: string;
  FileMd5: string;
  FileTotalLen: number;
}

/** 所有微信消息类型联合 */
export type WechatMessage =
  | WechatTextMessage
  | WechatImageMessage
  | WechatVoiceMessage
  | WechatVideoMessage
  | WechatLinkMessage
  | WechatFileMessage;
