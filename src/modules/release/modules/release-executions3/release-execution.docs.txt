/_ eslint-disable _/

release-execution3.builder.ts
→ build cây PENDING từ config
→ biết cấu trúc cây trông như thế nào
→ không chạy gì cả, chỉ tạo record trong DB

release-execution3.engine.ts
→ điều phối chạy cây: executeNode, runStep
→ xử lý sequential / parallel
→ xử lý fail: stop_all / isolate
→ xử lý retry tự động
→ sau mỗi step xong: gọi rollupStatus

release-execution3.service.ts
→ CRUD execution record trong DB
→ cập nhật status, lưu output, ghi log
→ được gọi bởi engine, không chứa logic chạy

release-execution3.worker.ts
→ nhận job từ BullMQ
→ gọi engine tương ứng
→ không chứa logic gì khác

luồng demo
HTTP POST /deliveries/:id/submit
→ delivery.service.submit()
→ builder.build(deliveryId) // tạo cây PENDING vào DB
→ queue.runPipeline(deliveryId) // đẩy job
→ return 202

        ↓ async

BullMQ worker.process('run_pipeline')
→ engine.run(deliveryId)
→ service.getTree(deliveryId) // load cây từ DB
→ executeNode(rootNode)
→ runStep(step)
→ service.setStatus(RUNNING)
→ handler.execute(input)
→ service.setStatus(SUCCESS), saveOutput
→ service.rollupStatus(parentId)
→ delivery.service.rollupDeliveryStatus()
→ release.service.rollupReleaseStatus()

nghiệp vụ step

1. Trạng thái của node
   NEW WAITING DONE FAILED WAITING_ACTION SKIPPED CANCELLED PARTIAL_DONE

2. Chế độ chạy children
   Flag đặt ở cha, áp dụng cho toàn bộ children:

sequential (mặc định): children chạy lần lượt, ảnh hưởng nhau
parallel: children chạy song song, độc lập nhau

Nếu cần mix, thêm node cha trung gian để group.

3. Rules — Sequential children
   Áp dụng đồng nhất mọi độ sâu, bubble up theo đệ quy.
   "Anh em sau" = siblings chưa chạy (NEW/WAITING) có index lớn hơn node hiện tại.
   Status nodeChaAnh em sauChạy tiếpDONEkhông ảnh hưởngkhông ảnh hưởngchạy tiếpFAILED→ FAILED→ FAILEDdừngWAITING_ACTIONkhông ảnh hưởngchờ, không SKIPPEDdừng chờSKIPPEDderive lạikhông ảnh hưởng—CANCELLED→ CANCELLED→ CANCELLEDdừng

SKIPPED chỉ xảy ra khi cha bị CANCELLED, con đã DONE giữ nguyên
WAITING_ACTION block vĩnh viễn cho đến khi user action

4. Rules — Parallel children (derive cha)
   Trạng thái các childrenChaAll DONEDONEAny WAITING_ACTIONWAITING_ACTIONMix DONE + FAILEDPARTIAL_DONEMix DONE + CANCELLEDPARTIAL_DONEMix DONE + FAILED + CANCELLEDPARTIAL_DONEAll FAILEDFAILEDAll CANCELLEDCANCELLEDMix FAILED + CANCELLEDFAILED
   Priority: WAITING_ACTION > PARTIAL_DONE > FAILED > CANCELLED

5. Submit — Bước 1: Critical steps (sequential, blocking)
   Trạng thái critical stepsSubmitCó 1 critical FAILEDFAILED, dừng toàn câyCó 1 critical CANCELLEDCANCELLED, dừng toàn câyCritical WAITING_ACTIONblock vĩnh viễn chờAll critical DONEchạy tiếp dist branches

6. Submit — Bước 2: Dist branches (parallel)
   Dùng y hệt bảng Rules Parallel ở mục 4.

// nghiệp vụ status

export enum ReleaseExecutionStepStatus {
NEW = 'NEW',
PROCESSING = 'PROCESSING',
WAITING_ACTION = 'WAITING_ACTION',
WAITING_PARTNER = 'WAITING_PARTNER',
DONE = 'DONE',
FAILED = 'FAILED',
SKIPPED = 'SKIPPED',
CANCELLED = 'CANCELLED',
}

Status cha sẽ dựa vào những thằng con, gọi sau mỗi lần xử lý step con

WAITING_ACTION -> PROCESSING -> WAITING_PARTNER -> FAILED -> DONE -> SKIPPED -> CANCELLED

chỉ 1 vài thằng new -> new
Tất cả new -> new

1 thằng processing -> processing
chỉ 1 vài thằng processing -> proceesing
tất cả processing -> proceesing

1 thằng WAITING_ACTION -> WAITING_ACTION
chỉ 1 vài thằng WAITING_ACTION -> WAITING_ACTION
tất cả WAITING_ACTION -> WAITING_ACTION
