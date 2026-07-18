import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary: '微信服务器 Token 验证',
    description: '校验通过原样返回 echostr（纯文本，非 JSON）。',
  })
  @ApiQuery({ name: 'signature', example: 'xxx' })
  @ApiQuery({ name: 'timestamp', example: '1710000000' })
  @ApiQuery({ name: 'nonce', example: 'nonce' })
  @ApiQuery({ name: 'echostr', example: 'echostr-to-return' })
  @ApiOkResponse({
    description: '验证成功返回 echostr 纯文本',
    content: {
      'text/plain': {
        schema: { type: 'string', example: 'echostr-to-return' },
      },
    },
  })
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
  @ApiOperation({
    summary: '接收微信消息',
    description:
      '请求体为加密 XML（text/xml）。成功返回加密被动回复 XML；异常时降级返回纯文本 success。不走统一 JSON 包装。',
  })
  @ApiConsumes('text/xml')
  @ApiBody({
    description: '微信推送的加密 XML',
    schema: { type: 'string' },
    examples: {
      占位: {
        value: '<xml><Encrypt><![CDATA[...]]></Encrypt></xml>',
      },
    },
  })
  @ApiOkResponse({
    description: '加密被动回复 XML 或 success',
    content: {
      'text/xml': {
        schema: { type: 'string', example: '<xml>...</xml>' },
      },
      'text/plain': {
        schema: { type: 'string', example: 'success' },
      },
    },
  })
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
