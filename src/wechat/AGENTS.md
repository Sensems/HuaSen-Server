# src/wechat — 微信公众平台对接

## OVERVIEW
微信公众号服务器回调：Token 验证、消息 AES 解密、XML 解析、类型分发 → BullMQ 入队 → Worker 异步处理。

## STRUCTURE
```
wechat/
├── wechat.module.ts              # 注册 BullMQ 队列 + StorageModule
├── wechat.controller.ts          # /wechat/callback（GET 验证 / POST 接收，@Public）
├── wechat.service.ts             # 消息解密 → 去重检查 → 入队（< 100ms 返回）
├── wechat-access-token.service.ts # 获取 + 缓存 access_token（7000s）
├── types/wechat-message.types.ts  # 6 种消息类型接口定义
└── utils/
    ├── crypto.ts                  # SHA1 签名验证 + AES-256-CBC 解密
    └── xml-parser.ts              # XML → JSON 双向解析（xml2js）
```

## 消息处理链路
```
微信 POST → AES 解密 → XML 解析 → msgId 去重 → 入 BullMQ queue → 返回 success
                                                              ↓
                 Worker(wechat-message.processor.ts):
                   文本 → 直接创建 Note
                   多媒体 → 获取 access_token → 下载 → 上传七牛云 → 创建 Note
```

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 新增消息类型 | `types/wechat-message.types.ts` + `wechat.service.ts:buildJobData` |
| 接入新公众号 | `.env` → `WECHAT_TOKEN/APP_ID/APP_SECRET/ENCODING_AES_KEY` |
| 调试消息 | Worker 日志在 `wechat-message.processor.ts` |
| access_token 失效 | `wechat-access-token.service.ts` 自动刷新 |
| 多媒体处理失败 | Worker 会重试 3 次（指数退避），失败后仍创建笔记（无媒体） |

## CONVENTIONS
- `/wechat/*` 路径使用 `@Public()` + `@Controller()` 两级公开
- 回调必须返回纯文本 `success`，不能返回 JSON
- 消息去重用 `meta.wechat_msg_id` JSONB 路径 + DB 唯一索引
- Worker jobId 用微信 `MsgId` 保证幂等
