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
