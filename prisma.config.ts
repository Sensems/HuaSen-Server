import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

/**
 * Prisma 7 配置文件
 * datasource url 从 schema.prisma 迁移至此
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
