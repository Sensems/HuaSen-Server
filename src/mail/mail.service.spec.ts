import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { Resend } from 'resend';

jest.mock('resend');

const mockResendSend = jest.fn();

(Resend as jest.MockedClass<typeof Resend>).mockImplementation(() => ({
  emails: { send: mockResendSend },
} as any));

describe('MailService', () => {
  let service: MailService;
  let configService: ConfigService;

  beforeEach(async () => {
    mockResendSend.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'email.resendApiKey': 're_test_key',
                'email.from': 'Test <test@example.com>',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should send verification code email with correct parameters', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    await service.sendVerificationCode('user@example.com', '482931');

    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'Test <test@example.com>',
      to: 'user@example.com',
      subject: '森华笔记 - 邮箱验证码',
      html: '<p>您的验证码是：<strong>482931</strong>，10分钟内有效。</p>',
    });
  });

  it('should throw error when Resend returns error', async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    });

    await expect(
      service.sendVerificationCode('user@example.com', '482931'),
    ).rejects.toThrow('Resend send failed: Invalid API key');
  });
});
