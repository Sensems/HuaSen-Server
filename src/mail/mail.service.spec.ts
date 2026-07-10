import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

const mockSendMail = jest.fn();

(nodemailer.createTransport as jest.Mock).mockReturnValue({
  sendMail: mockSendMail,
});

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    mockSendMail.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, unknown> = {
                'email.smtpHost': 'smtp.qq.com',
                'email.smtpPort': 465,
                'email.smtpUser': 'test@qq.com',
                'email.smtpPass': 'auth_code',
                'email.from': 'Test <test@qq.com>',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should send verification code email with correct parameters', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });

    await service.sendVerificationCode('user@example.com', '482931');

    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.from).toBe('Test <test@qq.com>');
    expect(callArgs.to).toBe('user@example.com');
    expect(callArgs.subject).toBe('森华笔记 - 邮箱验证码');
    expect(callArgs.html).toContain('482931');
    expect(callArgs.html).toContain('10 分钟内有效');
  });

  it('should throw error when SMTP send fails', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

    await expect(
      service.sendVerificationCode('user@example.com', '482931'),
    ).rejects.toThrow('SMTP connection failed');
  });
});
