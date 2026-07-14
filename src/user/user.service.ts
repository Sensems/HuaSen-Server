import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';

/**
 * Phase 1 默认用户 UUID（与 seed 脚本一致）
 * 仅作为微信消息无法匹配用户时的降级方案
 */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export type WechatResolvedUser = {
  id: string;
  email: string | null;
  bindingCode: string | null;
  wxOpenid: string | null;
};

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
   * 生成唯一绑定码（6 位大写字母数字，排除易混字符）
   */
  async generateBindingCode(): Promise<string> {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)],
      ).join('');
      const existing = await this.prisma.user.findUnique({
        where: { bindingCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique binding code');
  }

  /**
   * 根据微信 openid 查找或创建空壳用户；存量无码则补生成
   */
  async findOrCreateByWechat(wxOpenid: string): Promise<WechatResolvedUser> {
    if (!wxOpenid) {
      return {
        id: DEFAULT_USER_ID,
        email: null,
        bindingCode: null,
        wxOpenid: null,
      };
    }

    const existing = await this.prisma.user.findUnique({
      where: { wxOpenid },
      select: { id: true, email: true, bindingCode: true, wxOpenid: true },
    });

    if (existing) {
      if (!existing.bindingCode && !existing.email) {
        const bindingCode = await this.generateBindingCode();
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { bindingCode },
          select: { id: true, email: true, bindingCode: true, wxOpenid: true },
        });
      }
      return existing;
    }

    const bindingCode = await this.generateBindingCode();
    return this.prisma.user.create({
      data: {
        wxOpenid,
        bindingCode,
        role: $Enums.UserRole.USER,
      },
      select: { id: true, email: true, bindingCode: true, wxOpenid: true },
    });
  }
}
