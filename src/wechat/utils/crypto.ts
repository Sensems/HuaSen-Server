import * as crypto from 'crypto';

/**
 * 验证微信服务器签名
 * @param token - 公众号 Token
 * @param timestamp - 时间戳
 * @param nonce - 随机数
 * @param signature - 微信传来的签名
 * @returns 验证是否通过
 */
export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
): boolean {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1').update(str, 'utf-8').digest('hex');
  return sha1 === signature;
}

/**
 * 解密微信加密消息
 * 基于微信公众平台消息加解密技术文档
 * @param encryptText - Base64 编码的密文
 * @param encodingAESKey - 消息加解密密钥（43 位）
 * @param appId - 公众号 AppId
 * @returns 解密后的明文 XML
 */
export function decryptMessage(
  encryptText: string,
  encodingAESKey: string,
  appId: string,
): string {
  // 43 位 EncodingAESKey 转为 32 位 AES Key
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');

  // Base64 解码密文
  const encrypted = Buffer.from(encryptText, 'base64');

  // AES-256-CBC 解密（IV 为 AES Key 的前 16 字节）
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    aesKey,
    aesKey.slice(0, 16),
  );
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  // 去除 PKCS#7 填充
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.slice(0, decrypted.length - pad);

  // 去除前 16 字节随机字符串
  const content = decrypted.slice(16);

  // 读取消息长度（4 字节大端序）
  const msgLen = content.readUInt32BE(0);

  // 提取消息体
  const message = content.slice(4, 4 + msgLen).toString('utf-8');

  // 验证尾部 AppId
  const tailAppId = content.slice(4 + msgLen).toString('utf-8');
  if (tailAppId !== appId) {
    throw new Error('AppId verification failed');
  }

  return message;
}
