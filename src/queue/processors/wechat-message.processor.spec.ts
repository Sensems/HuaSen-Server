import { Test, TestingModule } from '@nestjs/testing';
import { WechatMessageProcessor } from './wechat-message.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WechatAccessTokenService } from '../../wechat/wechat-access-token.service';
import { WechatReplyService } from '../../wechat/wechat-reply.service';
import { UserService } from '../../user/user.service';
import { $Enums, MediaStatus } from '@prisma/client';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const NOTE_ID = '11111111-1111-1111-1111-111111111111';
const MEDIA_ID = '22222222-2222-2222-2222-222222222222';
const MSG_ID = 'wx-msg-1001';

describe('WechatMessageProcessor - processText TEXT media', () => {
  let processor: WechatMessageProcessor;
  const tx = {
    note: { create: jest.fn() },
    media: { create: jest.fn() },
    noteMedia: { create: jest.fn() },
  };
  const mockPrisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    note: { create: jest.fn() },
  };
  const mockUserService = {
    findOrCreateByWechat: jest.fn().mockResolvedValue({ id: USER_ID }),
  };
  const mockReply = { sendText: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.note.create.mockResolvedValue({ id: NOTE_ID, title: '标题行' });
    tx.media.create.mockResolvedValue({ id: MEDIA_ID });
    tx.noteMedia.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatMessageProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: {} },
        { provide: WechatAccessTokenService, useValue: {} },
        { provide: UserService, useValue: mockUserService },
        { provide: WechatReplyService, useValue: mockReply },
      ],
    }).compile();

    processor = module.get(WechatMessageProcessor);
  });

  it('should create TEXT media and link for text messages', async () => {
    const raw = '标题行\n正文内容';
    const job = {
      data: {
        msgType: 'text',
        content: raw,
        rawContent: '<xml>...</xml>',
        msgId: MSG_ID,
        createTime: 1710000000,
        fromUserName: 'openid-1',
        toUserName: 'gh_1',
      },
      attemptsMade: 0,
    } as any;

    await processor.process(job);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(tx.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          source: $Enums.NoteSource.WECHAT,
          title: '标题行',
          content: '正文内容',
          meta: expect.objectContaining({
            wechat_msg_id: MSG_ID,
            media_type: 'text',
          }),
        }),
      }),
    );
    expect(tx.media.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        type: $Enums.MediaType.TEXT,
        qiniuKey: `text/wechat/${MSG_ID}`,
        qiniuUrl: '',
        mimeType: 'text/plain',
        fileSize: Buffer.byteLength(raw, 'utf8'),
        status: MediaStatus.ATTACHED,
      },
    });
    expect(tx.noteMedia.create).toHaveBeenCalledWith({
      data: { noteId: NOTE_ID, mediaId: MEDIA_ID },
    });
    expect(mockReply.sendText).toHaveBeenCalled();
  });
});
