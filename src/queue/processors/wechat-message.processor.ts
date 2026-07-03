import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WechatAccessTokenService } from '../../wechat/wechat-access-token.service';
import { DEFAULT_USER_ID } from '../../user/user.service';
import { $Enums } from '@prisma/client';
import axios from 'axios';

/** 微信消息队列 Job 数据 */
export interface WechatMessageJobData {
  msgType: string;
  content?: string;
  rawContent: string;
  msgId: string;
  createTime: number;
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
 * 后台异步处理微信消息：多媒体下载 → 七牛云上传 → 创建笔记
 */
@Processor('wechat-message')
export class WechatMessageProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly tokenService: WechatAccessTokenService,
  ) {
    super();
  }

  /**
   * 处理队列中的微信消息 Job
   */
  async process(job: Job<WechatMessageJobData, any, string>): Promise<any> {
    const data = job.data;

    switch (data.msgType) {
      case 'text':
        return this.processText(data);
      case 'image':
      case 'voice':
      case 'video':
      case 'file':
        return this.processMedia(data);
      default:
        console.log(`[WechatProcessor] Unknown msgType: ${data.msgType}, ignored`);
        return null;
    }
  }

  /**
   * 处理文本消息：直接创建笔记
   */
  private async processText(data: WechatMessageJobData) {
    const title = this.generateTitle(data.content || '');

    return this.prisma.note.create({
      data: {
        userId: DEFAULT_USER_ID,
        type: $Enums.NoteType.DRAFT,
        source: $Enums.NoteSource.WECHAT,
        title,
        content: data.content,
        rawContent: data.rawContent,
        meta: {
          wechat_msg_id: data.msgId,
          wechat_create_time: data.createTime,
        },
      },
    });
  }

  /**
   * 处理多媒体消息：下载 → 上传七牛云 → 创建笔记
   */
  private async processMedia(data: WechatMessageJobData) {
    const accessToken = await this.tokenService.getAccessToken();
    let content = '';
    let mediaUrl = '';

    if (data.msgType === 'image' && data.picUrl) {
      // 图片可直接用 picUrl，也可下载后转存七牛云
      mediaUrl = data.picUrl;
      content = '[图片]';
    } else if (data.msgType === 'voice') {
      content = data.recognition ? `[语音识别] ${data.recognition}` : '[语音]';
    } else if (data.msgType === 'video') {
      content = '[视频]';
    } else if (data.msgType === 'file') {
      content = data.linkTitle ? `[文件] ${data.linkTitle}` : '[文件]';
    }

    // 如果有 mediaId，从微信服务器下载并上传到七牛云
    if (data.mediaId && accessToken) {
      try {
        const qiniuUrl = await this.downloadAndUpload(
          accessToken,
          data.mediaId,
          data.msgType,
        );

        if (qiniuUrl) {
          mediaUrl = qiniuUrl;
        }
      } catch (err) {
        console.error(`[WechatProcessor] Failed to process media ${data.mediaId}:`, err);
        // 即使上传失败，仍然创建笔记记录
      }
    }

    const title = this.generateTitle(content);

    return this.prisma.note.create({
      data: {
        userId: DEFAULT_USER_ID,
        type: $Enums.NoteType.DRAFT,
        source: $Enums.NoteSource.WECHAT,
        title,
        content,
        rawContent: data.rawContent,
        meta: {
          wechat_msg_id: data.msgId,
          wechat_create_time: data.createTime,
          media_url: mediaUrl,
          media_type: data.msgType,
          ...(data.recognition ? { voice_recognition: data.recognition } : {}),
          ...(data.linkUrl ? { link_url: data.linkUrl, link_title: data.linkTitle, link_desc: data.linkDescription } : {}),
        },
      },
    });
  }

  /**
   * 从微信服务器下载媒体文件并上传到七牛云
   * @returns 七牛云文件 URL
   */
  private async downloadAndUpload(
    accessToken: string,
    mediaId: string,
    msgType: string,
  ): Promise<string | null> {
    const downloadUrl = `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${accessToken}&media_id=${mediaId}`;
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) return null;

    // 根据 Content-Type 推断文件扩展名
    const contentType = response.headers['content-type'] as string || '';
    const ext = this.getExtension(msgType, contentType);
    const key = `wechat/${msgType}/${Date.now()}_${mediaId}.${ext}`;

    // 上传到七牛云
    const result = await this.storageService.uploadBuffer(key, buffer);
    return this.storageService.getPublicUrl(key);
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
}
