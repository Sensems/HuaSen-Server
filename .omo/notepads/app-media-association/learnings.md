## 2026-07-04 - WeChat picUrl-only image fallback

### Problem
WechatMessageProcessor.processMedia() only created a NoteMedia record when mediaInfo was populated. mediaInfo is only set when both data.mediaId and accessToken exist AND the download from WeChat + Qiniu upload succeeds.

For image messages that arrive with only picUrl (no mediaId, or a download that fails), the note was created but no NoteMedia row was attached, so the media was unrecoverable from the data model.

### Fix
Added a second branch in the `media` nested create:

``````ts
...(mediaInfo ? { /* Qiniu-hosted branch - unchanged */ }
   : data.picUrl ? {
       media: {
         create: [{
           type: $Enums.MediaType.IMAGE,
           qiniuKey: data.picUrl,      // picUrl acts as the key (not Qiniu-hosted)
           qiniuUrl: data.picUrl,
           wxMediaId: data.mediaId || null,
           fileSize: 0,                // unknown
           mimeType: '',               // unknown
         }],
       },
     }
   : {}),
``````

### Decisions
- `qiniuKey` = `picUrl`: the `qiniuKey` column is `String` and not constrained to a Qiniu key shape, so using the WeChat `picUrl` as a sentinel value is acceptable. Downstream code that distinguishes Qiniu vs WeChat-hosted media should check by URL prefix or a separate flag before treating this as a real Qiniu key.
- `fileSize: 0` and `mimeType: ''`: explicitly unknown. Better than `null` for these fields (Prisma string/int columns + empty values render cleanly in clients).
- Voice/video/file without `mediaId` still produces no `NoteMedia` - acceptable per spec (no remote URL is available for those types).

### Verification
- `npx tsc --noEmit` - clean (exit 0).
- Behavior preserved for the `mediaInfo` path (Qiniu download/upload branch unchanged).

### Related
- `src/queue/processors/wechat-message.processor.ts` lines 153-175 (post-fix)
- `prisma/schema.prisma` - `NoteMedia.qiniuKey: String` (no format constraint)

## 2026-07-04 - NoteMediaItemDto for App create/update

