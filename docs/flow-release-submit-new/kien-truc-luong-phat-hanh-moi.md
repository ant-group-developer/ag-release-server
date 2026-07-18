# Kiến trúc luồng phát hành mới — Distribution v-next (Architecture Overview)

> Tài liệu **kiến trúc tổng quan** (chưa phải plan triển khai). Mục tiêu: xây lại luồng
> phát hành bám theo quy trình chuẩn B1–B10 trong `docs/flow-release-submit-v2/Phát hành nhạc ...md`,
> áp dụng system design đúng chuẩn để vừa chạy production tốt vừa là "giáo trình" nâng trình middle → senior.
>
> Đối chiếu code hiện tại: xem `tong-quan-luong-phat-hanh-hien-tai.md` cùng thư mục.

## Quyết định đã chốt (2026-07-13)

| Chủ đề | Lựa chọn | Ảnh hưởng thiết kế |
|--------|----------|---------------------|
| **Orchestration engine** | **BullMQ Flows + XState**, đặt sau `WorkflowEnginePort` | Reuse Redis; state ở Postgres; đường nâng cấp Temporal để mở |
| **Phạm vi** | **Cả 4 loại execution ngay**: INITIAL_RELEASE, UPDATE, TAKEDOWN, RETRY | State machine + saga phải mô hình hoá cả 4 type từ đầu |
| **Realtime UI** | **SSE** (server đẩy 1 chiều timeline) | Cần endpoint stream + đọc từ `distribution_event` |
| **Multi-tenant fairness** | **Chưa cần** — queue dùng chung | Không tách queue theo tenant giai đoạn này; để ngỏ rate-limit sau |
| **Review gate** | **Cấu hình cấp tenant** (flag `requiresManualReview` trên tenant) | Bước `AWAITING_REVIEW` chỉ chèn khi tenant bật cờ; đọc từ context tenant |
| **Snapshot storage** | **jsonb trong Postgres** (chỉ metadata + con trỏ asset, không chứa file) | Atomic cùng transaction; query SQL trực tiếp; file vẫn ở GCS/S3 |
| **UPDATE semantics** | **Luôn chạy lại toàn bộ nhánh phân phối** (re-import CI + re-upload direct như Spotify) | Không diff field; UPDATE dùng lại đúng luồng như INITIAL, chỉ skip cấp UPC/ISRC (đã có) |
| **TAKEDOWN** | **DSP direct (Spotify...) chọn từng DSP; DSP qua CI gỡ cả cụm** | Channel machine tách nhánh: direct per-DSP, CI takedown theo nhóm aggregator |
| **RETRY** | **Chỉ admin** được retry nhánh lỗi | Endpoint retry gắn RBAC admin; giới hạn số lần chống poison loop |
| **Migration v3** | **Migrate state** execution đang chạy dở sang v-next | Cần bộ map state v3 → state machine mới; chạy 1 lần khi cắt over |

## Mục lục

