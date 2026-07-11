import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockJwtService = {
  sign: jest.fn().mockReturnValue('fake-token'),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
    return undefined;
  }),
};

const mockMailService = {
  sendVerificationCode: jest.fn().mockResolvedValue(undefined),
};

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  emailVerificationCode: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('AuthService - Email Methods', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;
  let mailService: typeof mockMailService;
  let jwtService: typeof mockJwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    mailService = module.get(MailService);
    jwtService = module.get(JwtService);
  });

  describe('sendEmailCode', () => {
    it('should throw EMAIL_ALREADY_REGISTERED when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user-id' });

      await expect(service.sendEmailCode('existing@example.com')).rejects.toThrow(
        BusinessException,
      );

      try {
        await service.sendEmailCode('existing@example.com');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
      }

      expect(prisma.emailVerificationCode.create).not.toHaveBeenCalled();
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
    });

    it('should generate a 6-digit code and store it in DB with correct purpose and expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const email = 'user@example.com';
      const before = Date.now();

      await service.sendEmailCode(email);

      const after = Date.now();

      // 1. Verify code is 6 digits
      const createCall = prisma.emailVerificationCode.create.mock.calls[0][0];
      const code = createCall.data.code;
      expect(code).toMatch(/^\d{6}$/);

      // 2. Verify DB write with purpose='register' and expiresAt ≈ now+10min
      expect(prisma.emailVerificationCode.create).toHaveBeenCalledWith({
        data: {
          email,
          code: expect.any(String),
          purpose: 'register',
          expiresAt: expect.any(Date),
        },
      });

      const expiresAt = createCall.data.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1000);

      // 3. Verify mailService.sendVerificationCode called with correct args
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(email, code);
    });

    it('should throw EMAIL_SEND_FAILED when mailService throws', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      mailService.sendVerificationCode.mockRejectedValue(new Error('SMTP error'));

      await expect(service.sendEmailCode('user@example.com')).rejects.toThrow(
        BusinessException,
      );

      try {
        await service.sendEmailCode('user@example.com');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.EMAIL_SEND_FAILED);
      }
    });
  });

  describe('emailRegister', () => {
    it('should throw EMAIL_ALREADY_REGISTERED when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user-id' });

      const dto: EmailRegisterDto = {
        email: 'existing@example.com',
        password: 'Abc12345',
        code: '123456',
      };

      await expect(service.emailRegister(dto)).rejects.toThrow(BusinessException);

      try {
        await service.emailRegister(dto);
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
      }
    });

    it('should throw VERIFICATION_CODE_INVALID when no matching code found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.emailVerificationCode.findFirst.mockResolvedValue(null);

      const dto: EmailRegisterDto = {
        email: 'new@example.com',
        password: 'Abc12345',
        code: '999999',
      };

      await expect(service.emailRegister(dto)).rejects.toThrow(BusinessException);

      try {
        await service.emailRegister(dto);
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.VERIFICATION_CODE_INVALID);
      }
    });

    it('should throw VERIFICATION_CODE_EXPIRED when code exists but is expired', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      // Distinguish the two findFirst calls by checking whether expiresAt filter is present
      prisma.emailVerificationCode.findFirst.mockImplementation((args: any) => {
        if (args?.where?.expiresAt) {
          // First call: with gt: new Date() — simulates expired code
          return Promise.resolve(null);
        }
        // Second call: without expiry check — returns the expired record
        return Promise.resolve({
          id: 'code-id',
          email: 'new@example.com',
          code: '123456',
          purpose: 'register',
          usedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        });
      });

      const dto: EmailRegisterDto = {
        email: 'new@example.com',
        password: 'Abc12345',
        code: '123456',
      };

      await expect(service.emailRegister(dto)).rejects.toThrow(BusinessException);

      try {
        await service.emailRegister(dto);
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.VERIFICATION_CODE_EXPIRED);
      }
    });

    it('should successfully register user when all validations pass', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.emailVerificationCode.findFirst.mockResolvedValue({
        id: 'code-id',
        email: 'new@example.com',
        code: '123456',
        purpose: 'register',
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      prisma.emailVerificationCode.update.mockResolvedValue({ id: 'code-id', usedAt: new Date() });
      prisma.user.create.mockResolvedValue({ id: 'new-user-id', email: 'new@example.com' });
      // For generateBindingCode uniqueness check — no collision
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const { hash } = await import('bcrypt');

      const dto: EmailRegisterDto = {
        email: 'new@example.com',
        password: 'Abc12345',
        code: '123456',
      };

      const result = await service.emailRegister(dto);

      // Verify code marked as used
      expect(prisma.emailVerificationCode.update).toHaveBeenCalledWith({
        where: { id: 'code-id' },
        data: { usedAt: expect.any(Date) },
      });

      // Verify password hashed
      expect(hash).toHaveBeenCalledWith(dto.password, 10);

      // Verify user created with correct fields
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          passwordHash: 'hashed-password',
          bindingCode: expect.any(String),
          role: 'USER',
        },
        select: { id: true, email: true },
      });

      // Verify JWT tokens returned
      expect(result).toEqual({
        accessToken: 'fake-token',
        refreshToken: 'fake-token',
        expiresIn: 7200,
      });

      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('emailLogin', () => {
    it('should throw EMAIL_NOT_FOUND when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const dto: EmailLoginDto = {
        email: 'notfound@example.com',
        password: 'Abc12345',
      };

      await expect(service.emailLogin(dto)).rejects.toThrow(BusinessException);

      try {
        await service.emailLogin(dto);
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.EMAIL_NOT_FOUND);
      }
    });

    it('should throw PASSWORD_INCORRECT when password does not match', async () => {
      const { compare } = await import('bcrypt');
      (compare as jest.Mock).mockResolvedValueOnce(false);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        passwordHash: 'hashed-password',
        email: 'user@example.com',
      });

      const dto: EmailLoginDto = {
        email: 'user@example.com',
        password: 'WrongPass1',
      };

      await expect(service.emailLogin(dto)).rejects.toThrow(BusinessException);

      try {
        await service.emailLogin(dto);
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.PASSWORD_INCORRECT);
      }

      expect(compare).toHaveBeenCalledWith(dto.password, 'hashed-password');
    });

    it('should return JWT tokens on successful login', async () => {
      const { compare } = await import('bcrypt');
      (compare as jest.Mock).mockResolvedValueOnce(true);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        passwordHash: 'hashed-password',
        email: 'user@example.com',
      });

      const dto: EmailLoginDto = {
        email: 'user@example.com',
        password: 'Abc12345',
      };

      const result = await service.emailLogin(dto);

      expect(compare).toHaveBeenCalledWith(dto.password, 'hashed-password');
      expect(result).toEqual({
        accessToken: 'fake-token',
        refreshToken: 'fake-token',
        expiresIn: 7200,
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateBindingCode', () => {
    it('should generate a 6-character code using only allowed characters', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      // Access private method via any
      const code = await (service as any).generateBindingCode();

      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });

    it('should retry and check uniqueness when collision occurs', async () => {
      // First two attempts collide, third succeeds
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'existing-1' }) // collision
        .mockResolvedValueOnce({ id: 'existing-2' }) // collision
        .mockResolvedValueOnce(null); // success

      const code = await (service as any).generateBindingCode();

      expect(code).toHaveLength(6);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(3);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { bindingCode: expect.any(String) },
      });
    });

    it('should throw error after 5 failed attempts', async () => {
      // All 5 attempts collide
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect((service as any).generateBindingCode()).rejects.toThrow(
        'Failed to generate unique binding code',
      );

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(5);
    });
  });
});
