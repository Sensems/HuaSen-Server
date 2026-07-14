import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

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

export type UserProfile = {
  id: string;
  nickname: string | null;
  avatar: string | null;
  email: string | null;
  bindingCode: string | null;
  wxBound: boolean;
};

export type BindResult = {
  wxBound: true;
  syncedDraftCount: number;
  overwritten: boolean;
  message: string;
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

  /**
   * 获取当前用户资料
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        email: true,
        bindingCode: true,
        wxOpenid: true,
      },
    });
    if (!user) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '用户不存在');
    }
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      bindingCode: user.bindingCode,
      wxBound: user.wxOpenid != null,
    };
  }

  /**
   * 更新昵称和/或头像 URL
   */
  async updateProfile(
    userId: string,
    data: { nickname?: string; avatar?: string },
  ): Promise<UserProfile> {
    const payload: { nickname?: string; avatar?: string } = {};
    if (data.nickname !== undefined) payload.nickname = data.nickname;
    if (data.avatar !== undefined) payload.avatar = data.avatar;
    if (Object.keys(payload).length === 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请至少提供 nickname 或 avatar');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: payload,
      select: {
        id: true,
        nickname: true,
        avatar: true,
        email: true,
        bindingCode: true,
        wxOpenid: true,
      },
    });
    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      bindingCode: user.bindingCode,
      wxBound: user.wxOpenid != null,
    };
  }

  /**
   * 规范化绑定码（trim + 大写）
   */
  normalizeBindingCode(raw: string): string {
    return raw.trim().toUpperCase();
  }

  /**
   * App 端：用微信空壳绑定码合并到当前登录用户
   */
  async bindByShellCode(appUserId: string, rawCode: string): Promise<BindResult> {
    const code = this.normalizeBindingCode(rawCode);
    const shell = await this.prisma.user.findUnique({
      where: { bindingCode: code },
      select: { id: true, email: true, wxOpenid: true, bindingCode: true },
    });
    if (!shell || shell.email || !shell.wxOpenid) {
      throw new BusinessException(ErrorCode.BINDING_CODE_INVALID);
    }
    return this.mergeWechatToAppUser({
      appUserId,
      wxOpenid: shell.wxOpenid,
      shellUserId: shell.id,
    });
  }

  /**
   * 微信端：用户发送 App 注册绑定码，将当前 openid 绑到该 App 用户
   */
  async bindOpenidToAppByCode(wxOpenid: string, rawCode: string): Promise<BindResult> {
    const code = this.normalizeBindingCode(rawCode);
    const appUser = await this.prisma.user.findUnique({
      where: { bindingCode: code },
      select: { id: true, email: true, wxOpenid: true },
    });
    if (!appUser || !appUser.email) {
      throw new BusinessException(ErrorCode.BINDING_CODE_INVALID);
    }
    const shell = await this.prisma.user.findUnique({
      where: { wxOpenid },
      select: { id: true, email: true },
    });
    const shellUserId =
      shell && !shell.email && shell.id !== appUser.id ? shell.id : undefined;
    return this.mergeWechatToAppUser({
      appUserId: appUser.id,
      wxOpenid,
      shellUserId,
    });
  }

  /**
   * 将 wxOpenid 绑定到 App 用户；可选迁移空壳 notes/media，笔记 categoryId 置空
   */
  async mergeWechatToAppUser(params: {
    appUserId: string;
    wxOpenid: string;
    shellUserId?: string;
  }): Promise<BindResult> {
    const { appUserId, wxOpenid, shellUserId } = params;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const appUser = await tx.user.findUnique({
          where: { id: appUserId },
          select: { id: true, email: true, wxOpenid: true },
        });
        if (!appUser?.email) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, '目标账号未完成 App 注册');
        }

        // 幂等：已是该绑定
        if (appUser.wxOpenid === wxOpenid) {
          return {
            wxBound: true as const,
            syncedDraftCount: 0,
            overwritten: false,
            message: '已绑定',
          };
        }

        let overwritten = false;

        // openid 已挂在其他用户上
        const holder = await tx.user.findUnique({
          where: { wxOpenid },
          select: { id: true, email: true },
        });
        if (holder && holder.id !== appUserId && holder.id !== shellUserId) {
          if (holder.email) {
            await tx.user.update({
              where: { id: holder.id },
              data: { wxOpenid: null },
            });
            overwritten = true;
          }
        }

        // 显式空壳，或占用 openid 的无 email 孤儿空壳，统一走迁移删除
        const effectiveShellId =
          shellUserId ??
          (holder && !holder.email && holder.id !== appUserId
            ? holder.id
            : undefined);

        // App 用户已绑其他微信 → 换绑
        if (appUser.wxOpenid && appUser.wxOpenid !== wxOpenid) {
          overwritten = true;
        }

        let syncedDraftCount = 0;
        if (effectiveShellId && effectiveShellId !== appUserId) {
          syncedDraftCount = await tx.note.count({
            where: { userId: effectiveShellId, deletedAt: null },
          });
          await tx.note.updateMany({
            where: { userId: effectiveShellId },
            data: { userId: appUserId, categoryId: null },
          });
          await tx.media.updateMany({
            where: { userId: effectiveShellId },
            data: { userId: appUserId },
          });
          await tx.category.deleteMany({ where: { userId: effectiveShellId } });
          // 先解开 openid unique，再删空壳
          await tx.user.update({
            where: { id: effectiveShellId },
            data: { wxOpenid: null, bindingCode: null },
          });
          await tx.user.delete({ where: { id: effectiveShellId } });
        }

        await tx.user.update({
          where: { id: appUserId },
          data: { wxOpenid },
        });

        const message = overwritten
          ? '绑定成功，已覆盖原有微信绑定'
          : syncedDraftCount > 0
            ? `绑定成功，已同步 ${syncedDraftCount} 条笔记`
            : '绑定成功';

        return {
          wxBound: true as const,
          syncedDraftCount,
          overwritten,
          message,
        };
      });
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      const prismaCode = (error as { code?: string })?.code;
      if (prismaCode === 'P2002' || prismaCode === 'P2025') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '绑定失败，请稍后重试',
        );
      }
      throw error;
    }
  }
}
