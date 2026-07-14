import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
      expect(prisma.user.create).toHaveBeenCalled();
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
  });
});
