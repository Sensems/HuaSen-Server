import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { WechatService } from './wechat.service';
import { WechatVerifyParams } from './types/wechat-message.types';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * 微信回调控制器
 * 处理公众号服务器配置验证和消息接收
 * 所有接口公开（微信服务器回调，不走 JWT）
 */
@Public()
@ApiTags('微信')
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
   * 返回加密的被动回复 XML（微信 5 秒内交付给用户）
   */
  @Post('callback')
  async receive(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    // Fastify 的 text/xml content type parser 已将 body 解析为字符串
    const body = req.body as string;
    console.log(`[WechatController] Received POST body length: ${body?.length ?? 'NULL'} bytes`);

    try {
      const reply = await this.wechatService.handleMessage(body);
      console.log(`[WechatController] Reply length: ${reply.length} bytes`);
      res.header('Content-Type', 'text/xml').send(reply);
    } catch (err) {
      console.error('[WechatController] handleMessage threw:', err);
      // 即使异常也必须返回非空字符串，否则微信会重试
      res.header('Content-Type', 'text/plain').send('success');
    }
  }
}
