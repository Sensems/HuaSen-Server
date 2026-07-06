import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';

/**
 * Phase 1 默认用户 UUID（与 seed 脚本一致）
 * 仅作为微信消息无法匹配用户时的降级方案
 */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 用户服务
 * 提供用户查询、微信 openid 绑定等功能
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取默认用户
   */
  async getDefaultUser() {
    return this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
  }

  /**
   * 根据微信 openid 查找或创建用户
   * 用于微信消息处理链路：每次收到消息时自动关联到真实用户
   * @param wxOpenid - 微信用户唯一标识（FromUserName）
   * @returns 用户 ID（如果 openid 为空，返回默认用户 ID）
   */
  async findOrCreateByWechat(wxOpenid: string): Promise<{ id: string }> {
    if (!wxOpenid) {
      return { id: DEFAULT_USER_ID };
    }

    // 查找已有用户
    const existing = await this.prisma.user.findUnique({
      where: { wxOpenid },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    // 创建新用户（普通用户角色，非管理员）
    const user = await this.prisma.user.create({
      data: {
        wxOpenid,
        role: $Enums.UserRole.USER,
      },
      select: { id: true },
    });

    console.log(`[UserService] Created new user for openid: ${wxOpenid.slice(0, 8)}...`);
    return user;
  }
}
