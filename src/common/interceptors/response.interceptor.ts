import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorCode } from '../constants/error-codes';

/**
 * 统一响应格式包装
 * 将所有成功的返回值包装为 { code: 0, message: 'ok', data: ... }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    // 微信回调路径不包装
    if (request.url?.startsWith('/wechat/')) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data: data ?? null,
      })),
    );
  }
}
