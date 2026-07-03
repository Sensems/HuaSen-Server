import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Phase 1 默认用户 UUID（与 seed 脚本一致）
 * Phase 3 接入认证后，用户从 JWT 中获取
 */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 用户服务
 * Phase 1 仅提供默认用户查询，Phase 3 扩展微信 OAuth 绑定
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取默认用户
   * Phase 1 所有操作都关联到此用户
   */
  async getDefaultUser() {
    return this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
  }
}
