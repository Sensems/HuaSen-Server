import { Test, TestingModule } from '@nestjs/testing';
import { NotesService } from './notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { MediaService } from '../media/media.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

const NOTE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '00000000-0000-0000-0000-000000000001';

const mockPrismaService = {
  note: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

const mockUserService = {};
const mockMediaService = {};

describe('NotesService - pin & findAll view', () => {
  let service: NotesService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UserService, useValue: mockUserService },
        { provide: MediaService, useValue: mockMediaService },
      ],
    }).compile();

    service = module.get(NotesService);
    prisma = module.get(PrismaService);
  });

  describe('pin', () => {
    it('should set pinnedAt when note is not pinned', async () => {
      const base = {
        id: NOTE_ID,
        userId: USER_ID,
        pinnedAt: null,
        deletedAt: null,
        category: null,
        tags: [],
        media: [],
      };
      prisma.note.findFirst.mockResolvedValue(base);
      prisma.note.update.mockResolvedValue({ ...base, pinnedAt: new Date('2026-07-13T10:00:00Z') });

      const result = await service.pin(NOTE_ID, USER_ID);

      expect(prisma.note.update).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
        data: { pinnedAt: expect.any(Date) },
      });
      expect(result.pinnedAt).toBeTruthy();
    });

    it('should clear pinnedAt when note is already pinned', async () => {
      const base = {
        id: NOTE_ID,
        userId: USER_ID,
        pinnedAt: new Date('2026-07-13T09:00:00Z'),
        deletedAt: null,
        category: null,
        tags: [],
        media: [],
      };
      prisma.note.findFirst.mockResolvedValue(base);
      prisma.note.update.mockResolvedValue({ ...base, pinnedAt: null });

      const result = await service.pin(NOTE_ID, USER_ID);

      expect(prisma.note.update).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
        data: { pinnedAt: null },
      });
      expect(result.pinnedAt).toBeNull();
    });

    it('should throw NOTE_NOT_FOUND when note missing', async () => {
      prisma.note.findFirst.mockResolvedValue(null);

      await expect(service.pin(NOTE_ID, USER_ID)).rejects.toThrow(BusinessException);

      try {
        await service.pin(NOTE_ID, USER_ID);
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOTE_NOT_FOUND);
      }
      expect(prisma.note.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll view', () => {
    beforeEach(() => {
      prisma.note.findMany.mockResolvedValue([]);
      prisma.note.count.mockResolvedValue(0);
    });

    it('should order by pinnedAt desc nulls last then createdAt desc by default', async () => {
      await service.findAll({}, USER_ID);

      expect(prisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { pinnedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
        }),
      );
      expect(prisma.note.findMany.mock.calls[0][0].where.pinnedAt).toBeUndefined();
    });

    it('should filter pinned only and order by pinnedAt when view=pinned', async () => {
      await service.findAll({ view: 'pinned' }, USER_ID);

      const arg = prisma.note.findMany.mock.calls[0][0];
      expect(arg.where.pinnedAt).toEqual({ not: null });
      expect(arg.orderBy).toEqual({ pinnedAt: 'desc' });
    });

    it('should order by createdAt only when view=recent', async () => {
      await service.findAll({ view: 'recent' }, USER_ID);

      const arg = prisma.note.findMany.mock.calls[0][0];
      expect(arg.where.pinnedAt).toBeUndefined();
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});