### What
Added `NoteMediaItemDto` and a `media?: NoteMediaItemDto[]` field on `CreateNoteDto` / `UpdateNoteDto` so App clients can attach media to a note in the same request as the note itself (mirroring the WeChat path's nested `media.create`).

### Files
- `src/notes/dto/note-media-item.dto.ts` (new) - all six `NoteMedia` fields minus `id`/`noteId`/`createdAt` (server-generated). Required: `type` (MediaType enum), `qiniuKey`, `qiniuUrl`. Optional: `fileSize`, `mimeType`, `wxMediaId`.
- `src/notes/dto/create-note.dto.ts` - added `media?: NoteMediaItemDto[]` with `@IsArray` + `@ValidateNested({ each: true })` + `@Type(() => NoteMediaItemDto)` so class-validator/class-transformer instantiate each element.
- `src/notes/dto/update-note.dto.ts` - same field with the same decorators.
- `src/notes/dto/index.ts` - re-exported `NoteMediaItemDto`.

### Decisions
- Used `@ValidateNested` + `@Type` together: `@Type` is required for `class-transformer` to actually instantiate `NoteMediaItemDto` from the raw array; without it the nested validators no-op.
- Excluded `id`/`noteId`/`createdAt` from the DTO: those are server-generated and accepting them from the client would be a correctness bug (Prisma still ignores unknown fields, but accepting them is misleading for the API contract).
- Kept `qiniuKey`/`qiniuUrl` required even though Prisma columns are `String?` (nullable): when an App explicitly passes media, it must have already uploaded to Qiniu, so both should be present. The WeChat picUrl-fallback path uses service-level defaults, not the DTO.

### Verification
- DTO files themselves compile clean under `npx tsc --noEmit` (filter to `dto/note-media|create-note|update-note` returns no errors).
- Project-wide `npx tsc --noEmit` reports **1 blocking error** in `src/notes/notes.service.ts(163,7)` - see "Known issue" below.

### Known issue (BLOCKED by "do not modify service" rule)
The existing `update` method does `const { id, tagIds, ...data } = dto; return this.prisma.note.update({ data: { ...data, tags: ... } })`. The `...data` spread now includes `media: NoteMediaItemDto[] | undefined`, which is not a valid `Prisma.NoteUpdateInput` field, so the spread is rejected by Prisma's `Without<UncheckedUpdateInput, UpdateInput> & UpdateInput` intersection.

The `create` method is unaffected because it does not spread - it picks fields explicitly and `media` is simply ignored until a follow-up wires the nested `media.create`.

Fix requires touching the service (forbidden in this task). The minimal follow-up mirrors the `tagIds` pattern:

```ts
const { id, tagIds, media, ...data } = dto;
// ... existing tag handling ...
return this.prisma.note.update({
  where: { id },
  data: {
    ...data,
    tags: tagIds !== undefined
      ? { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) }
      : undefined,
    ...(media !== undefined && {
      media: { deleteMany: {}, create: media.map((m) => ({
        type: m.type as unknown as $Enums.MediaType,
        qiniuKey: m.qiniuKey,
        qiniuUrl: m.qiniuUrl,
        fileSize: m.fileSize ?? null,
        mimeType: m.mimeType ?? null,
        wxMediaId: m.wxMediaId ?? null,
      })) },
    }),
  },
  include: { ... },
});
```

### Related
- `src/notes/dto/note-media-item.dto.ts` (new)
- `src/notes/dto/{create,update}-note.dto.ts` (modified)
- `src/notes/notes.service.ts` lines 153-174 - requires follow-up
- `prisma/schema.prisma` - `NoteMedia` model fields

## 2026-07-04 - NotesService.create() / update() wire media array

### What
Closed the loop on the DTO change by wiring the `media?: NoteMediaItemDto[]` field through `NotesService.create()` and `NotesService.update()`. Clears the TS2322 error previously blocked on `src/notes/notes.service.ts(163,7)`.

### Changes
- `create()` (lines 92-121): added a `media` block alongside `tags`. `dto.media?.length ? { create: [...] } : undefined` — mirrors the `tagIds` pattern. Each item is mapped with `type: m.type as unknown as $Enums.MediaType` (existing codebase cast for the DTO `MediaType` → Prisma `$Enums.MediaType` gap), plus `qiniuKey`, `qiniuUrl`, and `fileSize/mimeType/wxMediaId` defaulting to `null` when absent.
- `update()` (lines 165-207):
  - Destructured `media` out of `dto`: `const { id, tagIds, media, ...data } = dto;` — this is the actual fix for the TS2322 error. The `...data` spread can no longer leak `media: NoteMediaItemDto[]` into `Prisma.NoteUpdateInput`.
  - Added `if (media !== undefined) { await this.prisma.noteMedia.deleteMany({ where: { noteId: id } }); }` mirroring the `tagIds` delete-then-recreate pattern.
  - Added a `media: media !== undefined ? { create: [...] } : undefined` block inside the `prisma.note.update()` data.
  - Kept the `include: { category, tags }` block intact.

### Decisions
- Chose the **separate `await deleteMany` + nested `create`** form over Prisma's inline `deleteMany: {}` shorthand: matches the existing `tagIds` handling in `update()` exactly, and keeps the conditional check (`if (media !== undefined)`) outside the Prisma call where the intent is most readable.
- `media !== undefined` is the right check (not `media?.length`): when the App sends `media: []` we want to **wipe all existing media**, not preserve them. Same semantic that `tagIds` already uses.
- For the `create` path, `dto.media?.length` is the right check: empty array means "no media", `undefined` means "field omitted". A missing field on create is a no-op, not a wipe.
- Did **not** refactor the `dto.source as unknown as $Enums.NoteSource` cast even though `src/notes/AGENTS.md` flags it as redundant (DTO already validates via `@IsEnum`). Out of scope: that pattern predates this task and changing it would touch unrelated working code.

### Verification
- `npx tsc --noEmit` - exit 0, zero errors.
- `findAll` / `findById` / `getMedia` / `createFromWechat` / status-machine methods (`publish`, `archive`, `softDelete`) untouched.
- Tag handling preserved: `update()` still does `deleteMany` then `create` for `NoteTag` and the `create()` method still picks `tagIds` explicitly.

### Related
- `src/notes/notes.service.ts` lines 92-121 (create), 165-207 (update)
- DTOs: `src/notes/dto/{note-media-item,create-note,update-note}.dto.ts`
- `prisma/schema.prisma` - `NoteMedia` model
