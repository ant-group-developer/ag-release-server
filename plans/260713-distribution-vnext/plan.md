# Distribution v-next — Implementation Plan (skeleton)

> Skeleton nhẹ, bám theo section 16 của `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md`.
> Phase 2–6 CHƯA chi tiết hoá — sẽ fill sau khi phase 1 (domain) dạy ta điều gì là thật.
> Nguyên tắc: mỗi phase **chạy được production**, không big-bang rewrite.

## Context

- Kiến trúc: `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md`
- Sơ đồ end-to-end: `docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md`
- Code hiện tại (v3): `docs/flow-release-submit-new/tong-quan-luong-phat-hanh-hien-tai.md`
- Engine: BullMQ Flows + XState, sau `WorkflowEnginePort` · State ở Postgres · SSE timeline

## Phases

| # | Phase | Trạng thái | Chi tiết | File |
|---|-------|-----------|----------|------|
| 0 | Đóng băng v3 + đặc tả (tài liệu này) | ✅ Done | — | (docs đã có) |
| 1 | Domain layer thuần (aggregate + port) | ✅ Đặc tả xong — sẵn sàng EXECUTE | Đầy đủ + chốt hết open Q | [phase-01](phase-01-domain-layer.md) |
| 2 | BullMQ thay cron-poll + DB-queue | ✅ Done | 7/7 step · 136+ test xanh | [phase-02](phase-02-bullmq-engine.md) |
| 3 | Timeline read-side + SSE (projection) | ✅ Done | 5/5 step · 30 test xanh | [phase-03](phase-03-outbox-timeline.md) |
| 4 | ACL adapter cho SFTP/CI/gRPC/email + test double | ✅ Done | Group A–E xong · 50 test (44 unit + 6 integration) | [phase-04](phase-04-integration-acl.md) |
| 5 | Khép vòng lặp Worker + REVIEW gate + resilience | ⬜ Chưa | Chi tiết hoá xong (5 khối A–E) | [phase-05](phase-05-review-resilience.md) |
| 6 | (tùy chọn) WorkflowEnginePort → Temporal | ⬜ Optional | Skeleton | [phase-06](phase-06-temporal-optional.md) |

## Dependencies

```text
Phase 1 (domain) ──▶ Phase 2 (engine + write-side) ──▶ Phase 3 (timeline read-side/SSE)
                          │                      │
                          ▼                      ▼
                     Phase 4 (ACL) ──────▶ Phase 5 (review/resilience)
                                                 │
                                                 ▼
                                          Phase 6 (Temporal, optional)
```

- Phase 1 là nền: aggregate + event + port signatures. Mọi phase sau dựng trên đây.
- Phase 4 (ACL) có thể chạy song song với 2–3 vì chỉ là bọc adapter sau port đã định ở phase 1.
- Migration state v3 → v-next: xen giữa phase 2–3 (cần state machine + schema đã ổn). Tách sub-plan riêng khi tới.

## Next action

**Phase 1–4 ĐÃ HOÀN THÀNH.** Bước kế: **Phase 5** (REVIEW gate + resilience) hoặc **UI** (dùng Timeline API + SSE đã có từ Phase 3).

### Tóm tắt hoàn thành

- **Phase 1** (domain): 48 file, 117 test xanh.
- **Phase 2** (engine): 7/7 step, 136+ test xanh (128 unit + 3 integration real DB + step-runners + BullMQ).
- **Phase 3** (timeline/SSE): 5/5 step, 30 test xanh. Timeline API, SSE streaming, CQRS projection, reconciliation, metrics.
- **Phase 4** (ACL adapters): Group A–E hoàn thành, 50 test (44 unit + 6 integration). 9 port → 9 real adapter + module wired đầy đủ.

### Phase 4 chi tiết (2026-07-21)

- Group A: 3 CI read adapter (CiImportAdapter, CiQaAdapter, CiDeliverDesireAdapter) + 6 file CI API services.
- Group B: PostgresTicketAdapter + migration + integration test (testcontainers).
- Group C: DdexXmlPackageBuilder + DdexDataMapper + ProcessCodeResolver (DDEX ERN XML + local filesystem + BucketService2).
- Group D: GrpcIdentifierAdapter (UPC/ISRC via gRPC) + SftpUploaderAdapter (SFTP/S3 upload via SftpConnectService).
- Group E: ExporterAdapter (CI_DEAL no-op + STATE51 email via Resend) + module wire đủ 9 port.

**Quyết định nền đã chốt (dùng cho mọi phase sau):**
- Module `distribution-orchestration` (tách khỏi module `distribution` config + v3).
- State 2 tầng: milestone state + event timeline. Lỗi → `ACTION_REQUIRED`/`ISSUES` + ticket, KHÔNG revert DRAFT.
- Channel = **process-as-data** (`DeliveryProcess` per-DSP) + interpreter thuần; `ChannelState` chung nhỏ; topology chỉ metadata.
- TAKEDOWN(b) = aggregate mới; RETRY = mutate aggregate cũ. Poison=3. Ticket riêng orchestration.
- **DI**: Symbol token (interface thuần, không abstract class).
- **Transaction**: `TxContext` expose `EntityManager` (chấp nhận coupling TypeORM ở application — team không có kịch bản đổi ORM).
- **Optlock**: raw UPDATE ... WHERE version=? + SET version+1 (không `@VersionColumn` — cần đọc `rowsAffected`).
- **ORM naming**: suffix `.orm-entity.ts` để tránh nhiễu với domain `.entity.ts`.
