import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** 微信 AccessToken 响应 */
interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * 微信 AccessToken 管理服务
 * 获取并缓存 access_token（有效期 7200 秒，缓存 7000 秒提前刷新）
 */
@Injectable()
export class WechatAccessTokenService {
  private token: string | null = null;
  private expiresAt = 0;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取微信 access_token（自动缓存）
   */
  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) {
      return this.token;
    }

    const appId = this.configService.get<string>('wechat.appId', '');
    const appSecret = this.configService.get<string>('WECHAT_APP_SECRET', '');

    if (!appId || !appSecret) {
      console.warn('[WechatToken] WECHAT_APP_SECRET not configured');
      return '';
    }

    const url =
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

    const { data } = await axios.get<AccessTokenResponse>(url, { timeout: 10000 });

    if (!data.access_token) {
      throw new Error(`Failed to get access_token: ${JSON.stringify(data)}`);
    }

    this.token = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in - 200) * 1000; // 提前 200 秒刷新

    console.log('[WechatToken] AccessToken refreshed');
    return this.token!;
  }
}
