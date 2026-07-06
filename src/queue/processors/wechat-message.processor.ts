import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WechatAccessTokenService } from '../../wechat/wechat-access-token.service';
import { WechatReplyService } from '../../wechat/wechat-reply.service';
import { UserService, DEFAULT_USER_ID } from '../../user/user.service';
import { $Enums, MediaStatus } from '@prisma/client';
import axios from 'axios';

/** 微信消息队列 Job 数据 */
export interface WechatMessageJobData {
  msgType: string;
  content?: string;
  rawContent: string;
  msgId: string;
  createTime: number;
  /** 发送者 openid（FromUserName） */
  fromUserName: string;
  /** 接收者（公众号原始 ID，用于回复） */
  toUserName: string;
  /** 媒体文件 ID（图片/语音/视频/文件） */
  mediaId?: string;
  /** 图片 URL（仅图片消息） */
  picUrl?: string;
  /** 语音格式 */
  format?: string;
  /** 语音识别结果 */
  recognition?: string;
  /** 链接消息 */
  linkTitle?: string;
  linkDescription?: string;
  linkUrl?: string;
}

/**
 * 微信消息处理器
 * 后台异步处理微信消息：多媒体下载 → 七牛云上传 → 创建笔记 → 客服消息回复
 */
@Processor('wechat-message')
export class WechatMessageProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly tokenService: WechatAccessTokenService,
    private readonly userService: UserService,
    private readonly replyService: WechatReplyService,
  ) {
    super();
  }

  /**
   * 处理队列中的微信消息 Job
   * @param job - BullMQ Job 对象，包含微信消息数据
   * @returns 处理结果（创建的笔记或 null）
   */
  async process(job: Job<WechatMessageJobData, any, string>): Promise<any> {
    const data = job.data;
    console.log(`[WechatProcessor] Processing job: msgId=${data.msgId}, type=${data.msgType}, attempt=${job.attemptsMade + 1}`);

    // 根据 openid 查找或创建用户
    const user = await this.userService.findOrCreateByWechat(data.fromUserName);
    const userId = user.id;
    console.log(`[WechatProcessor] User resolved: ${userId === DEFAULT_USER_ID ? 'DEFAULT' : userId.slice(0, 8)}...`);

    let note: any = null;

    switch (data.msgType) {
      case 'text':
        note = await this.processText(data, userId);
        break;
      case 'image':
      case 'voice':
      case 'video':
      case 'file':
        note = await this.processMedia(data, userId);
        break;
      default:
        console.log(`[WechatProcessor] Unknown msgType: ${data.msgType}, ignored`);
        return null;
    }

    // 笔记创建成功后，发送客服消息确认
    if (note && data.fromUserName) {
      const confirmText = data.msgType === 'text'
        ? `笔记「${note.title || '无标题'}」已保存 ✅`
        : `${this.getMediaTypeLabel(data.msgType)}笔记已保存 ✅`;
      await this.replyService.sendText(data.fromUserName, confirmText);
    }

    return note;
  }

  /**
   * 处理文本消息：直接创建笔记
   */
  private async processText(data: WechatMessageJobData, userId: string) {
    const title = this.generateTitle(data.content || '');

    const note = await this.prisma.note.create({
      data: {
        userId,
        type: $Enums.NoteType.DRAFT,
        source: $Enums.NoteSource.WECHAT,
        title,
        content: data.content,
        rawContent: data.rawContent,
        meta: {
          wechat_msg_id: data.msgId,
          wechat_create_time: data.createTime,
          from_user_name: data.fromUserName || undefined,
        },
      },
    });
    console.log(`[WechatProcessor] Note created: id=${note.id}, title="${title}", msgId=${data.msgId}`);
    return note;
  }

  /**
   * 处理多媒体消息：下载 → 上传七牛云 → 创建笔记并关联 NoteMedia
   */
  private async processMedia(data: WechatMessageJobData, userId: string) {
    const accessToken = await this.tokenService.getAccessToken();
    let content = '';
    let mediaUrl = '';

    if (data.msgType === 'image' && data.picUrl) {
      // 图片可直接用 picUrl，也可下载后转存七牛云
      mediaUrl = data.picUrl;
      content = '[图片]';
    } else if (data.msgType === 'voice') {
      content = data.recognition || '[语音]';
    } else if (data.msgType === 'video') {
      content = '[视频]';
    } else if (data.msgType === 'file') {
      content = data.linkTitle ? `[文件] ${data.linkTitle}` : '[文件]';
    }

    let mediaInfo: { key: string; url: string; mimeType: string; fileSize: number } | null = null;

    // 如果有 mediaId，从微信服务器下载并上传到七牛云
    if (data.mediaId && accessToken) {
      try {
        mediaInfo = await this.downloadAndUpload(
          accessToken,
          data.mediaId,
          data.msgType,
        );

        if (mediaInfo) {
          mediaUrl = mediaInfo.url;
        }
      } catch (err) {
        console.error(`[WechatProcessor] Failed to process media ${data.mediaId}:`, err);
        // 即使上传失败，仍然创建笔记记录
      }
    }

    const title = this.generateTitle(content);
    const mediaTypeMap: Record<string, $Enums.MediaType> = {
      image: $Enums.MediaType.IMAGE,
      voice: $Enums.MediaType.VOICE,
      video: $Enums.MediaType.VIDEO,
      file: $Enums.MediaType.FILE,
    };

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          userId,
          type: $Enums.NoteType.DRAFT,
          source: $Enums.NoteSource.WECHAT,
          title,
          content,
          rawContent: data.rawContent,
          meta: {
            wechat_msg_id: data.msgId,
            wechat_create_time: data.createTime,
            from_user_name: data.fromUserName || undefined,
            media_url: mediaUrl,
            media_type: data.msgType,
            ...(data.recognition ? { voice_recognition: data.recognition } : {}),
            ...(data.linkUrl ? { link_url: data.linkUrl, link_title: data.linkTitle, link_desc: data.linkDescription } : {}),
          },
        },
      });

      if (mediaInfo) {
        const media = await tx.media.create({
          data: {
            userId,
            type: mediaTypeMap[data.msgType],
            qiniuKey: mediaInfo.key,
            qiniuUrl: mediaInfo.url,
            wxMediaId: data.mediaId || null,
            fileSize: mediaInfo.fileSize,
            mimeType: mediaInfo.mimeType,
            status: MediaStatus.ATTACHED,
          },
        });
        await tx.noteMedia.create({
          data: { noteId: note.id, mediaId: media.id },
        });
      } else if (data.picUrl) {
        const media = await tx.media.create({
          data: {
            userId,
            type: $Enums.MediaType.IMAGE,
            qiniuKey: data.picUrl,
            qiniuUrl: data.picUrl,
            wxMediaId: data.mediaId || null,
            fileSize: 0,
            mimeType: '',
            status: MediaStatus.ATTACHED,
          },
        });
        await tx.noteMedia.create({
          data: { noteId: note.id, mediaId: media.id },
        });
      }

      return note;
    });
  }

  /**
   * 从微信服务器下载媒体文件并上传到七牛云
   * @param accessToken - 微信接口调用凭证
   * @param mediaId - 微信媒体文件唯一标识
   * @param msgType - 消息类型（image/voice/video/file）
   * @returns 上传后的媒体信息（key, url, mimeType, fileSize），失败返回 null
   */
  private async downloadAndUpload(
    accessToken: string,
    mediaId: string,
    msgType: string,
  ): Promise<{ key: string; url: string; mimeType: string; fileSize: number } | null> {
    const downloadUrl = `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${accessToken}&media_id=${mediaId}`;
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) return null;

    const mimeType = (response.headers['content-type'] as string) || '';
    const ext = this.getExtension(msgType, mimeType);
    const key = `wechat/${msgType}/${Date.now()}_${mediaId}.${ext}`;

    await this.storageService.uploadBuffer(key, buffer);
    const url = this.storageService.getPublicUrl(key);

    return { key, url, mimeType, fileSize: buffer.length };
  }

  /**
   * 根据消息类型和 Content-Type 获取文件扩展名
   */
  private getExtension(msgType: string, contentType: string): string {
    const extMap: Record<string, string> = {
      image: 'jpg',
      voice: 'amr',
      video: 'mp4',
      file: 'pdf',
    };

    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('mp3')) return 'mp3';
    if (contentType.includes('mpeg')) return 'mp3';

    return extMap[msgType] || 'bin';
  }

  /**
   * 从内容生成标题
   */
  private generateTitle(content: string): string {
    if (!content) return '无标题';
    const clean = content.replace(/\n/g, ' ').trim();
    return clean.length > 100 ? clean.slice(0, 100) : clean;
  }

  /**
   * 获取媒体类型的中文标签
   */
  private getMediaTypeLabel(msgType: string): string {
    const labelMap: Record<string, string> = {
      image: '📷 图片',
      voice: '🎤 语音',
      video: '🎬 视频',
      file: '📎 文件',
    };
    return labelMap[msgType] || '媒体';
  }
}
