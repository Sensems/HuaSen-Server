import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessage } from '../constants/error-codes';

/**
 * 业务异常类
 * 统一封装业务逻辑中的异常，包含错误码和错误消息
 */
export class BusinessException extends HttpException {
  /** 业务错误码 */
  readonly code: number;
  /** 错误详情（可选，用于携带字段校验信息等） */
  readonly details: unknown;

  /**
   * @param code - 错误码，参见 ErrorCode 枚举
   * @param message - 自定义错误消息，不传则使用预定义消息
   * @param details - 额外的错误详情
   */
  constructor(code: number, message?: string, details?: unknown) {
    const msg = message ?? ErrorMessage[code] ?? '未知错误';
    super(msg, HttpStatus.OK); // 统一返回 200，通过 code 区分成功/失败
    this.code = code;
    this.details = details ?? null;
  }
}
