import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { decryptMessage, verifySignature } from './utils/crypto';
import { parseWechatXml } from './utils/xml-parser';
import {
  WechatEncryptedMessage,
  WechatBaseMessage,
} from './types/wechat-message.types';
import { WechatMessageJobData } from '../queue/processors/wechat-message.processor';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_USER_ID } from '../user/user.service';

/**
 * 微信消息服务
 * 处理公众号回调：Token 验证、消息解密 → 入 BullMQ 队列
 */
@Injectable()
export class WechatService {
  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('wechat-message') private readonly messageQueue: Queue,
    private readonly prisma: PrismaService,
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
   * 解密 → 去重检查 → 入 BullMQ 队列 → 返回 success
   */
  async handleMessage(body: string): Promise<string> {
    console.log('[WechatService] Step 1: Parsing encrypted XML...');
    const encrypted = await parseWechatXml<WechatEncryptedMessage>(body);

    const encodingAESKey = this.configService.get<string>(
      'wechat.encodingAESKey',
      '',
    );
    const appId = this.configService.get<string>('wechat.appId', '');

    console.log('[WechatService] Step 2: Decrypting message...');
    const plainXml = decryptMessage(encrypted.Encrypt, encodingAESKey, appId);

    console.log('[WechatService] Step 3: Parsing plain XML...');
    const message = await parseWechatXml<WechatBaseMessage>(plainXml);
    console.log(`[WechatService] Received msgType=${message.MsgType}`);

    // 消息去重检查
    const msgId = (message as any).MsgId as string;
    if (msgId) {
      const exists = await this.prisma.note.findFirst({
        where: {
          userId: DEFAULT_USER_ID,
          meta: { path: ['wechat_msg_id'], equals: msgId },
        },
      });
      if (exists) {
        console.log(`[WechatService] Duplicate msgId=${msgId}, skipping`);
        return 'success';
      } // 重复消息，跳过
    }

    // 构建 Job 数据并入队
    const jobData = this.buildJobData(message);
    await this.messageQueue.add('process-wechat-message', jobData, {
      jobId: msgId || undefined, // 用微信 msgId 做幂等
      removeOnComplete: true,
      removeOnFail: 100,
    });
    console.log(`[WechatService] Job enqueued: msgId=${msgId}, type=${message.MsgType}`);

    return 'success';
  }

  /**
   * 将微信消息转换为队列 Job 数据
   */
  private buildJobData(msg: WechatBaseMessage): WechatMessageJobData {
    const base: WechatMessageJobData = {
      msgType: msg.MsgType,
      rawContent: JSON.stringify(msg),
      msgId: (msg as any).MsgId as string || '',
      createTime: msg.CreateTime,
    };

    switch (msg.MsgType) {
      case 'text':
        base.content = (msg as any).Content as string || '';
        break;
      case 'image':
        base.picUrl = (msg as any).PicUrl as string || '';
        base.mediaId = (msg as any).MediaId as string || '';
        break;
      case 'voice':
        base.mediaId = (msg as any).MediaId as string || '';
        base.format = (msg as any).Format as string || '';
        base.recognition = (msg as any).Recognition as string || '';
        break;
      case 'video':
        base.mediaId = (msg as any).MediaId as string || '';
        break;
      case 'file':
        base.mediaId = (msg as any).MediaId as string || '';
        break;
      case 'link':
        base.linkTitle = (msg as any).Title as string || '';
        base.linkDescription = (msg as any).Description as string || '';
        base.linkUrl = (msg as any).Url as string || '';
        base.content = `[链接] ${base.linkTitle}\n${base.linkDescription}\n${base.linkUrl}`;
        break;
    }

    return base;
  }
}
