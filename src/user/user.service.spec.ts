import { Test, TestingModule } from '@nestjs/testing';
import { DEFAULT_USER_ID, UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
  note: { updateMany: jest.fn(), count: jest.fn() },
  media: { updateMany: jest.fn() },
  category: { deleteMany: jest.fn() },
};

describe('UserService', () => {
  let service: UserService;
  let prisma: typeof mockPrisma;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UserService);
    prisma = module.get(PrismaService);
  });

  describe('generateBindingCode', () => {
    it('returns 6-char code from allowed charset', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const code = await service.generateBindingCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });

    it('retries on collision then succeeds', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'taken' })
        .mockResolvedValueOnce(null);
      const code = await service.generateBindingCode();
      expect(code).toHaveLength(6);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOrCreateByWechat', () => {
    it('creates shell user with bindingCode', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // by openid
      prisma.user.findUnique.mockResolvedValue(null); // generateBindingCode uniqueness
      prisma.user.create.mockResolvedValue({
        id: 'shell-1',
        email: null,
        bindingCode: 'ABC234',
        wxOpenid: 'oid',
      });

      const user = await service.findOrCreateByWechat('oid');
      expect(user.id).toBe('shell-1');
      expect(user.bindingCode).toBeTruthy();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bindingCode: expect.any(String),
            wxOpenid: 'oid',
          }),
        }),
      );
    });

    it('backfills bindingCode when existing shell has none', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'shell-2',
          email: null,
          bindingCode: null,
          wxOpenid: 'oid2',
        })
        .mockResolvedValue(null); // code uniqueness
      prisma.user.update.mockResolvedValue({
        id: 'shell-2',
        email: null,
        bindingCode: 'XYZ789',
        wxOpenid: 'oid2',
      });

      const user = await service.findOrCreateByWechat('oid2');
      expect(user.bindingCode).toBe('XYZ789');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('returns existing user with email without backfilling bindingCode', async () => {
      const existing = {
        id: 'user-with-email',
        email: 'user@example.com',
        bindingCode: null,
        wxOpenid: 'oid3',
      };
      prisma.user.findUnique.mockResolvedValueOnce(existing);

      const user = await service.findOrCreateByWechat('oid3');
      expect(user).toEqual(existing);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns default user when wxOpenid is empty', async () => {
      const user = await service.findOrCreateByWechat('');

      expect(user).toEqual({
        id: DEFAULT_USER_ID,
        email: null,
        bindingCode: null,
        wxOpenid: null,
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('returns wxBound false when no openid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        nickname: 'n',
        avatar: null,
        email: 'a@b.com',
        bindingCode: 'ABC234',
        wxOpenid: null,
      });
      const profile = await service.getProfile('u1');
      expect(profile.wxBound).toBe(false);
      expect(profile.bindingCode).toBe('ABC234');
    });
  });

  describe('updateProfile', () => {
    it('updates nickname only', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        nickname: '新昵称',
        avatar: 'https://cdn/a.png',
        email: 'a@b.com',
        bindingCode: 'ABC234',
        wxOpenid: null,
      });
      const result = await service.updateProfile('u1', { nickname: '新昵称' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { nickname: '新昵称' },
        select: expect.any(Object),
      });
      expect(result.nickname).toBe('新昵称');
    });
  });

  describe('bindByShellCode', () => {
    it('throws BINDING_CODE_INVALID when code missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.bindByShellCode('app-1', 'NOCODE')).rejects.toMatchObject({
        code: 20016,
      });
    });

    it('throws when code belongs to registered app user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other-app',
        email: 'x@y.com',
        wxOpenid: null,
        bindingCode: 'APPCOD',
      });
      await expect(service.bindByShellCode('app-1', 'APPCOD')).rejects.toMatchObject({
        code: 20016,
      });
    });

    it('merges shell notes into app user', async () => {
      prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'shell-1',
          email: null,
          wxOpenid: 'oid-shell',
          bindingCode: 'SHELL1',
        })
        .mockResolvedValueOnce({
          id: 'app-1',
          email: 'a@b.com',
          wxOpenid: null,
        })
        .mockResolvedValueOnce({
          id: 'shell-1',
          email: null,
        });
      prisma.note.count.mockResolvedValue(2);
      prisma.note.updateMany.mockResolvedValue({ count: 2 });
      prisma.media.updateMany.mockResolvedValue({ count: 0 });
      prisma.category.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockResolvedValue({});
      prisma.user.delete.mockResolvedValue({});

      const result = await service.bindByShellCode('app-1', 'SHELL1');

      expect(result).toEqual({
        wxBound: true,
        syncedDraftCount: 2,
        overwritten: false,
        message: '绑定成功，已同步 2 条笔记',
      });
      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { userId: 'shell-1' },
        data: { userId: 'app-1', categoryId: null },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'shell-1' } });
    });
  });

  describe('mergeWechatToAppUser', () => {
    it('migrates orphan shell holding openid when shellUserId omitted', async () => {
      prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
      prisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'app-1',
          email: 'a@b.com',
          wxOpenid: null,
        })
        .mockResolvedValueOnce({
          id: 'orphan-shell',
          email: null,
        });
      prisma.note.count.mockResolvedValue(1);
      prisma.note.updateMany.mockResolvedValue({ count: 1 });
      prisma.media.updateMany.mockResolvedValue({ count: 0 });
      prisma.category.deleteMany.mockResolvedValue({ count: 0 });
      prisma.user.update.mockResolvedValue({});
      prisma.user.delete.mockResolvedValue({});

      const result = await service.mergeWechatToAppUser({
        appUserId: 'app-1',
        wxOpenid: 'oid-orphan',
      });

      expect(result.syncedDraftCount).toBe(1);
      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { userId: 'orphan-shell' },
        data: { userId: 'app-1', categoryId: null },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'orphan-shell' },
      });
    });

    it('maps Prisma P2002 to BAD_REQUEST', async () => {
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.mergeWechatToAppUser({
          appUserId: 'app-1',
          wxOpenid: 'oid',
        }),
      ).rejects.toMatchObject({
        code: 10001,
        message: '绑定失败，请稍后重试',
      });
    });
  });
});
