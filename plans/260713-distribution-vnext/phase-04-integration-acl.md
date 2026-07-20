# Phase 4 — ACL adapter cho SFTP/CI/gRPC/email + test double

**Priority:** Trung bình · **Status:** 🔶 Đang triển khai · **Group A+B done, C-E pending**

## Mục tiêu

Impl các port (phase 1) bằng adapter thật, bọc Anti-Corruption Layer. Domain không đổi một dòng khi đổi hệ ngoài.

## Scope

Theo section 9 — mỗi port 1 adapter:
- ✅ `CiImportAdapter`, `CiQaAdapter`, `CiDeliverDesireAdapter` (Group A — **NEW dedicated CI API services** trong `infrastructure/ci-api/`, KHÔNG dùng v3 service trực tiếp)
- ✅ `PostgresTicketAdapter` (Group B — own schema `orchestration_ticket`)
- ⬜ `DdexXmlPackageBuilder` (Group C — xmlbuilder2 + local filesystem)
- ⬜ `GrpcIdentifierAdapter` (Group D — gRPC UPC/ISRC)
- ⬜ `SftpUploaderAdapter` (Group D — ssh2-sftp-client)
- ⬜ `CiExportAdapter` / `State51EmailAdapter` (Group E)
- Test double in-memory cho tất cả port (dùng ở unit/integration test).

## Entry / Exit

- **Entry:** port interface ổn định (phase 1). Test double in-memory đã có sẵn từ Phase 2 (`infrastructure/test-doubles/`) — Phase 4 thay dần bằng adapter thật, giữ nguyên test double cho unit/integration test.
- **Exit:** adapter thật chạy được với hệ ngoài (staging); test double phủ đủ cho test không cần hạ tầng.

## Todo

- [x] Group A: 3 CI adapter + 6 file `infrastructure/ci-api/` (dedicated HTTP client, 30s timeout, auth)
- [x] Group B: PostgresTicketAdapter + migration + integration test
- [ ] Group C: DdexXmlPackageBuilder (DDEX generation + file I/O)
- [ ] Group D: GrpcIdentifierAdapter + SftpUploaderAdapter
- [ ] Group E: CiExportAdapter + State51EmailAdapter
- [ ] Timeout + retry mỗi external call
- [ ] Idempotency check trong adapter ("đã làm chưa?" — lớp 2 idempotency, xem Phase 2 guide §3)

## Câu hỏi mở

- 9 port đã cố định chữ ký ở Phase 1; adapter chỉ implement, KHÔNG đổi interface. Nếu cần đổi interface → quay lại domain (hiếm).
- Group C: snapshotId mapping, processCode resolution — xem plan Group C.

