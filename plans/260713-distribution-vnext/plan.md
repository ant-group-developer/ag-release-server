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
| 2 | BullMQ thay cron-poll + DB-queue | 🟡 Đặc tả xong — sẵn sàng EXECUTE | Đầy đủ + chốt 4 open Q | [phase-02](phase-02-bullmq-engine.md) |
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
Phase 2 **ĐÃ ĐẶC TẢ XONG** + chốt 4 open question (XState deferred · port+in-memory trước · polling relay · P2 write/P3 read). Xem `phase-02-bullmq-engine.md` (spec kỹ thuật) + `phase-02-guide-de-hieu.md` (hướng dẫn hiểu để tự code).
Bước kế: **EXECUTE Phase 2 — Step 1** (WorkflowEnginePort + UnitOfWorkPort + InMemoryWorkflowAdapter + module scaffold). Chế độ tutor: user tự code, Claude review.

**Quyết định nền đã chốt (dùng cho mọi phase sau):**
- Module `distribution-orchestration` (tách khỏi module `distribution` config + v3).
- State 2 tầng: milestone state + event timeline. Lỗi → `ACTION_REQUIRED`/`ISSUES` + ticket, KHÔNG revert DRAFT.
- Channel = **process-as-data** (`DeliveryProcess` per-DSP) + interpreter thuần; `ChannelState` chung nhỏ; topology chỉ metadata.
- TAKEDOWN(b) = aggregate mới; RETRY = mutate aggregate cũ. Poison=3. Ticket riêng orchestration.