1. [Bối cảnh & mục tiêu](#1-bối-cảnh--mục-tiêu)
2. [Đặc tính hệ thống — insight cốt lõi](#2-đặc-tính-hệ-thống--insight-cốt-lõi)
3. [Nguyên tắc thiết kế](#3-nguyên-tắc-thiết-kế)
4. [Kiến trúc tổng thể (Hexagonal)](#4-kiến-trúc-tổng-thể-hexagonal)
5. [Bounded contexts](#5-bounded-contexts)
6. [Quyết định lớn: Orchestration engine](#6-quyết-định-lớn-orchestration-engine)
7. [Distribution như một State Machine](#7-distribution-như-một-state-machine)
8. [Async & messaging topology](#8-async--messaging-topology)
9. [Integration layer (Anti-Corruption)](#9-integration-layer-anti-corruption)
10. [Reliability patterns](#10-reliability-patterns)
11. [Data & persistence](#11-data--persistence)
12. [Observability](#12-observability)
13. [Bảo mật](#13-bảo-mật)
14. [Khả năng mở rộng](#14-khả-năng-mở-rộng)
15. [Bản đồ học tập middle → senior](#15-bản-đồ-học-tập-middle--senior)
16. [Lộ trình tiến hóa từ v3](#16-lộ-trình-tiến-hóa-từ-v3)
17. [Câu hỏi mở](#17-câu-hỏi-mở)

---

## 1. Bối cảnh & mục tiêu

Quy trình chuẩn (B1–B10): nhập thông tin → submit → validate → (review thủ công theo tenant) →
tạo package UPC/ISRC + DDEX XML → upload SFTP (direct DSP / aggregator CI / State51) →
check CI import batch → check QA flags → export CI + email State51 → sync trạng thái DSP về hệ thống.

Mục tiêu phi chức năng (từ spec):
- Xử lý **100 release/ngày**, không block server.
- Toàn bộ bất đồng bộ; upload SFTP 2–10 phút/release; DSP duyệt 1–5 ngày.
- **Observability**: dev, kiểm duyệt viên, user đều theo dõi được tiến độ từng release, từng step.
- Retry từng nhánh, không phải chạy lại cả release.

Mục tiêu kiến trúc:
- Tách bạch **nghiệp vụ** (domain) khỏi **hạ tầng** (SFTP, CI API, email, queue) → dễ test, dễ thay thế.
- Luồng phát hành là **first-class citizen**: có state rõ ràng, có lịch sử, resume/retry được.
- Là môi trường thực hành các pattern senior: DDD, hexagonal, saga/process-manager, outbox, idempotency, observability.

---

## 2. Đặc tính hệ thống — insight cốt lõi

> Đây là điều quyết định toàn bộ kiến trúc. Đọc kỹ trước khi chọn tech.

**Bài toán không phải throughput-bound, mà là wait-bound.**

- 100 release/ngày ≈ **1.2 release/phút** → CPU/DB gần như không phải vấn đề.
- Vấn đề thật: mỗi release đẻ ra nhiều nhánh **chờ rất lâu** (SFTP vài phút, CI import 1–5 phút, DSP duyệt **1–5 ngày**, admin review không xác định).
- Tại một thời điểm có thể có **hàng nghìn nhánh đang "treo" chờ** sự kiện bên ngoài.

Hệ quả thiết kế (nguyên tắc bất di bất dịch):

1. **Không giữ tài nguyên khi chờ.** Không có thread/worker/connection nào block chờ DSP. Chờ = ghi state + hẹn giờ (delayed job / scheduledAt) rồi nhả tài nguyên.
2. **State phải nằm ở DB, không nằm trong RAM.** Worker phải stateless để scale ngang và sống sót qua restart/deploy.
3. **Mọi bước phải idempotent.** Vì resume/retry/redeliver có thể chạy lại step bất kỳ lúc nào.
4. **Nút cổ chai thật là SFTP** (I/O, kết nối tới host bên thứ ba), không phải app. → cần bulkhead + rate-limit riêng cho SFTP.

---

## 3. Nguyên tắc thiết kế

| Nguyên tắc | Áp dụng cụ thể |
|-----------|----------------|
| **Domain-Driven Design** | Tách bounded context; Distribution là aggregate root có invariant; dùng ubiquitous language (Distribution, Channel, Package, Delivery). |
| **Hexagonal (Ports & Adapters)** | Domain không biết SFTP/CI/email là gì — chỉ biết port `PackageUploader`, `ImportChecker`... Adapter nằm ngoài. |
| **Explicit state machine** | Trạng thái release + channel là máy trạng thái tường minh, transition có luật, không phải if/else rải rác. |
| **Saga / Process Manager** | Luồng dài = chuỗi bước bù trừ (compensating). Mỗi bước phát event, process manager quyết định bước kế. |
| **Event-driven + Outbox** | State đổi → ghi domain event trong cùng transaction (outbox) → relay ra queue. Không mất transition. |
| **Idempotency-first** | Mỗi command mang `idempotencyKey`; mỗi external side-effect check "đã làm chưa". |
| **CQRS-lite** | Ghi (command → aggregate) tách khỏi đọc (timeline/dashboard đọc từ projection, không đọc trực tiếp aggregate nặng). |
| **12-Factor** | Config qua env/secret manager; log ra stdout; stateless process; backing services (Redis/PG) là resource. |

---

## 4. Kiến trúc tổng thể (Hexagonal)

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         INBOUND ADAPTERS                               │
│   REST (submit, retry, review)   ·   WS/SSE (live timeline)            │
│   Cron/Scheduler (resume timers) ·   Queue consumers (workers)         │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  (commands / queries)
┌───────────────────────────▼──────────────────────────────────────────┐
│                        APPLICATION LAYER                               │
│   Command handlers · Query handlers · Distribution Process Manager     │
│   (điều phối saga, không chứa business rule chi tiết)                  │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  (gọi domain qua interface/port)
┌───────────────────────────▼──────────────────────────────────────────┐
│                          DOMAIN LAYER                                  │
│   Aggregates: Distribution, ChannelDelivery                           │
│   Value objects: Upc, Isrc, PackagePath, RetryPolicy                  │
│   Domain events · State machine · Invariants · Ports (interfaces)      │
│              (KHÔNG import NestJS/TypeORM/SFTP ở đây)                  │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  (implement ports)
┌───────────────────────────▼──────────────────────────────────────────┐
│                       OUTBOUND ADAPTERS                                │
│  Postgres repo (TypeORM) · Redis queue · SFTP client · CI API client  │
│  gRPC UPC/ISRC · Email (Resend) · GCS/S3 · Outbox relay               │
│         → mỗi external system bọc trong Anti-Corruption Layer          │
└──────────────────────────────────────────────────────────────────────┘
```

Ý nghĩa: business rule "release chỉ export khi import OK **và** QA sạch" nằm ở **domain**,
test được bằng unit test thuần (không cần SFTP/CI thật). Việc "upload thế nào" là adapter, thay được.

---

## 5. Bounded contexts

Tách theo trách nhiệm nghiệp vụ, không theo table:

```text
┌─────────────────────┐   snapshot    ┌──────────────────────────┐
│ Release Authoring   │ ────────────▶ │ Distribution Orchestration│  ◀── context lõi
│ (metadata, track,   │  (immutable)  │  (process manager / saga) │
│  cover, audio)      │               └───────────┬──────────────┘
└─────────────────────┘                           │ điều phối
                                                    ▼
        ┌───────────────┬───────────────┬───────────────┬──────────────┐
        ▼               ▼               ▼               ▼              ▼
┌──────────────┐ ┌────────────┐ ┌─────────────┐ ┌────────────┐ ┌──────────────┐
│ Identifier   │ │ Package    │ │ Channel     │ │ Review     │ │ Delivery     │
│ Provisioning │ │ Building   │ │ Delivery    │ │ (kiểm duyệt│ │ Status Sync  │
│ (UPC/ISRC    │ │ (DDEX XML, │ │ (Direct DSP,│ │  thủ công) │ │ (đọc CI →    │
│  qua gRPC)   │ │  folder)   │ │  CI, State51)│ │            │ │  release_dsp)│
└──────────────┘ └────────────┘ └─────────────┘ └────────────┘ └──────────────┘
                                                    ▲
                                          ┌─────────┴──────────┐
                                          │ Observability /    │
                                          │ Timeline (read side)│
                                          └────────────────────┘
```

| Context | Trách nhiệm | Ghi chú |
|---------|-------------|---------|
| **Release Authoring** | Sở hữu dữ liệu release gốc; sinh **snapshot bất biến** khi submit | Đã có phần lớn trong code hiện tại |
| **Distribution Orchestration** | Điều phối toàn bộ luồng B1–B10; giữ state máy trạng thái; quyết định bước kế | **Context lõi cần xây mới** |
| **Identifier Provisioning** | Cấp UPC/ISRC qua gRPC, idempotent | Bọc ACL quanh gRPC server |
| **Package Building** | Sinh DDEX XML + cấu trúc thư mục `YYYYMMDDHHmmssSSS` | Không đổi thứ tự audio sau submit |
| **Channel Delivery** | Mỗi loại kênh (direct/CI/State51) là 1 strategy với sub-state riêng | Adapter theo DSP |
| **Review** | Gate kiểm duyệt thủ công theo rule tenant; approve/reject → resume | Chỉ tenant thuộc diện review |
| **Delivery Status Sync** | Poll CI `deliver_desire`, reconcile về `release_dsp_delivery` | Read-mostly, chạy nền |
| **Observability/Timeline** | Projection từ event → timeline mỗi release cho UI | CQRS read side |

**Snapshot bất biến** là điểm mấu chốt: khi submit, chụp lại toàn bộ release thành 1 bản đóng băng.
Mọi bước sau chạy trên snapshot → user sửa release gốc không phá luồng đang chạy; audit chuẩn.

---

## 6. Quyết định lớn: Orchestration engine

Đây là quyết định kiến trúc quan trọng nhất. So sánh 3 hướng:

| Tiêu chí | A. Hardening engine v3 (tự viết) | B. BullMQ Flows + XState | C. Temporal |
|----------|----------------------------------|--------------------------|-------------|
| Reuse stack hiện tại | ✅ hoàn toàn | ✅ (Redis đã có) | ❌ thêm hạ tầng (server + worker) |
| Độ chín / battle-tested | ❌ tự bảo trì | ✅ phổ biến | ✅✅ chuẩn công nghiệp durable execution |
| Durable timer (chờ nhiều ngày) | tự làm bằng cron + scheduledAt | delayed jobs (ổn) | ✅ native, chính xác |
| Retry/backoff/DLQ | tự code | ✅ built-in | ✅ built-in + versioning workflow |
| Human-in-the-loop (review, admin export) | tự code (WAITING_ACTION) | signal qua queue/DB | ✅ Signals native |
| Chi phí học | thấp (đã quen) | trung bình | cao (determinism, worker model) |
| Chi phí vận hành | thấp | thấp | cao (chạy Temporal cluster) |
| Giá trị nâng trình | trung bình | **cao** (queue theory, state machine, DAG) | **rất cao** (senior distributed systems) |

**✅ ĐÃ CHỐT: Hướng B (BullMQ Flows + XState) làm chính, thiết kế engine sau một PORT để có thể lên Temporal sau.**

Lý do:
- Reuse Redis + pattern queue team đã quen → rủi ro vận hành thấp, ship được ngay.
- BullMQ cho sẵn thứ engine v3 đang tự code tay: retry/backoff, delayed job (chờ), rate limit, DLQ, flow cha-con (DAG) → **học đúng các khái niệm senior mà không phải reinvent**.
- XState mô hình hoá state machine tường minh, visualize được, test được thuần → nâng tư duy thiết kế trạng thái.
- Điểm senior nhất: **đặt orchestration sau một interface** (`WorkflowEngine` port). Domain/process-manager không phụ thuộc BullMQ. Khi khối lượng/độ phức tạp tăng, swap sang Temporal chỉ là thay adapter — không đụng business.

```text
Application ──▶ WorkflowEnginePort (interface)
                     ├── BullMqWorkflowAdapter   (chọn bây giờ)
                     └── TemporalWorkflowAdapter  (đường nâng cấp tương lai)
```

> Nguyên tắc: **engine là chi tiết triển khai, không phải trung tâm kiến trúc.** Trung tâm là domain + state machine.

---

## 7. Distribution như một State Machine

### 7.1. Máy trạng thái cấp Distribution (release-level)

```text
        submit
DRAFT ──────────▶ VALIDATING
                    │ pass                         fail
                    ▼                                └─────▶ REJECTED ──▶ (user sửa) ──▶ DRAFT
              [tenant cần review?]
             yes │            │ no
                 ▼            │
        AWAITING_REVIEW       │
          approve │  reject   │
                 ▼    └──▶ REJECTED
                 └────────────┤
                              ▼
                      PROVISIONING_IDS  (UPC/ISRC nếu thiếu)
                              ▼
                      BUILDING_PACKAGE  (DDEX XML + folder)
                              ▼
                        DISTRIBUTING  ──── fan-out các channel song song
                              │
              (tổng hợp trạng thái channel)
             ┌────────────────┼─────────────────┐
             ▼                ▼                  ▼
         DISTRIBUTED     PARTIAL_ISSUES       FAILED
        (tất cả done)   (một số channel lỗi) (không channel nào done)
             │
          takedown
             ▼
         TAKEN_DOWN
```

### 7.2. Máy trạng thái cấp Channel (per-DSP / per-aggregator)

Direct DSP (vd Spotify, Vevo):
```text
PENDING ▶ BUILDING ▶ UPLOADING ─(retry ≤3)─▶ UPLOADED ▶ WAITING_PARTNER ▶ SYNCING ▶ DONE
                        │ fail sau 3 lần                                          │
                        └──────────────▶ ISSUES ◀──────────────────────────────┘ (nếu partner báo fail)
```

CI aggregator:
```text
PENDING ▶ BUILDING ▶ UPLOADING ▶ FOLDER_DONE ▶ WAITING_IMPORT
   ▶ CHECK_IMPORT ─(problem)─▶ ISSUES        (lưu lỗi, báo user)
        │ ok
        ▼
   CHECK_QA ─(còn flag open)─▶ ISSUES
        │ sạch
        ▼
   EXPORT  ─┬─ CI deal    ▶ WAITING_ADMIN_EXPORT ▶ (admin/CI tool) ▶ EXPORTED
            └─ State51    ▶ WAITING_EMAIL_BATCH  ▶ (batch gửi mail) ▶ EXPORTED
        ▼
   WAITING_DSP (1–5 ngày) ▶ SYNC_STATUS ▶ DONE
```

Ưu điểm state machine tường minh:
- Mỗi transition có **guard** (điều kiện) + **action** (side-effect qua port) → dễ đọc luật nghiệp vụ.
- Trạng thái "waiting" là hạng nhất → biết chính xác đang chờ ai, hẹn giờ resume.
- Retry = đưa 1 sub-machine về trạng thái trước đó, không đụng machine khác.
- Test bằng cách feed event, assert state — không cần hạ tầng thật.

### 7.3. Bốn loại execution (ĐÃ CHỐT: mô hình hoá cả 4 từ đầu)

`ExecutionType` quyết định **cây bước nào được sinh** và **channel machine đi hướng nào**. Cùng 1 khung state machine, khác input + khác vài transition:

| Type | Ý nghĩa | Khác biệt so với INITIAL |
|------|---------|---------------------------|
| **INITIAL_RELEASE** | Phát hành lần đầu | Cần cấp UPC/ISRC; import CI; QA; export; phân phối |
| **UPDATE** | Cập nhật metadata release đã live | UPC/ISRC đã có → skip provisioning; còn lại **chạy lại đúng như INITIAL**: re-import CI + re-QA + re-upload direct (Spotify...) |
| **TAKEDOWN** | Gỡ release khỏi DSP | Không build/upload mới; **direct: chọn từng DSP**, **CI: gỡ cả cụm**; chờ DSP/CI xác nhận; sync về `TAKEN_DOWN` |
| **RETRY** | Chạy lại nhánh lỗi | Không tạo distribution mới; **đưa các channel/step FAILED/ISSUES về trạng thái trước đó** rồi resume; nhánh DONE giữ nguyên |

Cách mô hình hoá để không phình code:

```text
1 khung state machine chung (distribution + channel)
        │
        ├── policy theo type quyết định:
        │     - có bước PROVISIONING_IDS không?      (INITIAL: có / UPDATE,TAKEDOWN: không)
        │     - có bước BUILD+UPLOAD không?          (TAKEDOWN: không)
        │     - có re-import CI không?               (UPDATE: có)
        │     - hướng cuối là DISTRIBUTED hay TAKEN_DOWN?
        │
        └── RETRY không phải type độc lập của "phát hành mới",
              mà là lệnh RESET một subtree của distribution đang tồn tại
              → reset channel/step FAILED,ISSUES về trạng thái trước → phát lại event
```

Điểm senior: **đừng viết 4 luồng song song**. Viết 1 state machine + một lớp **policy/strategy theo type** (guard bật/tắt từng bước). Thêm type thứ 5 sau này = thêm 1 policy, không đụng khung.

---

## 8. Async & messaging topology

Dùng BullMQ, **mỗi loại công việc một queue riêng** (tách concern + tune concurrency + cô lập lỗi):

| Queue | Job | Concurrency | Lý do tách riêng |
|-------|-----|-------------|------------------|
| `dist.orchestrate` | tiến 1 bước process manager | trung bình | điều phối, nhẹ |
| `dist.provision-id` | cấp UPC/ISRC (gRPC) | thấp | phụ thuộc gRPC server ngoài |
| `dist.build-package` | sinh DDEX XML + folder | trung bình | CPU + disk |
| `dist.sftp-upload` | upload 1 package lên 1 host | **rate-limited per host** | **nút cổ chai — bulkhead** |
| `dist.ci-import-check` | poll CI import batch | thấp, có backoff | gọi CI API |
| `dist.ci-qa-check` | check QA flags | thấp | gọi CI API |
| `dist.export-batch` | gom UPC → export CI / email State51 | 1 (batch theo lịch) | gom batch, tránh spam |
| `dist.status-sync` | poll deliver_desire | thấp | reconcile nền |
| `dist.dlq.*` | dead-letter mỗi queue | — | job chết sau max-retry vào đây để soi |

Mô hình chờ dài (điểm quan trọng nhất):

```text
Cần chờ CI import ~5 phút:
  KHÔNG:  sleep(5*60*1000)              ← giữ worker, sai
  ĐÚNG:   queue.add('ci-import-check', data, { delay: 5*60*1000 })
          → worker nhả ra ngay, job tự sống lại sau 5 phút

Cần chờ DSP duyệt 1–5 ngày:
  → ghi channel = WAITING_DSP + scheduledAt
  → delayed job / cron reconcile định kỳ, không giữ gì cả
```

Outbox pattern (không mất event khi DB commit nhưng publish lỗi):

```text
Transaction {
   update aggregate state
   insert outbox_event   ← cùng 1 transaction
}
Outbox relay (poll/CDC) → publish vào BullMQ → mark event dispatched
```

---

## 9. Integration layer (Anti-Corruption)

Mỗi hệ thống ngoài bọc trong 1 adapter + interface, domain chỉ thấy interface:

| Port (domain thấy) | Adapter (triển khai) | Ngoài |
|--------------------|----------------------|-------|
| `IdentifierProvisioner` | `GrpcIdentifierAdapter` | gRPC server UPC/ISRC |
| `PackageBuilder` | `DdexXmlPackageBuilder` | xmlbuilder2 + GCS/S3 |
| `PackageUploader` | `SftpUploaderAdapter` | ssh2-sftp-client |
| `ImportChecker` | `CiImportAdapter` | CI REST `/imports/v1/...` |
| `QaChecker` | `CiQaAdapter` | CI REST `/releases/v2/.../qaflags` |
| `Exporter` | `CiExportAdapter` / `State51EmailAdapter` | export.antmusic.net / email |
| `DeliveryStatusReader` | `CiDeliverDesireAdapter` | CI REST `/exports/v1/.../deliver_desire` |
| `IdentifierProvisioner`... | test doubles | in-memory (cho unit test) |

Lợi ích: đổi aggregator (CI → aggregator khác) = viết adapter mới, domain **không đổi một dòng**.
Đây chính là chỗ dạy được **Dependency Inversion** và **ACL** thực chiến.

---

## 10. Reliability patterns

| Pattern | Vấn đề giải quyết | Áp dụng |
|---------|-------------------|---------|
| **Idempotency key** | Job chạy lại (redeliver/retry) không tạo side-effect kép | Mỗi command mang key; UPC/ISRC/upload check "đã làm chưa" trước khi làm |
| **Retry + exponential backoff** | Lỗi tạm thời (mạng, SFTP timeout) | BullMQ `attempts` + `backoff`; SFTP giữ luật ≤3 lần theo spec |
| **Dead Letter Queue** | Job chết hẳn cần con người xem | Sau max-retry → `dist.dlq.*`, có API/UI soi + requeue |
| **Bulkhead** | SFTP chậm không được làm nghẽn cả hệ | Pool + concurrency riêng cho SFTP per host, tách khỏi queue khác |
| **Circuit breaker** | CI/SFTP sập → ngừng đập, chờ hồi | Mở mạch khi lỗi liên tục, fail-fast, half-open thử lại |
| **Timeout + deadline** | Bước treo vô hạn | Mỗi external call có timeout; bước quá hạn → ISSUES + báo |
| **Compensating action** | Rollback bước đã chạy khi saga hỏng | vd đã upload nhưng import fail → đánh dấu, cho retry đúng nhánh |
| **Poison detection** | Cùng release lỗi lặp vô hạn | Đếm số lần fail, chặn auto-retry, chuyển review thủ công |

Luật retry SFTP (theo spec chuẩn): tối đa **3 lần**, vẫn fail → **skip release đó, xử lý release kế** (không block hàng đợi).

---

## 11. Data & persistence

Postgres (nguồn sự thật) + Redis (queue/cache) + GCS/S3 (file package) + ClickHouse (analytics, giữ nguyên).

Bảng chính (khái niệm, chưa phải schema cuối):

```text
distribution                 -- aggregate root: 1 lần submit
  id, release_id, snapshot_id, type(INITIAL/UPDATE/TAKEDOWN/RETRY)
  state, tenant_id, created_at, ...

release_snapshot             -- BẤT BIẾN, chụp lúc submit
  id, release_id, payload(jsonb), created_at

channel_delivery             -- 1 dòng / DSP (hoặc nhóm CI) trong 1 distribution
  id, distribution_id, dsp_code, channel_type(DIRECT/CI/STATE51)
  state, retry_count, scheduled_at, last_error, metadata(jsonb)

distribution_event           -- append-only, nguồn cho timeline + audit
  id, distribution_id, channel_id?, type, payload(jsonb), occurred_at

outbox_event                 -- reliable publish
  id, aggregate_id, type, payload, dispatched_at?

review                       -- gate kiểm duyệt thủ công
  id, distribution_id, reviewer_id?, status, note, decided_at

release_dsp_delivery         -- projection cho user (giữ, là read model)
  release_id, dsp_code, status, updated_at
```

Quyết định:
- **Event append-only** (`distribution_event`) là xương sống observability + audit. Không cần full event-sourcing, nhưng lưu event đủ để dựng lại timeline.
- **Snapshot jsonb**: linh hoạt, không phải migrate schema mỗi lần release form đổi.
- `release_dsp_delivery` là **read model** (projection), cập nhật từ event — đúng tinh thần CQRS-lite.

---

## 12. Observability

Mục tiêu spec: dev + kiểm duyệt viên + user đều theo dõi được. → 3 tầng:

**a) Logs — structured + correlation id**
- Mỗi distribution có `correlationId`, truyền xuyên qua queue (nhét vào job data), gắn vào mọi log line.
- Log ra JSON (pino) → tra được toàn bộ đời một release qua 1 id.

**b) Metrics — Prometheus**
```text
dist_state_total{state="DISTRIBUTING"}          gauge  -- bao nhiêu release ở mỗi state
dist_step_duration_seconds{step="sftp_upload"}  histogram
dist_sftp_retry_total                           counter
dist_ci_import_problem_total                    counter
queue_depth{queue="dist.sftp-upload"}           gauge  -- phát hiện nghẽn sớm
```

**c) Traces — OpenTelemetry**
- Span cha = 1 distribution; span con = mỗi bước (kể cả bước chạy ở worker khác).
- Nhét trace context vào job data → nối span xuyên biên giới queue → thấy đường đi async đầy đủ.

**d) Timeline API (cho UI) — dùng SSE (đã chốt)** — đọc từ `distribution_event`:
```text
GET /distributions/:id/timeline        -- snapshot lịch sử (đọc projection)
GET /distributions/:id/stream (SSE)    -- server đẩy 1 chiều mỗi event mới về UI
```
Vì sao SSE (không WS): luồng chỉ cần **server → client 1 chiều** (đẩy tiến độ), không cần client gửi ngược realtime.
SSE nhẹ hơn, chạy trên HTTP thường, tự reconnect, ít hạ tầng. Nguồn đẩy: outbox/event relay bắn ra event → gateway SSE forward theo `distributionId`.
User thấy: "Đang upload Spotify... Chờ CI import... QA còn 2 lỗi... Đã phân phối 5/8 DSP".

---

## 13. Bảo mật

- **Secret**: credential SFTP, OAuth token CI, khoá email → secret manager (không .env commit, không log giá trị).
- **Endpoint nội bộ** (export.antmusic.net automation): phải có auth (API key/mTLS), không để mở.
- **Snapshot chứa PII** (tên nghệ sĩ, email liên hệ) → cẩn trọng khi log/hiển thị, tuân RBAC sẵn có (`access-control`).
- **Idempotency key** đồng thời chống replay attack ở API submit.
- **Least privilege** cho service account GCS/S3, tách bucket public/protected (đã có).
- **Audit**: `distribution_event` + `review` cho biết ai duyệt, khi nào, quyết định gì.

---

## 14. Khả năng mở rộng

- **Scale ngang**: worker stateless → thêm instance là tăng thông lượng; state ở PG/Redis.
- **Thêm aggregator mới** (ngoài CI): thêm bounded strategy + adapter + nhánh state machine, không sửa core.
- **Thêm bước mới** (vd `CHECK_METADATA_POLICY`): thêm state + transition + 1 handler; nhờ state machine tường minh nên không sợ vỡ luồng.
- **Đổi engine**: BullMQ → Temporal qua `WorkflowEnginePort`.
- **Batch/scheduling**: export gom theo lịch cấu hình (gom cả ngày, gửi 1 lần) — tách khỏi luồng chính.

---

## 15. Bản đồ học tập middle → senior

Kiến trúc này cố tình "gài" các chủ đề để bạn thực hành theo thứ tự tăng dần:

| Cấp | Chủ đề | Thực hành trong dự án này |
|-----|--------|---------------------------|
| Middle | **Queue & worker** | BullMQ: producer/consumer, concurrency, delay, backoff, DLQ |
| Middle | **Idempotency** | Thiết kế command có key; check side-effect trước khi làm |
| Middle | **State machine** | XState mô hình channel/distribution; guard + action |
| Middle→Senior | **Hexagonal / Ports & Adapters** | Tách domain khỏi SFTP/CI; test domain không cần hạ tầng |
| Middle→Senior | **DDD tactical** | Aggregate, value object, domain event, bounded context |
| Senior | **Saga / Process Manager** | Điều phối bước dài + compensating action |
| Senior | **Outbox / reliable messaging** | Không mất event giữa DB commit và publish |
| Senior | **Observability 3 trụ** | Log correlation + metrics + trace xuyên async |
| Senior | **Resilience** | Bulkhead, circuit breaker, timeout, poison detection |
| Senior | **CQRS-lite + projection** | Read model timeline tách khỏi write aggregate |
| Senior+ | **Durable execution** | (nâng cấp) chuyển sang Temporal, hiểu determinism |

Gợi ý cách học: mỗi pattern làm 1 nhánh nhỏ chạy được trước, đọc lại "tại sao", rồi mới mở rộng.
Đừng làm hết một lúc — kiến trúc cho phép làm tăng dần.

---

## 16. Lộ trình tiến hóa từ v3

Không đập đi xây lại. v3 đã có ý tưởng đúng (cây step, resume, retry nhánh, snapshot). Tiến hoá:

```text
Giai đoạn 0  Đóng băng v3, viết đặc tả state machine + bounded context (tài liệu này)
Giai đoạn 1  Tách domain layer thuần (Distribution/Channel + port) — không đụng hạ tầng
Giai đoạn 2  Đưa BullMQ thay cron-poll + DB-queue tự viết; giữ nguyên nghiệp vụ
Giai đoạn 3  Thêm outbox + distribution_event + timeline API (observability)
Giai đoạn 4  Bọc ACL cho SFTP/CI/gRPC/email sau port; viết test double
Giai đoạn 5  Bật lại REVIEW gate + resilience (bulkhead/circuit breaker)
Giai đoạn 6  (tùy chọn) WorkflowEnginePort → Temporal khi cần durable execution mạnh hơn
```

Nguyên tắc: mỗi giai đoạn **phải chạy được production**, không có "big bang rewrite".

---

## 17. Quyết định nghiệp vụ (đã chốt)

Toàn bộ câu hỏi mở đã được trả lời — xem bảng "Quyết định đã chốt" đầu tài liệu. Chi tiết triển khai:

1. **Review gate** → cờ **cấp tenant** (`requiresManualReview`). Builder chỉ chèn bước `AWAITING_REVIEW` (giữa `VALIDATING` và `PROVISIONING_IDS`) khi tenant bật cờ. Tenant không bật → bỏ qua hoàn toàn, không tạo review record.

2. **Snapshot** → **jsonb Postgres**. Snapshot chỉ chứa metadata + **con trỏ asset** (GCS/S3 path + checksum), không chứa file nhị phân. Payload vài chục KB → dưới ngưỡng jsonb thoải mái. Atomic cùng transaction với distribution. Chỉ externalize nếu tương lai payload > ~1MB (chưa cần — YAGNI).

3. **UPDATE** → **luôn chạy lại toàn bộ nhánh phân phối** (KISS, không diff field). UPDATE dùng lại đúng luồng INITIAL: re-import CI + re-QA + re-upload direct (Spotify...). Khác biệt duy nhất: skip cấp UPC/ISRC vì đã có. → không cần logic so sánh snapshot cũ/mới, không cần định nghĩa "tập field ảnh hưởng phân phối" → ít code, ít bug, dễ hiểu.

4. **TAKEDOWN** → phân nhánh theo loại kênh:
   - **DSP direct** (Spotify, Vevo...): user **chọn từng DSP** cần gỡ.
   - **DSP qua CI** (aggregator): **gỡ cả cụm** (không chọn lẻ, vì CI xử lý theo nhóm).
   - Channel machine đi hướng takedown: sinh lệnh gỡ → chờ DSP/CI xác nhận → sync `TAKEN_DOWN`.

5. **RETRY** → **chỉ admin**. Endpoint retry gắn RBAC admin (dùng `access-control` sẵn có). Retry = reset subtree FAILED/ISSUES về trạng thái trước rồi resume; nhánh DONE giữ nguyên. Có **giới hạn số lần retry** để chống poison loop (vượt ngưỡng → chuyển xử lý thủ công).

6. **Migration v3** → **migrate state**. Viết bộ map trạng thái v3 (`ReleaseExecutionStep3.status` + step type) → state machine v-next. Chạy 1 lần khi cắt over. Cần xử lý execution đang ở `WAITING_PARTNER`/`WAITING_ACTION` (đang chờ) — map sang trạng thái chờ tương ứng để không mất tiến độ. → cần **giai đoạn migration riêng** trong plan, có dry-run + rollback.

