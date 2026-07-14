# Prompt EXECUTE Phase 1 (chế độ HYBRID + học sâu)

> Dán khối dưới vào chat mới. Chế độ hybrid: tôi tự tay phần học-dày, Claude làm phần lặp + tutor.

---

```
Tôi execute Phase 1 (domain layer) của dự án rebuild luồng phát hành distribution — ag-release-server (NestJS 11 + TypeORM/Postgres + Redis + gRPC + SFTP + GCS/S3). Đặc tả đã xong và verify với code thật. Mục tiêu KÉP: vừa ra code đúng, vừa để TÔI hiểu sâu kiến trúc (đang nâng trình middle→senior).

CHẾ ĐỘ LÀM VIỆC = HYBRID (quan trọng):
- TÔI tự gõ các mảnh học-dày: aggregate Distribution, channel-interpreter, bảng transition, 1 value-object mẫu, 1 policy mẫu. Với các mảnh này: bạn CHỈ gợi ý + review, KHÔNG viết sẵn full file cho tôi.
- BẠN viết phần lặp lại: các VO còn lại, domain events, các policy còn lại, guard test, sau khi tôi đã tự làm 1 cái mẫu cùng loại.
- Xuyên suốt, bạn đóng vai TUTOR, ép tôi hiểu bằng 4 kỹ thuật:
  1) Predict-then-verify: trước khi chạy test, hỏi tôi đoán case nào pass/fail.
  2) Explain-back: sau mỗi file quan trọng, bảo tôi giải thích lại bằng lời; sửa chỗ tôi hiểu lệch.
  3) Break-it: gợi ý tôi thử phá 1 invariant để xem test có bắt không.
  4) Challenge-the-why: khi tôi hỏi "sao không làm X", giải thích đánh đổi (tư duy senior).

ĐỌC TRƯỚC (bắt buộc, đúng thứ tự):
1. plans/260713-distribution-vnext/phase-01-domain-layer.md — ĐẶC TẢ ĐẦY ĐỦ (state machine, VO, interpreter process-as-data, ports, policy, 18 invariant, Implementation Steps, Todo, mục "Đối chiếu code thật"). Nguồn chính.
2. plans/260713-distribution-vnext/plan.md — bối cảnh 6 phase
3. docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md — kiến trúc tổng quan (§4,5,7,9,10)
4. Đối chiếu (đọc, KHÔNG sửa): release-execution3.enum.ts; src/modules/dsp/entities/dsp.entity.ts (hasDeal:81); aggregator.entity.ts; dsp-routing.enum.ts

NHIỆM VỤ: Dịch đặc tả thành file .ts thật dưới src/modules/distribution-orchestration/domain/ + unit test, theo cây thư mục + 12 Implementation Steps + Todo trong phase-01.

RÀNG BUỘC BẤT DI:
- Domain THUẦN: KHÔNG import @nestjs/*, typeorm, ssh2-*, bullmq, xstate trong domain/. Có test guard no-framework-import.spec.ts.
- Chỉ tạo file mới trong distribution-orchestration/domain/. KHÔNG sửa code v3 / module khác.
- Mỗi file < 200 LOC. VO immutable + tự-validate. Interpreter thuần (state,event)→(state',events[]).
- ExecutionTypeEnum khớp CHÍNH XÁC v3 (migration). Test phủ INV-D1..D10 + INV-C1..C8.

QUY TRÌNH: theo Implementation Steps 1→12, LÀM TỪNG BƯỚC MỘT, dừng ở mỗi mốc để tôi tự làm phần của tôi / explain-back / predict test. ĐỪNG chạy một mạch hết 12 bước. Cuối cùng: `npx tsc --noEmit` sạch + `jest src/modules/distribution-orchestration` xanh.

BẮT ĐẦU: đọc 4 nhóm file, tóm tắt ngắn kế hoạch execute (thứ tự file + điểm rủi ro + chỉ rõ mảnh nào TÔI gõ / mảnh nào BẠN gõ), rồi bắt đầu Step 1. Quyết định đã chốt nằm cuối phase-01 — không hỏi lại.
```
