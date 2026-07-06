import { Injectable } from '@nestjs/common';
import { WechatAccessTokenService } from './wechat-access-token.service';
import axios from 'axios';

/**
 * 微信客服消息发送服务
 * 在笔记异步处理完成后，通过客服消息 API 向用户发送确认
 * 注意：客服消息必须在用户发送消息后 48 小时内发送
 */
@Injectable()
export class WechatReplyService {
  constructor(
    private readonly tokenService: WechatAccessTokenService,
  ) {}

  /**
   * 发送客服文本消息
   * @param toUser - 用户 openid（FromUserName）
   * @param content - 文本内容
   */
  async sendText(toUser: string, content: string): Promise<void> {
    if (!toUser) {
      console.warn('[WechatReply] toUser is empty, skipping');
      return;
    }

    const token = await this.tokenService.getAccessToken();
    if (!token) {
      console.warn('[WechatReply] No access token, skipping');
      return;
    }

    try {
      await axios.post(
        `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`,
        {
          touser: toUser,
          msgtype: 'text',
          text: { content },
        },
        { timeout: 10000 },
      );
      console.log(`[WechatReply] Sent text to ${toUser.slice(0, 8)}...`);
    } catch (err) {
      console.error(`[WechatReply] Failed to send text:`, err);
    }
  }
}
