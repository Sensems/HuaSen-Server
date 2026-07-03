import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotesService } from '../notes/notes.service';
import { decryptMessage, verifySignature } from './utils/crypto';
import { parseWechatXml } from './utils/xml-parser';
import {
  WechatEncryptedMessage,
  WechatBaseMessage,
  WechatTextMessage,
} from './types/wechat-message.types';

/**
 * 微信消息服务
 * 处理公众号回调：Token 验证、消息解密、消息分发
 */
@Injectable()
export class WechatService {
  constructor(
    private readonly configService: ConfigService,
    private readonly notesService: NotesService,
  ) {}

  /**
   * 验证微信服务器签名
   */
  verifyToken(signature: string, timestamp: string, nonce: string): boolean {
    const token = this.configService.get<string>('wechat.token', '');
    return verifySignature(token, timestamp, nonce, signature);
  }

  /**
   * 处理微信推送的消息
   * Phase 1 仅处理文本消息，其他类型忽略
   */
  async handleMessage(body: string): Promise<string> {
    const encrypted = await parseWechatXml<WechatEncryptedMessage>(body);

    const encodingAESKey = this.configService.get<string>(
      'wechat.encodingAESKey',
      '',
    );
    const appId = this.configService.get<string>('wechat.appId', '');
    const plainXml = decryptMessage(encrypted.Encrypt, encodingAESKey, appId);

    const message = await parseWechatXml<WechatBaseMessage>(plainXml);
    await this.dispatchMessage(message);

    return 'success';
  }

  /**
   * 消息类型分发
   */
  private async dispatchMessage(message: WechatBaseMessage) {
    switch (message.MsgType) {
      case 'text':
        await this.handleTextMessage(message as WechatTextMessage);
        break;
      case 'image':
      case 'voice':
      case 'video':
      case 'file':
        console.log(
          `Multimedia message type ${message.MsgType} received, ignored in Phase 1`,
        );
        break;
      default:
        console.log(`Unknown message type: ${message.MsgType}, ignored`);
    }
  }

  /**
   * 处理文本消息，同步创建临时笔记
   */
  private async handleTextMessage(message: WechatTextMessage) {
    await this.notesService.createFromWechat({
      content: message.Content,
      rawContent: JSON.stringify(message),
      msgId: message.MsgId,
      createTime: message.CreateTime,
    });
  }
}
