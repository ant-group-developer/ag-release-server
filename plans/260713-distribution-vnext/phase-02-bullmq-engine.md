# Phase 2 — BullMQ thay cron-poll + DB-queue tự viết

**Priority:** Cao · **Status:** ⬜ Chưa (skeleton) · **Chi tiết hoá sau khi phase 1 xong**

## Mục tiêu

Thay cơ chế cron-poll + DB-queue tự viết của v3 bằng BullMQ. Giữ nguyên nghiệp vụ, chỉ đổi cách điều phối. Đặt sau `WorkflowEnginePort` để sau này swap Temporal.

## Scope (thô)

- Cài BullMQ + wire Redis (đã có ioredis).
- Queue topology theo section 8: `dist.orchestrate`, `dist.provision-id`, `dist.build-package`, `dist.sftp-upload` (rate-limit per host), `dist.ci-import-check`, `dist.ci-qa-check`, `dist.export-batch`, `dist.status-sync`, `dist.dlq.*`.
- `WorkflowEnginePort` + `BullMqWorkflowAdapter`.
- XState machine (distribution + channel) tiêu thụ domain event từ phase 1.
- Delayed-job cho "chờ" (không sleep).

## Entry / Exit

- **Entry:** domain + port từ phase 1 ổn.
- **Exit:** một release INITIAL chạy end-to-end qua BullMQ (dùng adapter giả/in-memory cho external), state chảy đúng.

## Todo (thô)

- [ ] Cài + config BullMQ, khai báo queues
- [ ] WorkflowEnginePort + BullMqWorkflowAdapter
- [ ] XState machine distribution-level + channel-level
- [ ] Orchestrate worker: load state → feed event → transition
- [ ] Delayed-job pattern cho WAITING_*
- [ ] Retry/backoff + DLQ mỗi queue

## Câu hỏi mở

- Chạy song song v3 (feature flag) hay cắt over? → quyết khi tới migration.
