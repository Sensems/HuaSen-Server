import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { WechatService } from './wechat.service';
import { WechatVerifyParams } from './types/wechat-message.types';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 微信回调控制器
 * 处理公众号服务器配置验证和消息接收
 */
@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  /**
   * 微信服务器 Token 验证
   * GET /wechat/callback?signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
   */
  @Get('callback')
  verify(@Query() params: WechatVerifyParams): string {
    const valid = this.wechatService.verifyToken(
      params.signature,
      params.timestamp,
      params.nonce,
    );
    return valid ? params.echostr : 'verification failed';
  }

  /**
   * 接收微信消息事件
   * POST /wechat/callback
   */
  @Post('callback')
  async receive(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    // Fastify 的 text/xml content type parser 已将 body 解析为字符串
    const body = req.body as string;
    await this.wechatService.handleMessage(body);

    res.header('Content-Type', 'text/plain').send('success');
  }
}
