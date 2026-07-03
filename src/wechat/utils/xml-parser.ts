import { parseStringPromise, Builder } from 'xml2js';

/**
 * 解析微信 XML 消息体为 JavaScript 对象
 * @param xml - XML 字符串
 * @returns 解析后的对象
 */
export async function parseWechatXml<T = Record<string, unknown>>(
  xml: string,
): Promise<T> {
  const result = await parseStringPromise(xml, {
    explicitArray: false,
    trim: true,
  });
  return result.xml as T;
}

/**
 * 构建微信回复 XML
 * Phase 2+ 预留，Phase 1 直接返回 success 纯文本
 * @param data - 回复数据
 * @returns XML 字符串
 */
export function buildReplyXml(data: Record<string, unknown>): string {
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    cdata: true,
  });
  return builder.buildObject({ xml: data });
}
