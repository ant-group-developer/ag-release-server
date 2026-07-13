# Phase 6 — (Optional) WorkflowEnginePort → Temporal

**Priority:** Thấp / tùy chọn · **Status:** ⬜ Optional · **Chỉ làm khi cần durable execution mạnh hơn**

## Mục tiêu

Khi khối lượng/độ phức tạp vượt ngưỡng BullMQ thoải mái, swap engine sang Temporal — chỉ thay adapter sau `WorkflowEnginePort`, không đụng domain/business.

## Điều kiện kích hoạt (làm khi nào)

- Chờ nhiều ngày cần durable timer chính xác hơn delayed-job.
- Cần versioning workflow / determinism mạnh.
- Human-in-the-loop nhiều, muốn Signals native.
- Vận hành đủ nguồn lực chạy Temporal cluster.

## Scope (thô)

- `TemporalWorkflowAdapter` implement `WorkflowEnginePort`.
- Map state machine hiện có sang Temporal workflow (giữ nguyên domain).
- Migrate dần hoặc chạy song song theo loại execution.

## Entry / Exit

- **Entry:** phase 1–5 ổn định, có lý do nghiệp vụ thật để lên Temporal.
- **Exit:** engine chạy trên Temporal, domain/business không đổi.

## Câu hỏi mở

- Có thật sự cần Temporal không, hay BullMQ đủ dài hạn? → đánh giá lại sau 6–12 tháng vận hành.
