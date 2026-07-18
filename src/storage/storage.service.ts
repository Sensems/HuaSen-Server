import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qiniu from 'qiniu';

/**
 * 七牛云存储服务
 * 提供文件上传、上传 Token 生成、文件删除等功能
 */
@Injectable()
export class StorageService {
  private readonly mac: qiniu.auth.digest.Mac;
  private readonly config: qiniu.conf.Config;
  private readonly bucketManager: qiniu.rs.BucketManager;
  private readonly bucket: string;
  private readonly domain: string;

  constructor(private readonly configService: ConfigService) {
    const accessKey = this.configService.get<string>('qiniu.accessKey', '');
    const secretKey = this.configService.get<string>('qiniu.secretKey', '');

    this.mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    this.config = new qiniu.conf.Config();
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.config);
    this.bucket = this.configService.get<string>('qiniu.bucket', '');
    this.domain = this.configService.get<string>('qiniu.domain', '');
  }

  /**
   * 获取上传 Token（用于 App 直传）
   * Token 有效期 1 小时
   */
  getUploadToken(key?: string): string {
    const scope = key ? `${this.bucket}:${key}` : this.bucket;
    const putPolicy = new qiniu.rs.PutPolicy({ scope, expires: 3600 });
    return putPolicy.uploadToken(this.mac);
  }

  /**
   * 上传 Buffer 到七牛云
   * @param key - 文件唯一标识
   * @param buffer - 文件内容
   */
  async uploadBuffer(key: string, buffer: Buffer): Promise<{ key: string }> {
    const uploadToken = this.getUploadToken(key);
    const formUploader = new qiniu.form_up.FormUploader(this.config);
    const putExtra = new qiniu.form_up.PutExtra();

    return new Promise((resolve, reject) => {
      // 使用 putStream 上传 Buffer
      const readable = require('stream').Readable.from(buffer);
      formUploader.putStream(uploadToken, key, readable, putExtra, (err, body, info) => {
        if (err) {
          reject(err);
        } else if (info.statusCode === 200) {
          resolve({ key: body.key });
        } else {
          reject(new Error(`Upload failed: ${info.statusCode} ${JSON.stringify(body)}`));
        }
      });
    });
  }

  /**
   * 上传文件到七牛云
   * @param file - @fastify/multipart 文件对象（toBuffer / mimetype / filename）
   * @returns 上传结果（含 key、url、mimeType、size）
   */
  async uploadFile(file: {
    toBuffer: () => Promise<Buffer>;
    mimetype: string;
    filename: string;
  }): Promise<{ key: string; url: string; mimeType: string; size: number }> {
    const buffer = await file.toBuffer();
    const ext = file.filename.split('.').pop() || 'bin';
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await this.uploadBuffer(key, buffer);
    return {
      key,
      url: this.getPublicUrl(key),
      mimeType: file.mimetype,
      size: buffer.length,
    };
  }

  /**
   * 获取文件的公开访问 URL
   */
  getPublicUrl(key: string): string {
    if (!this.domain) return key;
    return `${this.domain}/${key}`;
  }

  /**
   * 删除七牛云上的文件
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const { resp } = await this.bucketManager.delete(this.bucket, key);
      return resp.statusCode === 200;
    } catch {
      return false;
    }
  }
}
