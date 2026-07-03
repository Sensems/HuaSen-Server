import { SetMetadata } from '@nestjs/common';

/** 标记路由为公开访问（跳过 JWT 验证） */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
