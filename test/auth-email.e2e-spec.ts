import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';

/**
 * 邮箱认证 E2E 测试
 * 覆盖验证码发送、注册、登录、JWT 访问完整流程
 */
describe('Auth Email E2E (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const testEmail = 'e2e-test@example.com';
  const testPassword = 'TestPass123';
  const wrongPassword = 'WrongPass1';
  const nonExistentEmail = 'notfound@example.com';

  beforeAll(async () => {
    // 覆盖数据库连接为测试库
    process.env.DATABASE_URL =
      'postgresql://user_XBPFcn:password_MpDTNa@8.138.90.200:5432/senhua_notes_test?schema=public';
    process.env.WECHAT_TOKEN = 'test_token';
    process.env.WECHAT_APP_ID = 'test_app_id';
    process.env.WECHAT_ENCODING_AES_KEY =
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({ sendVerificationCode: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.emailVerificationCode.deleteMany({
      where: { email: { in: [testEmail, nonExistentEmail] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [testEmail, nonExistentEmail] } },
    });
    await app.close();
  });

  /**
   * Test 1: 发送验证码 + 限流
   */
  describe('POST /auth/email/send-code', () => {
    it('should send verification code successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/send-code',
        payload: { email: testEmail, purpose: 'register' },
      });

      const body = JSON.parse(response.payload);
      expect(response.statusCode).toBe(201);
      expect(body.code).toBe(0);
    });

    it('should return RATE_LIMITED when sending again immediately', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/send-code',
        payload: { email: testEmail, purpose: 'register' },
      });

      const body = JSON.parse(response.payload);
      // 全局异常过滤器将 429 映射为 BAD_REQUEST (10001)
      expect(body.code).toBe(10001);
    });
  });

  /**
   * Test 2: 使用错误验证码注册
   */
  it('POST /auth/email/register with wrong code → VERIFICATION_CODE_INVALID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/register',
      payload: {
        email: testEmail,
        password: testPassword,
        code: '000000',
      },
    });

    const body = JSON.parse(response.payload);
    expect(body.code).toBe(20012);
  });

  /**
   * Test 3: 完整注册流程
   */
  it('POST /auth/email/register full flow → success without tokens', async () => {
    // 从数据库读取 Test 1 发送的验证码（避免再次触发限流）
    const verification = await prisma.emailVerificationCode.findFirst({
      where: {
        email: testEmail,
        purpose: 'register',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(verification).not.toBeNull();
    expect(verification!.code).toMatch(/^\d{6}$/);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/email/register',
      payload: {
        email: testEmail,
        password: testPassword,
        code: verification!.code,
      },
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(201);
    expect(body.code).toBe(0);
    expect(body.data).toBeNull();
  });

  /**
   * Test 4: 邮箱登录
   */
  describe('POST /auth/email/login', () => {
    it('should login with correct credentials and return tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      const body = JSON.parse(response.payload);
      expect(response.statusCode).toBe(201);
      expect(body.code).toBe(0);
      expect(typeof body.data.accessToken).toBe('string');
      expect(typeof body.data.refreshToken).toBe('string');
    });

    it('should return PASSWORD_INCORRECT for wrong password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        payload: {
          email: testEmail,
          password: wrongPassword,
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.code).toBe(20014);
    });

    it('should return EMAIL_NOT_FOUND for non-existent email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        payload: {
          email: nonExistentEmail,
          password: testPassword,
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.code).toBe(20011);
    });
  });

  /**
   * Test 5: 使用 JWT 访问受保护端点
   */
  it('GET /notes with Bearer token → success', async () => {
    // 先登录获取 token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/email/login',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const loginBody = JSON.parse(loginRes.payload);
    const accessToken = loginBody.data.accessToken;

    // 携带 token 访问受保护端点
    const response = await app.inject({
      method: 'GET',
      url: '/notes',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('total');
  });
});
