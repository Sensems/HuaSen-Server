import { registerAs } from '@nestjs/config';

/**
 * 应用配置
 * 从环境变量读取并导出类型安全的配置对象
 */
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT as string, 10) || 3000,
}));

/**
 * 微信公众平台配置
 */
export const wechatConfig = registerAs('wechat', () => ({
  token: process.env.WECHAT_TOKEN,
  appId: process.env.WECHAT_APP_ID,
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
}));

/**
 * 七牛云存储配置（Phase 2 预留）
 */
export const qiniuConfig = registerAs('qiniu', () => ({
  accessKey: process.env.QINIU_ACCESS_KEY,
  secretKey: process.env.QINIU_SECRET_KEY,
  bucket: process.env.QINIU_BUCKET,
  domain: process.env.QINIU_DOMAIN,
}));
