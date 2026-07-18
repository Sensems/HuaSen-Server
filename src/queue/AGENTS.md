# src/queue — 队列基础设施

## OVERVIEW
BullMQ + Redis 队列基础设施：全局连接配置、队列注册、导出 BullModule 供各模块注入。

## STRUCTURE
```
queue/
├── queue.module.ts                       # BullModule.forRootAsync + registerQueue
├── queue-admin.controller.ts             # 队列管理 REST API（GET /admin/queues）
├── queue-admin.service.ts                # 队列状态查询 + 操作（无外部依赖）
└── processors/
    └── wechat-message.processor.ts       # 微信消息 Worker（唯一 Processor）
```

## 消息处理链路
```
WechatService.handleMessage
  ↓
@InjectQueue('wechat-message') → job.add('process-wechat-message', data, { jobId: msgId })
  ↓
Redis queue → WorkerHost(WechatMessageProcessor).process(job)
  ↓
  text        → prisma.$transaction(note + Media(TEXT 占位) + noteMedia)
  image/voice/video/file → axios下载 → StorageService.uploadBuffer → prisma.$transaction(note+media+noteMedia)
```

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| 调整重试/退避策略 | `queue.module.ts` 的 `defaultJobOptions` |
| 新增队列 | `queue.module.ts` 再加 `BullModule.registerQueue`，并在使用模块注入 `@InjectQueue` |
| 调试 Worker 处理逻辑 | `processors/wechat-message.processor.ts` |
| 查看队列状态 | `GET /admin/queues` — 返回 counts / failedJobs / workers |
| 重试失败任务 | `POST /admin/queues/retry` |
| 生产者入队代码 | `wechat/wechat.service.ts:handleMessage` |

## CONVENTIONS
- QueueModule 仅负责 `forRootAsync`（连接）和 `registerQueue`（声明），不注册 Provider
- Processor 放在 `processors/` 目录，命名 `{队列名}.processor.ts`
- jobId 用业务唯一键（如微信 MsgId）保证幂等
- 失败重试 3 次，指数退避 5s 起步；成功自动清理，失败保留供排查

## ANTI-PATTERNS
- 不要在 QueueModule 里注册 Processor（Processor 属于业务模块，在对应 module 注册）
- 不要直接 `new BullMQ.Queue()`，始终用 `@InjectQueue` 注入
- 不要在 Worker 里做长耗时同步计算（会阻塞同一 Worker 的并发）
- 不要忽略 `removeOnFail: false` 的占用 — 失败任务积累过多需定期清理 Redis
