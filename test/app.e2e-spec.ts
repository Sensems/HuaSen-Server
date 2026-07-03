import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

/**
 * E2E 集成测试
 * 通过设置环境变量覆盖 .env 配置，使用独立的 test 数据库
 */
describe('App E2E (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    // 覆盖数据库连接为测试库
    process.env.DATABASE_URL =
      'postgresql://postgres:password@localhost:5432/senhua_notes_test?schema=public';
    process.env.WECHAT_TOKEN = 'test_token';
    process.env.WECHAT_APP_ID = 'test_app_id';
    process.env.WECHAT_ENCODING_AES_KEY =
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notes returns code 0 with items array', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/notes',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('total');
  });

  it('POST /notes/create creates a note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: 'E2E 测试笔记' },
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
    expect(body.data.title).toBe('E2E 测试笔记');
    expect(body.data.type).toBe('DRAFT');
  });

  it('GET /categories returns tree structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/categories',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('GET /tags returns list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tags',
    });

    const body = JSON.parse(response.payload);
    expect(response.statusCode).toBe(200);
    expect(body.code).toBe(0);
  });

  it('POST /notes/delete soft-deletes a note', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待删除笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    const deleteRes = await app.inject({
      method: 'POST',
      url: '/notes/delete',
      payload: { id: noteId },
    });
    const body = JSON.parse(deleteRes.payload);
    expect(body.code).toBe(0);

    const listRes = await app.inject({ method: 'GET', url: '/notes' });
    const listBody = JSON.parse(listRes.payload);
    const found = listBody.data.items.find((n: any) => n.id === noteId);
    expect(found).toBeUndefined();
  });

  it('POST /notes/publish publishes a draft note', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待发布笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    const publishRes = await app.inject({
      method: 'POST',
      url: '/notes/publish',
      payload: { id: noteId },
    });
    const body = JSON.parse(publishRes.payload);
    expect(body.code).toBe(0);
    expect(body.data.type).toBe('PUBLISHED');
  });

  it('POST /notes/archive toggles archive status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/notes/create',
      payload: { content: '待归档笔记' },
    });
    const created = JSON.parse(createRes.payload);
    const noteId = created.data.id;

    await app.inject({
      method: 'POST',
      url: '/notes/publish',
      payload: { id: noteId },
    });

    const archiveRes = await app.inject({
      method: 'POST',
      url: '/notes/archive',
      payload: { id: noteId },
    });
    const body = JSON.parse(archiveRes.payload);
    expect(body.code).toBe(0);
    expect(body.data.type).toBe('ARCHIVED');

    const unarchiveRes = await app.inject({
      method: 'POST',
      url: '/notes/archive',
      payload: { id: noteId },
    });
    const unarchiveBody = JSON.parse(unarchiveRes.payload);
    expect(unarchiveBody.code).toBe(0);
    expect(unarchiveBody.data.type).toBe('PUBLISHED');
  });
});
