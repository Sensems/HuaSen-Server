import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 数据库初始化脚本
 * Phase 1 创建一个默认管理员用户，所有笔记关联到此用户
 */
async function main() {
  // 使用固定 UUID 便于调试
  const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

  const user = await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      nickname: '默认用户',
      role: 'ADMIN',
    },
  });

  console.log('Seed completed. Default user:', user.id);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
