import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { decryptMessage, verifySignature, encryptMessage, generateSignature } from './utils/crypto';
import { parseWechatXml, buildReplyXml } from './utils/xml-parser';
import {
  WechatEncryptedMessage,
  WechatBaseMessage,
} from './types/wechat-message.types';
import { WechatMessageJobData } from '../queue/processors/wechat-message.processor';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';

/**
 * 微信消息服务
 * 处理公众号回调：Token 验证、消息解密 → 绑定码检测 → 入 BullMQ 队列
 */
@Injectable()
export class WechatService {
  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('wechat-message') private readonly messageQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
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
   * 解密 → 解析用户 → 绑定码检测 → 去重检查 → 入 BullMQ 队列 → 返回被动回复 XML（加密）
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
    const fromUserName = (message.FromUserName as string) || '';
    const toUserName = (message.ToUserName as string) || '';
    const msgType = message.MsgType as string;
    console.log(
      `[WechatService] Received msgType=${msgType} from=${fromUserName.slice(0, 8)}...`,
    );

    // 解析/创建微信用户（空壳或已绑定 App）
    const resolved = await this.userService.findOrCreateByWechat(fromUserName);
    console.log(
      `[WechatService] Resolved user id=${resolved.id.slice(0, 8)}... email=${resolved.email ? 'yes' : 'no'}`,
    );

    // 文本消息：检测绑定码（在入队前拦截）
    if (msgType === 'text') {
      const rawContent = ((message as any).Content as string) || '';
      const normalized = this.userService.normalizeBindingCode(rawContent);
      if (/^[A-Z0-9]{6}$/.test(normalized)) {
        // a. 空壳用户回发自己的绑定码 → 引导去 App 绑定，不入队
        if (resolved.bindingCode === normalized && !resolved.email) {
          console.log(
            `[WechatService] Shell user resent own binding code=${normalized}, skip enqueue`,
          );
          return this.safeEncryptedReply(
            fromUserName,
            toUserName,
            this.buildBindGuideText(normalized),
            encodingAESKey,
            appId,
          );
        }

        // b. 查绑定码主人：有 email 则为 App 用户码 → 执行绑定，不入队
        try {
          const owner = await this.prisma.user.findUnique({
            where: { bindingCode: normalized },
            select: { email: true },
          });
          if (owner?.email) {
            try {
              const result = await this.userService.bindOpenidToAppByCode(
                fromUserName,
                normalized,
              );
              console.log(
                `[WechatService] Bind by code ok: ${result.message}`,
              );
              return this.safeEncryptedReply(
                fromUserName,
                toUserName,
                result.message,
                encodingAESKey,
                appId,
              );
            } catch (bindErr) {
              console.error('[WechatService] Bind by code failed:', bindErr);
              return this.safeEncryptedReply(
                fromUserName,
                toUserName,
                '绑定失败，请稍后重试',
                encodingAESKey,
                appId,
              );
            }
          }
          // c. 他人空壳码或不存在 → 落入普通笔记流程
          console.log(
            `[WechatService] Code=${normalized} not an App binding code, fall through`,
          );
        } catch (lookupErr) {
          console.error(
            '[WechatService] Binding code lookup failed:',
            lookupErr,
          );
        }
      }
    }

    // 消息去重检查（xml2js 可能把 MsgId 解析为数字，需转字符串）
    const rawMsgId = (message as any).MsgId;
    const msgId = rawMsgId != null ? String(rawMsgId) : '';
    console.log(`[WechatService] msgId value=${msgId}, type=${typeof rawMsgId}`);

    // 去重：查询已有笔记中是否有相同 wechat_msg_id
    // 注意：DB 故障时不阻塞消息处理，仅跳过去重（BullMQ jobId 本身也提供一定幂等性）
    if (msgId) {
      try {
        const exists = await this.prisma.note.findFirst({
          where: {
            meta: { path: ['wechat_msg_id'], equals: msgId },
          },
        });
        if (exists) {
          console.log(`[WechatService] Duplicate msgId=${msgId}, skipping`);
          return 'success';
        }
      } catch (dbErr) {
        console.error(
          `[WechatService] Dedup query failed for msgId=${msgId}:`,
          dbErr,
        );
        // DB 不可用时继续处理，不丢消息
      }
    }

