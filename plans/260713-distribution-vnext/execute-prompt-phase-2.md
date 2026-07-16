# Prompt EXECUTE Phase 2 (BullMQ engine — chế độ TÔI TỰ CODE + Claude tutor)

> Dán khối dưới vào chat mới. Phase 2 skeleton còn thô → phải SPEC trước rồi mới EXECUTE.
> Nhánh git: `dev-duc-phase2-bullmq-engine` (đã tạo, nền là 15 commit Phase 1).

---

```
Tôi execute Phase 2 (BullMQ orchestration engine) của dự án rebuild luồng phát hành distribution — ag-release-server (NestJS 11 + TypeORM/Postgres + Redis/ioredis + gRPC + SFTP + GCS/S3). Phase 1 (domain layer thuần) ĐÃ XONG: 48 file, 117 test xanh, ở module src/modules/distribution-orchestration/domain/. Mục tiêu KÉP: vừa ra code đúng, vừa để TÔI hiểu sâu kiến trúc (đang nâng trình middle→senior).

BỐI CẢNH PHASE 1 (nền đã có, KHÔNG sửa trừ khi cần thiết):
- Domain thuần: aggregate `Distribution` (state machine milestone), entity `ChannelDelivery` + interpreter thuần (process-as-data), value objects, domain events (pullDomainEvents → outbox hook), 9 ports (chỉ chữ ký), 4 ExecutionPolicy.
- Domain KHÔNG import framework. Phase 2 là nơi "cắm điện" domain vào hạ tầng thật.
- Ports chờ adapter: Clock, IdentifierProvisioner, PackageBuilder, PackageUploader, IngestResultReader, QaChecker, Exporter, DeliveryStatusReader, TicketService.

CHẾ ĐỘ LÀM VIỆC = TÔI TỰ CODE TOÀN BỘ, BẠN LÀ TUTOR (quan trọng):
- TÔI tự gõ TẤT CẢ code Phase 2 — không có ngoại lệ. Bạn KHÔNG viết file .ts thật vào repo thay tôi.
- Vai trò của BẠN: gợi ý hướng làm, giải thích khái niệm, cung cấp CODE MẪU NHỎ (snippet minh hoạ trong câu trả lời để tôi tham khảo — KHÔNG ghi vào file dự án), review code tôi đã gõ, chỉ lỗi + đề xuất sửa. Tôi tự áp dụng.
- Khi tôi bí, đưa mẫu tối thiểu (skeleton/pseudo hoặc 1 hàm ngắn) đủ để tôi hiểu pattern, rồi để tôi tự viết bản thật. ĐỪNG viết sẵn cả file cho tôi chép.
- Ngoại lệ DUY NHẤT bạn được ghi file: cập nhật tài liệu spec/plan (phase-02, plan.md), và tạo file test CHỈ KHI tôi yêu cầu rõ. Code sản phẩm (.ts trong src/) là của TÔI.
- Xuyên suốt, bạn đóng vai TUTOR, ép tôi hiểu bằng 4 kỹ thuật:
  1) Predict-then-verify: trước khi chạy, hỏi tôi đoán luồng job/state nào chạy trước/sau.
  2) Explain-back: sau mỗi mảnh quan trọng, bảo tôi giải thích lại bằng lời; sửa chỗ hiểu lệch.
  3) Break-it: gợi ý tôi thử làm job fail/duplicate để xem idempotency + retry + DLQ có đúng không.
  4) Challenge-the-why: khi tôi hỏi "sao không làm X", giải thích đánh đổi (tư duy senior).

ĐỌC TRƯỚC (bắt buộc, đúng thứ tự):
1. plans/260713-distribution-vnext/phase-02-bullmq-engine.md — skeleton Phase 2 (CÒN THÔ — sẽ chi tiết hoá).
2. plans/260713-distribution-vnext/plan.md — bối cảnh 6 phase + dependency.
3. docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md — §6 (engine BullMQ+XState sau port), §8 (queue topology + outbox), §10 (reliability: idempotency/retry/DLQ/bulkhead), §11 (persistence: distribution/channel_delivery/distribution_event/outbox_event).
4. Đối chiếu code THẬT (đọc, KHÔNG sửa): cơ chế queue/cron của v3 (release-executions3) để hiểu cái đang thay; cách ioredis/BullMQ đã wire ở chỗ khác trong repo (nếu có); domain ports ở distribution-orchestration/domain/ports/.

GIAI ĐOẠN A — CHI TIẾT HOÁ SPEC (làm trước, giống "Giai đoạn 0" của Phase 1):
Skeleton Phase 2 chưa đủ để code. Trước khi viết .ts, cùng tôi chốt spec chi tiết trong phase-02-bullmq-engine.md:
- Queue topology cụ thể (tên queue, job payload, concurrency, rate-limit per host cho SFTP).
- WorkflowEnginePort: chữ ký gì (schedule step, delayed job cho WAITING, signal cho human-in-loop).
- Persistence: schema thật cho distribution / channel_delivery / distribution_event / outbox_event (TypeORM entity + migration). Map DistributionState/ChannelState/pos/retryCount → cột.
- Outbox relay: đọc pullDomainEvents() → ghi outbox trong CÙNG transaction → relay ra BullMQ.
- Orchestrate worker: load aggregate (rehydrate) → apply command/event → pull events → persist + outbox, tất cả idempotent.
- XState: có dùng thật hay để Phase sau? (spec §6 nói DeliveryProcess CHÍNH LÀ hình dạng machine — cân nhắc YAGNI).
- Adapter cho 9 port: Phase 2 dùng test double in-memory (theo Exit skeleton), adapter thật để Phase 4.
Chốt xong, ghi vào phase-02 (giống độ chi tiết phase-01) + cập nhật Todo. RỒI MỚI sang Giai đoạn B.

GIAI ĐOẠN B — EXECUTE theo Implementation Steps đã chốt, LÀM TỪNG BƯỚC MỘT, dừng ở mỗi mốc để tôi tự code / explain-back / predict. Bạn chỉ hướng dẫn + review, không ghi code sản phẩm thay tôi.

RÀNG BUỘC BẤT DI:
- KHÔNG phá domain thuần Phase 1: mọi thứ framework (bullmq, typeorm, @nestjs) nằm NGOÀI domain/ (ở application/ + infrastructure/ trong cùng module distribution-orchestration/). Guard test no-framework-import.spec.ts vẫn phải xanh.
- Idempotency-first: mọi job/command mang IdempotencyKey; chạy lại KHÔNG tạo side-effect kép (spec §10).
- Wait-bound không throughput-bound: "chờ" = delayed job / scheduledAt, KHÔNG sleep/block worker (spec §2).
- State ở Postgres, worker stateless (sống sót restart/deploy).
- Mỗi file < 200 LOC. Không big-bang: mỗi mốc chạy được + test được (dùng adapter in-memory, không cần Redis/DB thật cho unit test; integration test tách riêng nếu cần).
- Chạy song song v3 hay cắt over = để ngỏ tới migration; Phase 2 KHÔNG đụng luồng v3 đang chạy.

BẮT ĐẦU: đọc 4 nhóm file, tóm tắt skeleton hiện có + điểm chưa rõ, rồi đề xuất SPEC chi tiết Giai đoạn A (queue topology + port + schema + thứ tự Implementation Steps + mốc nào tôi cần tự code/review/test). Hỏi tôi chốt các quyết định mở (XState hay không, schema, feature-flag) TRƯỚC khi viết code. Đừng chạy một mạch sang code. Khi tới code, hãy đưa skeleton/snippet gợi ý để TÔI tự tạo file thật.
```
