import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

/**
 * 验证 POST /storage/upload 能接受 multipart/form-data
 * （根因：未注册 @fastify/multipart 时 Fastify 返回 415 Unsupported Media Type）
 */
describe('Storage upload (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:password@localhost:5432/senhua_notes_test?schema=public';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(multipart, {
      limits: { fileSize: 10 * 1024 * 1024 },
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /storage/upload accepts multipart (not 415 Unsupported Media Type)', async () => {
    const boundary = '----NestFormBoundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="avatar.png"',
      'Content-Type: image/png',
      '',
      'fake-image-bytes',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const response = await app.inject({
      method: 'POST',
      url: '/storage/upload',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    const body = JSON.parse(response.payload);
    expect(body.message).not.toBe('Unsupported Media Type');
    // 未带 JWT：应走鉴权失败，而不是 Content-Type 拒绝
    expect(body.code).toBe(10002);
  });
});