    // 构建 Job 数据并入队
    const jobData = this.buildJobData(message);
    await this.messageQueue.add('process-wechat-message', jobData, {
      jobId: msgId || undefined, // 用微信 msgId 做幂等（必须为字符串）
      removeOnComplete: true,
      removeOnFail: 100,
    });
    console.log(
      `[WechatService] Job enqueued: msgId=${msgId}, type=${msgType}`,
    );

    // 构造被动回复（加密 XML），5 秒内返回给微信
    const replyContent = !resolved.email
      ? this.buildBindGuideText(resolved.bindingCode || '')
      : this.contentMapForMsgType(msgType);
    return this.safeEncryptedReply(
      fromUserName,
      toUserName,
      replyContent,
      encodingAESKey,
      appId,
    );
  }

  /**
   * 将微信消息转换为队列 Job 数据
   */
  private buildJobData(msg: WechatBaseMessage): WechatMessageJobData {
    const rawMsgId = (msg as any).MsgId;
    const base: WechatMessageJobData = {
      msgType: msg.MsgType,
      rawContent: JSON.stringify(msg),
      msgId: rawMsgId != null ? String(rawMsgId) : '',
      createTime: msg.CreateTime,
      fromUserName: (msg as any).FromUserName as string || '',
      toUserName: (msg as any).ToUserName as string || '',
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

  /**
   * 构造绑定引导文案
   */
  private buildBindGuideText(code: string): string {
    return `请打开花森笔记 App，在绑定页输入绑定码：${code}`;
  }

  /**
   * 按消息类型返回「正在保存笔记」确认文案
   */
  private contentMapForMsgType(msgType: string): string {
    const contentMap: Record<string, string> = {
      text: '📝 收到文字，正在保存笔记...',
      image: '📷 收到图片，正在保存笔记...',
      voice: '🎤 收到语音，正在保存笔记...',
      video: '🎬 收到视频，正在保存笔记...',
      file: '📎 收到文件，正在保存笔记...',
      link: '🔗 收到链接，正在保存笔记...',
    };
    return contentMap[msgType] || '✅ 已收到，正在处理...';
  }

  /**
   * 构造被动回复的加密 XML 信封（任意正文）
   * @param toOpenid - 用户 openid（作为 ToUserName 回复给用户）
   * @param fromGhId - 公众号原始 ID（作为 FromUserName）
   * @param content - 回复正文
   * @param encodingAESKey - 加密密钥
   * @param appId - 公众号 AppId
   * @returns 加密后的 XML 字符串
   */
  private buildEncryptedReply(
    toOpenid: string,
    fromGhId: string,
    content: string,
    encodingAESKey: string,
    appId: string,
  ): string {
    const token = this.configService.get<string>('wechat.token', '');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Math.random().toString(36).slice(2, 10);

    const plainXml = buildReplyXml({
      ToUserName: toOpenid,
      FromUserName: fromGhId,
      CreateTime: parseInt(timestamp, 10),
      MsgType: 'text',
      Content: content,
    });

    const encrypt = encryptMessage(plainXml, encodingAESKey, appId);
    const signature = generateSignature(token, timestamp, nonce, encrypt);

    return buildReplyXml({
      Encrypt: encrypt,
      MsgSignature: signature,
      TimeStamp: timestamp,
      Nonce: nonce,
    });
  }

  /**
   * 安全构造加密被动回复；缺 openid/公众号 ID 或加密失败时降级为 success
   */
  private safeEncryptedReply(
    toOpenid: string,
    fromGhId: string,
    content: string,
    encodingAESKey: string,
    appId: string,
  ): string {
    if (!toOpenid || !fromGhId) {
      return 'success';
    }
    try {
      const reply = this.buildEncryptedReply(
        toOpenid,
        fromGhId,
        content,
        encodingAESKey,
        appId,
      );
      console.log('[WechatService] Passive reply built');
      return reply;
    } catch (err) {
      console.error('[WechatService] Failed to build passive reply:', err);
      return 'success';
    }
  }
}
