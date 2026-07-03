import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error-codes';

/**
 * 全局异常过滤器
 * 统一捕获所有异常，输出 { code, message, data, details } 格式
 * 微信回调路径 /wechat/* 返回纯文本 "success"，不套 JSON
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // 微信回调路径：无论发生什么都返回 success
    if (request.url?.startsWith('/wechat/')) {
      return response.send('success');
    }

    // 业务异常：使用其 code 和 message
    if (exception instanceof BusinessException) {
      return response.send({
        code: exception.code,
        message: exception.message,
        data: null,
        details: exception.details,
      });
    }

    // NestJS 内置 HTTP 异常（如参数校验失败）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      let details: unknown = null;
      let message = exception.message;

      if (typeof resp === 'object' && resp !== null) {
        const respObj = resp as Record<string, unknown>;
        if (Array.isArray(respObj.message)) {
          details = respObj.message;
          message = '请求参数校验失败';
        } else if (typeof respObj.message === 'string') {
          message = respObj.message;
        }
      }

      // 401 返回未授权
      const code =
        status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST;

      return response.send({ code, message, data: null, details });
    }

    // 未知异常：500
    console.error('Unhandled exception:', exception);
    return response.send({
      code: 500,
      message: '服务器内部错误',
      data: null,
      details: null,
    });
  }
}
