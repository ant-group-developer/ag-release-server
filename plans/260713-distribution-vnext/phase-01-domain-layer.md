# Phase 1 — Domain layer thuần (aggregate + port)

**Priority:** Cao (nền cho mọi phase sau) · **Status:** 🔜 Next (sẽ deep-dive) · **Chạy production:** không đụng luồng v3 đang chạy (code mới, chưa wire vào)

## Mục tiêu

Tách domain thuần: aggregate + value object + domain event + port interface. KHÔNG import NestJS/TypeORM/SFTP. Test được bằng unit test thuần, không cần hạ tầng thật.

## Scope (làm)

- Aggregate `Distribution` (state, invariant, transition methods trả về domain event).
- Aggregate/entity `ChannelDelivery`.
- Value object: `Upc`, `Isrc`, `PackagePath`, `RetryPolicy`, `ExecutionType`.
- Domain event: `Validated`, `IdsProvisioned`, `PackageBuilt`, `ChannelUploaded`, `ImportChecked`, `QaChecked`, `Exported`, `ChannelDone`, `ChannelIssues`, ...
- Port interface (chỉ chữ ký, chưa impl): `PackageBuilder`, `PackageUploader`, `IdentifierProvisioner`, `ImportChecker`, `QaChecker`, `Exporter`, `DeliveryStatusReader`.
- Unit test cho invariant + transition.

## Ngoài scope (không làm ở phase này)

- Không impl adapter (SFTP/CI/gRPC thật) → phase 4.
- Không nối BullMQ/XState → phase 2–3.
- Không schema DB / migration → phase 2 (repo) trở đi.

## Entry / Exit

- **Entry:** docs kiến trúc đã chốt (✅).
- **Exit:** domain compile được, unit test invariant + transition pass, port interface đủ để phase 2 dựng lên.

## Todo (thô — sẽ fill chi tiết khi deep-dive)

- [ ] Xác định thư mục domain (vd `src/distribution/domain/`), không phụ thuộc framework
- [ ] Value objects + validate trong constructor
- [ ] Domain events (đặt tên theo ubiquitous language)
- [ ] Aggregate `Distribution`: state field + transition methods + invariant guard
- [ ] Entity `ChannelDelivery`: channel-level state
- [ ] Port interfaces
- [ ] Policy theo `ExecutionType` (bật/tắt bước) — mức interface
- [ ] Unit test: invalid transition bị chặn; transition hợp lệ phát đúng event

## Success criteria

- `tsc` sạch cho thư mục domain.
- Test: feed sequence event → assert state + event phát ra, không cần mock hạ tầng.
- Không một dòng import `@nestjs/*`, `typeorm`, `ssh2-*` trong domain.

## Câu hỏi mở

- Đặt domain trong module `release-executions3` hiện tại hay module mới `distribution`? (nghiêng module mới để không lẫn v3)
