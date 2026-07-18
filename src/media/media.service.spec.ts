import { Test, TestingModule } from '@nestjs/testing';
import { $Enums, MediaStatus } from '@prisma/client';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const NOTE_ID = '11111111-1111-1111-1111-111111111111';
const MEDIA_ID = '550e8400-e29b-41d4-a716-446655440000';
const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEXT_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('MediaService', () => {
  let service: MediaService;
  const prisma = {
    media: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    noteMedia: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  describe('create', () => {
    it('persists originalFilename when provided', async () => {
      prisma.media.create.mockResolvedValue({
        id: MEDIA_ID,
        originalFilename: '报告.pdf',
      });

      await service.create({
        userId: USER_ID,
        type: $Enums.MediaType.FILE,
        qiniuKey: 'uploads/x.pdf',
        qiniuUrl: 'https://cdn.example.com/uploads/x.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        originalFilename: '报告.pdf',
      });

      expect(prisma.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          originalFilename: '报告.pdf',
        }),
      });
    });

    it('stores null when originalFilename is empty', async () => {
      prisma.media.create.mockResolvedValue({ id: MEDIA_ID, originalFilename: null });

      await service.create({
        userId: USER_ID,
        type: $Enums.MediaType.IMAGE,
        qiniuKey: 'uploads/x.png',
        qiniuUrl: 'https://cdn.example.com/uploads/x.png',
        originalFilename: '',
      });

      expect(prisma.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          originalFilename: null,
        }),
      });
    });
  });

  describe('attachToNote', () => {
    it('allows re-attaching ORPHAN media after detach (edit note with existing attachments)', async () => {
      const orphanMedia = {
        id: MEDIA_ID,
        userId: USER_ID,
        status: MediaStatus.ORPHAN,
      };
      prisma.media.findMany.mockResolvedValue([orphanMedia]);
      prisma.media.findUnique.mockResolvedValue(orphanMedia);
      prisma.noteMedia.createMany.mockResolvedValue({ count: 1 });
      prisma.media.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.attachToNote(NOTE_ID, [MEDIA_ID], USER_ID),
      ).resolves.toBeUndefined();

      expect(prisma.noteMedia.createMany).toHaveBeenCalledWith({
        data: [{ noteId: NOTE_ID, mediaId: MEDIA_ID }],
        skipDuplicates: true,
      });
      expect(prisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [MEDIA_ID] } },
        data: { status: MediaStatus.ATTACHED },
      });
    });

    it('still rejects ATTACHED media that belongs to another note', async () => {
      const attachedMedia = {
        id: MEDIA_ID,
        userId: USER_ID,
        status: MediaStatus.ATTACHED,
      };
      prisma.media.findMany.mockResolvedValue([attachedMedia]);
      prisma.media.findUnique.mockResolvedValue(attachedMedia);

      await expect(
        service.attachToNote(NOTE_ID, [MEDIA_ID], USER_ID),
      ).rejects.toMatchObject({ code: ErrorCode.MEDIA_NOT_PENDING });

      expect(prisma.noteMedia.createMany).not.toHaveBeenCalled();
    });

    it('rejects media owned by another user', async () => {
      const foreign = {
        id: MEDIA_ID,
        userId: '99999999-9999-9999-9999-999999999999',
        status: MediaStatus.PENDING,
      };
      prisma.media.findMany.mockResolvedValue([foreign]);
      prisma.media.findUnique.mockResolvedValue(foreign);

      await expect(
        service.attachToNote(NOTE_ID, [MEDIA_ID], USER_ID),
      ).rejects.toBeInstanceOf(BusinessException);

      try {
        await service.attachToNote(NOTE_ID, [MEDIA_ID], USER_ID);
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.MEDIA_NOT_OWNED);
      }
    });
  });

  describe('findByNoteId', () => {
    it('excludes TEXT placeholder media from query results', async () => {
      const image = {
        id: IMAGE_ID,
        type: $Enums.MediaType.IMAGE,
        status: MediaStatus.ATTACHED,
      };
      prisma.noteMedia.findMany.mockResolvedValue([{ media: image }]);

      const result = await service.findByNoteId(NOTE_ID);

      expect(prisma.noteMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            noteId: NOTE_ID,
            media: { type: { not: $Enums.MediaType.TEXT } },
          }),
        }),
      );
      expect(result).toEqual([image]);
    });
  });

  describe('detachFromNote', () => {
    it('only detaches non-TEXT media and leaves TEXT associations intact', async () => {
      prisma.noteMedia.findMany.mockResolvedValue([{ mediaId: IMAGE_ID }]);
      prisma.noteMedia.deleteMany.mockResolvedValue({ count: 1 });
      prisma.noteMedia.count.mockResolvedValue(0);
      prisma.media.updateMany.mockResolvedValue({ count: 1 });

      await service.detachFromNote(NOTE_ID);

      expect(prisma.noteMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            noteId: NOTE_ID,
            media: { type: { not: $Enums.MediaType.TEXT } },
          }),
        }),
      );
      expect(prisma.noteMedia.deleteMany).toHaveBeenCalledWith({
        where: { noteId: NOTE_ID, mediaId: { in: [IMAGE_ID] } },
      });
      expect(prisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [IMAGE_ID] } },
        data: { status: MediaStatus.ORPHAN },
      });
    });

    it('no-ops when note only has TEXT media', async () => {
      prisma.noteMedia.findMany.mockResolvedValue([]);

      await service.detachFromNote(NOTE_ID);

      expect(prisma.noteMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.media.updateMany).not.toHaveBeenCalled();
    });
  });
});
