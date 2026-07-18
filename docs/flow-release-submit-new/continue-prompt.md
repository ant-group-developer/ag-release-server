Tôi đang thiết kế lại luồng phát hành nhạc (distribution) cho dự án ag-release-server (NestJS 11 + TypeORM/Postgres + Redis + gRPC + SFTP + GCS/S3 + ClickHouse). Kiến trúc tổng quan đã chốt xong, giờ tôi
muốn tiếp tục.

Hãy đọc các file này trước để nắm context (theo đúng thứ tự):

1. docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md — kiến trúc tổng quan (17 section + bảng quyết định đã chốt)
2. docs/flow-release-submit-new/so-do-end-to-end-bullmq-xstate.md — sơ đồ end-to-end BullMQ+XState
3. docs/flow-release-submit-new/tong-quan-luong-phat-hanh-hien-tai.md — map code v3 hiện tại
4. plans/260713-distribution-vnext/plan.md — skeleton plan 6 phase
5. plans/260713-distribution-vnext/phase-01-domain-layer.md — phase kế tiếp

Tóm tắt quyết định đã chốt:

- Engine: BullMQ Flows + XState, đặt sau WorkflowEnginePort (đường nâng cấp Temporal để mở)
- Bài toán là WAIT-BOUND (chờ SFTP/CI/DSP lâu), không phải throughput-bound → không giữ tài nguyên khi chờ, state ở Postgres, worker stateless, mọi bước idempotent
- Kiến trúc: Hexagonal + DDD + state machine tường minh + saga/process-manager + outbox + CQRS-lite (timeline projection) + snapshot bất biến khi submit
- Realtime UI: SSE · Snapshot: jsonb Postgres (metadata + con trỏ asset, không chứa file)
- 4 execution type: INITIAL / UPDATE (= INITIAL nhưng skip cấp UPC/ISRC, luôn chạy lại toàn bộ, không diff field) / TAKEDOWN (direct chọn từng DSP, CI gỡ cả cụm) / RETRY (chỉ admin, reset subtree lỗi)
- Review gate theo cờ tenant requiresManualReview · Migration v3: migrate state

Việc kế tiếp: DEEP-DIVE PHASE 1 (domain layer thuần) — viết chi tiết aggregate Distribution + ChannelDelivery, value object (Upc/Isrc/PackagePath/RetryPolicy/ExecutionType), domain event, port interface (chỉ
chữ ký), policy theo ExecutionType. KHÔNG import NestJS/TypeORM/SFTP trong domain. Đây vẫn là thiết kế/đặc tả sát code, chưa wire vào project.

Câu hỏi mở cần chốt trước khi bắt đầu: domain đặt trong module release-executions3 hiện tại hay module mới "distribution"? (tôi nghiêng module mới để không lẫn v3).

Tuân thủ CLAUDE.md và .claude/rules/ của dự án. Bắt đầu bằng việc đọc 5 file trên rồi hỏi tôi chốt câu hỏi mở, sau đó deep-dive phase 1.
