import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 当前用户最小信息 */
export interface CurrentUserInfo {
  id: string;
  openid?: string;
  nickname?: string;
  role: string;
  email?: string;
}

/**
 * 获取当前登录用户信息
 * 从 JWT Guard 注入的 req.user 中提取
 *
 * @example @CurrentUser() user: { id, openid, nickname, role }
 * @example @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
