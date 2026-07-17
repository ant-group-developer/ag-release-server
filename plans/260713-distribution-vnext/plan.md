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
| 2 | BullMQ thay cron-poll + DB-queue | 🔵 Step 1+2+3 XONG (persistence + test-doubles) — đang Step 4+ | 3/7 step done · 125 test xanh | [phase-02](phase-02-bullmq-engine.md) |
| 3 | Timeline read-side + SSE (projection) | ⬜ Chưa | Skeleton (ranh giới P2/P3 chốt) | [phase-03](phase-03-outbox-timeline.md) |
| 4 | ACL adapter cho SFTP/CI/gRPC/email + test double | ⬜ Chưa | Skeleton | [phase-04](phase-04-integration-acl.md) |
| 5 | Bật lại REVIEW gate + resilience | ⬜ Chưa | Skeleton | [phase-05](phase-05-review-resilience.md) |
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

Phase 1 (domain) **ĐÃ EXECUTE XONG**: 48 file, 117 test xanh dưới `src/modules/distribution-orchestration/domain/`.

Phase 2 **Step 1 + Step 2 + Step 3 XONG** (2026-07-17):
- Step 1: WorkflowEnginePort + UnitOfWorkPort + InMemoryWorkflowAdapter + module scaffold.
- Step 2 (6 nhịp): 4 ORM entity + migration + `TypeOrmDistributionRepository` (load + saveWithOutbox với optimistic lock) + `TypeOrmUnitOfWork` + integration test với `testcontainers` Postgres.
- Step 3: 9 test-double in-memory cho 9 domain port (`infrastructure/test-doubles/`) — mỗi double giữ idempotency contract của port (key/releaseId/trackId → không tạo mới khi gọi lại).
- Test: **125/125 xanh** (122 unit + 3 integration real DB, chưa thêm spec riêng test-double — exercise qua handler Step 4). Guard `no-framework-import` vẫn xanh. tsc sạch cho module.

**Bước kế: Phase 2 — Step 4+** (orchestrate handler + submit→validate chạy in-memory → step-runners → outbox relay → BullMQ thật). Chế độ: user chọn Claude code thẳng cho Step 3; hỏi lại chế độ khi vào Step 4.

**Quyết định nền đã chốt (dùng cho mọi phase sau):**
- Module `distribution-orchestration` (tách khỏi module `distribution` config + v3).
- State 2 tầng: milestone state + event timeline. Lỗi → `ACTION_REQUIRED`/`ISSUES` + ticket, KHÔNG revert DRAFT.
- Channel = **process-as-data** (`DeliveryProcess` per-DSP) + interpreter thuần; `ChannelState` chung nhỏ; topology chỉ metadata.
- TAKEDOWN(b) = aggregate mới; RETRY = mutate aggregate cũ. Poison=3. Ticket riêng orchestration.
- **DI**: Symbol token (interface thuần, không abstract class).
- **Transaction**: `TxContext` expose `EntityManager` (chấp nhận coupling TypeORM ở application — team không có kịch bản đổi ORM).
- **Optlock**: raw UPDATE ... WHERE version=? + SET version+1 (không `@VersionColumn` — cần đọc `rowsAffected`).
- **ORM naming**: suffix `.orm-entity.ts` để tránh nhiễu với domain `.entity.ts`.
