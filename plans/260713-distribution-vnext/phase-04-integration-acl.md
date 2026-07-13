# Phase 4 — ACL adapter cho SFTP/CI/gRPC/email + test double

**Priority:** Trung bình · **Status:** ⬜ Chưa (skeleton) · **Chi tiết hoá sau** · **Có thể song song phase 2–3**

## Mục tiêu

Impl các port (phase 1) bằng adapter thật, bọc Anti-Corruption Layer. Domain không đổi một dòng khi đổi hệ ngoài.

## Scope (thô)

Theo section 9 — mỗi port 1 adapter:
- `GrpcIdentifierAdapter` (gRPC UPC/ISRC)
- `DdexXmlPackageBuilder` (xmlbuilder2 + GCS/S3)
- `SftpUploaderAdapter` (ssh2-sftp-client)
- `CiImportAdapter`, `CiQaAdapter` (CI REST)
- `CiExportAdapter` / `State51EmailAdapter`
- `CiDeliverDesireAdapter`
- Test double in-memory cho tất cả port (dùng ở unit/integration test).

## Entry / Exit

- **Entry:** port interface ổn định (phase 1).
- **Exit:** adapter thật chạy được với hệ ngoài (staging); test double phủ đủ cho test không cần hạ tầng.

## Todo (thô)

- [ ] Reuse code SFTP/CI/gRPC hiện có, bọc lại sau port
- [ ] Timeout + retry mỗi external call
- [ ] Test double in-memory từng port
- [ ] Idempotency check trong adapter (đã làm chưa?)

## Câu hỏi mở

- Tái dùng bao nhiêu code integration v3 hiện tại? → khảo sát khi tới.
