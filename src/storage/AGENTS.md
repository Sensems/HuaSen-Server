# src/storage — 存储模块

## OVERVIEW
七牛云对象存储集成：上传 Token 生成（App 直传）、Buffer 上传（服务端中转）、文件删除、公开 URL 生成。

## STRUCTURE
```
storage/
├── storage.module.ts
├── storage.controller.ts    # /storage/* 路由（全部 JWT）
├── storage.service.ts       # 七牛云 SDK 封装
└── dto/
    ├── upload-token-response.dto.ts
    ├── delete-file.dto.ts
    └── delete-file-response.dto.ts
```


## 七牛云 SDK 使用
- `qiniu.auth.digest.Mac` — AK/SK 签名
- `qiniu.rs.PutPolicy` — Token 生成（scope, expires: 3600s）
- `qiniu.form_up.FormUploader.putStream` — Buffer 上传
- `qiniu.rs.BucketManager.delete` — 文件删除

## WHERE TO LOOK
| 任务 | 位置 |
|------|------|
| App 直传 Token | `getUploadToken(key?)` — 有 key 则覆盖上传，无 key 自动生成 |
| 服务端 multipart 上传 | `POST /storage/upload` — 上传七牛并建 Media，写入 `originalFilename` |
| 服务端 Buffer 上传 | `uploadBuffer(key, buffer)` — 用于微信媒体下载后转存 |
| 公开访问 URL | `getPublicUrl(key)` — `domain/key` |
| 删除文件 | `deleteFile(key)` — 吞错返回 false |

## CONVENTIONS
- Token 有效期 1 小时（3600s）
- 上传用 `putStream` 而非 `putFile`（Buffer 来源，无需存临时文件）
- config 从 `ConfigService` 取 `qiniu.accessKey` / `qiniu.secretKey` / `qiniu.bucket` / `qiniu.domain`
- 缺 `domain` 时 `getPublicUrl` 直接返回 key

## ANTI-PATTERNS
- **不要混用 `require('stream')`** — 用 `import { Readable } from 'stream'`（全仓库统一 ESM）
- **不要静默吞错** — `deleteFile` 的 `catch { return false }` 应至少 log 错误原因再决定
- **不要用 `''` 默认 AK/SK** — 缺配置应 fail-fast，不传空字符串给七牛云 SDK
