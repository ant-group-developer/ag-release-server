# 🔄 Toàn cảnh luồng phát hành Release (Submit → Distribution)

Tài liệu phân tích toàn bộ luồng hoạt động sau khi submit một bản phát hành, bao gồm cả **client** và **server**.

---

## 1. Tổng quan kiến trúc

```mermaid
graph TB
    subgraph Client["🖥️ Client (Next.js)"]
        RS["Release Submits Page"]
        DJ["Distribution Jobs Page"]
        RSM["Release Submit Detail Modal"]
        DJM["Distribution Job Detail Modal"]
    end

    subgraph Server["⚙️ Server (NestJS — ag-release-server)"]
        RSC["ReleaseSubmitController"]
        DJCC["CiDistributionJobController"]
        RSS["ReleaseSubmitService2"]
        DJSS["CiDistributionJobService"]
        CRON1["CRON: handleScheduledSteps"]
        CRON2["CRON: handleDailySend"]
    end

    subgraph RPA["🤖 RPA Tool (NestJS — ag-release-tool-export :8888)"]
        RPAC["ExportController"]
        RPAS["ExportService (Puppeteer)"]
        OIPS["OpenimpService (Puppeteer)"]
        CFGS["ConfigFileService (AES-256)"]
        RPAD["Dashboard HTML"]
    end

    subgraph DB["💾 Database"]
        T1["release_submits"]
        T2["release_submit_steps"]
        T3["ci_distribution_jobs"]
        T4["release_dsp_deliveries"]
        T5["releases"]
        T6["jobs (RPA)"]
        T7["job_logs (RPA)"]
    end

    subgraph External["🌐 External Services"]
        CISITE["ci-support.com"]
        OIMP["auth.openimp.com"]
        EMAIL["Email Service (Resend)"]
    end

    RS -->|"GET /release-submits"| RSC
    RSM -->|"GET /release-submits/:id"| RSC
    RSM -->|"POST .../steps/:stepId/retry"| RSC
    DJ -->|"GET /ci-distribution-jobs/grouped"| DJCC
    DJM -->|"POST /auto-send-email"| DJCC
    DJM -->|"POST /download-excel"| DJCC
    DJM -->|"POST /confirm-completed"| DJCC
    DJM -->|"PUT /ci-distribution-jobs/:id"| DJCC

    RSC --> RSS
    DJCC --> DJSS

    RSS --> T1
    RSS --> T2
    RSS --> T4
    RSS --> T5
    DJSS --> T3
    DJSS -->|"autoSendEmail"| EMAIL

    CRON1 -->|"Every minute"| RSS
    CRON2 -->|"Config cron"| DJSS
    DJSS -->|"checkAndResumeStep"| RSS

    RPAC --> RPAS
    RPAC --> OIPS
    RPAC --> CFGS
    RPAS --> T6
    RPAS --> T7
    RPAS -->|"Puppeteer RPA"| CISITE
    OIPS -->|"Puppeteer RPA"| OIMP

    DJM -.->|"Admin tải Excel\ntừ server"| DJCC
    DJM -.->|"Admin upload Excel\nvào RPA Tool"| RPAC
```

---

## 2. Luồng Submit Release (Server-side Pipeline)

### 2.1. Khởi tạo Submit

Khi user bấm "Submit Release" trên client, request `POST /release-submits` được gửi:

```mermaid
sequenceDiagram
    participant U as User (Client)
    participant C as ReleaseSubmitController
    participant S as ReleaseSubmitService2
    participant DB as Database

    U->>C: POST /release-submits {releaseId, dspCodes}
    C->>S: submit({releaseId, dspCodes, type: INITIAL_RELEASE})
    
    Note over S: 1. Cancel submits cũ (NEW/PROCESSING/WAITING_ACTION)
    S->>DB: Update old submits → CANCELLED
    S->>DB: Update old steps → SKIPPED
    S->>DB: Update old CI jobs → SKIPPED
    
    Note over S: 2. Snapshot release data
    S->>DB: findOneReleaseFull(releaseId)
    
    Note over S: 3. Tạo ReleaseSubmit record (status = NEW)
    S->>DB: INSERT release_submits
    
    Note over S: 4. Cập nhật release status → PROCESSING
    S->>DB: UPDATE releases SET status = PROCESSING
    
    Note over S: 5. Mark DSP deliveries → PROCESSING
    S->>DB: UPSERT release_dsp_deliveries
    
    Note over S: 6. Fire-and-forget: processAsync()
    S-->>S: processAsync(submitId) [async, không chờ]
    
    S->>C: Return saved submit
    C->>U: Response 200 {data: submit}
```

### 2.2. Pipeline Processing (Async)

Sau khi trả response cho client, server bắt đầu xử lý bất đồng bộ:

```mermaid
graph TD
    PA["processAsync(submitId)"]
    BP["buildPipeline() — Phase 1: Tạo plan"]
    RP["runPipeline() — Phase 2: Thực thi"]
    
    PA --> BP
    BP --> RP
    
    subgraph BuildPipeline["buildPipeline: Tạo Steps"]
        S1["GEN_UPC (nếu chưa có UPC)"]
        S2["GEN_ISRCS → child GEN_ISRC per track"]
        S3["VALIDATE"]
        S4["PROCESS_DIRECT (1 per Direct DSP)"]
        S5["PROCESS_AGG_CI (1 cho tất cả CI DSPs)"]
    end
    
    BP --> S1
    BP --> S2
    BP --> S3
    BP --> S4
    BP --> S5
```

### 2.3. Cấu trúc Steps (Pipeline Tree)

```
ReleaseSubmit
├── GEN_UPC (parent, critical)
├── GEN_ISRCS (parent, critical)
│   ├── GEN_ISRC (child — track 1)
│   ├── GEN_ISRC (child — track 2)
│   └── ...
├── VALIDATE (parent, critical)
├── PROCESS_DIRECT — DSP "Apple Music" (parent, distribution)
│   ├── CREATE_AND_UPLOAD_DIRECT (child)
│   ├── WAIT_PARTNER_PROCESS (child — delay N phút)
│   └── SYNC_DATA_FROM_DSP (child)
├── PROCESS_DIRECT — DSP "Spotify" (parent, distribution)
│   ├── CREATE_AND_UPLOAD_DIRECT
│   ├── WAIT_PARTNER_PROCESS
│   └── SYNC_DATA_FROM_DSP
└── PROCESS_AGG_CI — CI Aggregator (parent, distribution)
    ├── CREATE_AND_UPLOAD_CI (child)
    ├── CREATE_FOLDER_DONE_CI (child)
    ├── WAIT_PARTNER_PROCESS (child — delay N phút)
    ├── VALIDATE_QA_CI (child)
    ├── EXPORT_CI (child — tạo CiDistributionJobs → WAITING_ACTION)
    ├── WAIT_PARTNER_PROCESS (child — delay 12h)
    └── SYNC_DATA_DSP_CI (child)
```

### 2.4. Luồng thực thi `runPipeline`

```mermaid
graph TD
    START["runPipeline(submitId)"]
    
    subgraph Phase1["Phase 1: Critical Steps (tuần tự, blocking)"]
        CS["GEN_UPC → GEN_ISRCS → VALIDATE"]
        CF{{"Step FAILED?"}}
        CS --> CF
        CF -- Yes --> SKIP["Skip remaining → Submit = FAILED"]
        CF -- No --> P2
    end
    
    subgraph Phase2["Phase 2: Distribution Steps (tuần tự, independent)"]
        P2["Chạy PROCESS_DIRECT / PROCESS_AGG_CI"]
        DS["Mỗi distribution step chạy children tuần tự"]
        WA{{"Step = WAITING_ACTION?"}}
        DS --> WA
        WA -- Yes --> PAUSE["Pipeline tạm dừng, chờ CRON resume"]
        WA -- No --> NEXT["Tiếp step kế"]
    end
    
    subgraph Phase3["Phase 3: Resolve Status"]
        RS["resolveSubmitStatus()"]
        DRS["deriveAndUpdateReleaseStatus()"]
        RS --> DRS
    end
    
    START --> CS
    P2 --> DS
    NEXT --> RS
    PAUSE --> |"CRON mỗi phút"| RESUME["resumeFromWaiting → runPipeline lại"]
```

---

## 3. Máy trạng thái (State Machine)

### 3.1. ReleaseSubmit Status

```mermaid
stateDiagram-v2
    [*] --> NEW: submit()
    NEW --> PROCESSING: buildPipeline()
    PROCESSING --> DONE: Tất cả distribution DONE
    PROCESSING --> FAILED: Critical step failed / Tất cả dist FAILED
    PROCESSING --> PARTIAL_DONE: Mix DONE + FAILED
    PROCESSING --> WAITING_ACTION: Có step WAITING_ACTION
    PROCESSING --> CANCELLED: Submit mới thay thế
    WAITING_ACTION --> PROCESSING: CRON resume / manual resume
    FAILED --> PROCESSING: retryStep()
```

### 3.2. SubmitStep Status

```mermaid
stateDiagram-v2
    [*] --> NEW: buildPipeline()
    NEW --> PROCESSING: runStep()
    PROCESSING --> DONE: Logic thành công
    PROCESSING --> FAILED: Exception / child failed
    PROCESSING --> WAITING_ACTION: WAIT_PARTNER_PROCESS / EXPORT_CI
    WAITING_ACTION --> PROCESSING: CRON claim
    WAITING_ACTION --> DONE: resumeFromWaiting()
    NEW --> SKIPPED: Parent failed / Submit cancelled
    FAILED --> NEW: retryStep()
```

### 3.3. CiDistributionJob Status

```mermaid
stateDiagram-v2
    [*] --> pending: createJob()
    pending --> processing: downloadExcel()
    pending --> completed: autoSendEmail()
    processing --> completed: confirmCompleted()
    pending --> skipped: Submit cancelled / User skip
    processing --> skipped: User skip
    pending --> failed: cancelJob()
```

### 3.4. Release Status (derived)

| Điều kiện DSP Deliveries | Release Status |
|---|---|
| Tất cả `DISTRIBUTED` | `DISTRIBUTED` |
| Tất cả `ISSUES` | `FAILED` |
| Có `PROCESSING` + submit `WAITING_ACTION` | `AWAITING_ACTION` |
| Có `PROCESSING` | `PROCESSING` |
| Mix `DISTRIBUTED` + `ISSUES` | `PARTIAL_DONE` |

---

## 4. CRON Jobs & Auto-resume

### 4.1. `handleScheduledSteps` — Mỗi phút

Tìm steps có `status = WAITING_ACTION` và `scheduledAt <= now` → atomic claim → `resumeFromWaiting()`.

> Dùng cho `WAIT_PARTNER_PROCESS` steps (delay N phút trước khi tiếp tục).

### 4.2. `handleDailySend` — Theo lịch config `partners.ci.dailySendCron`

Tự động gom tất cả pending `email_state51` jobs → tạo Excel → gửi email → mark completed → resume pipeline.

### 4.3. CI Job `checkAndResumeStep`

Sau mỗi lần complete job (`autoSendEmail` / `confirmCompleted`), check nếu **tất cả** jobs cùng stepId đã xong → `resumeFromWaiting()` để tiếp tục pipeline.

---

## 5. Luồng CI Distribution Jobs (EXPORT_CI)

```mermaid
sequenceDiagram
    participant Pipeline as Pipeline (runStep)
    participant CiService as CiDistributionJobService
    participant DB as Database
    participant Admin as Admin (Client)
    participant Email as Email Service (Resend)
    participant RPA as ag-release-tool-export (Puppeteer)
    participant CISITE as ci-support.com

    Note over Pipeline: Step EXPORT_CI bắt đầu
    
    Pipeline->>CiService: createJob(type: EMAIL_STATE51, ...)
    CiService->>DB: INSERT ci_distribution_jobs (status: pending)
    
    Pipeline->>CiService: createJob(type: ADMIN_EXPORT, ...)
    CiService->>DB: INSERT ci_distribution_jobs (status: pending)
    
    Pipeline->>DB: Step EXPORT_CI → WAITING_ACTION
    Note over Pipeline: Pipeline tạm dừng

    rect rgb(200, 230, 255)
        Note over Admin: Luồng EMAIL_STATE51 (DSP không có deal CI)
        alt CRON Daily Send (theo lịch config)
            CiService->>DB: Find pending email_state51 jobs
            CiService->>CiService: Tạo Excel (UPC + DSP codes)
            CiService->>Email: Gửi email + Excel attachment tới deliveryEmail
            CiService->>DB: Mark jobs → completed
        else Admin bấm "Auto Send Email" trên Distribution Jobs page
            Admin->>CiService: POST /auto-send-email {ids}
            CiService->>Email: Gửi email + Excel attachment
            CiService->>DB: Mark jobs → completed
        end
        CiService->>CiService: checkAndResumeStep()
    end

    rect rgb(255, 230, 200)
        Note over Admin: Luồng ADMIN_EXPORT (DSP có deal CI)
        Admin->>CiService: POST /download-excel {ids}
        CiService->>DB: Mark jobs → processing
        CiService-->>Admin: Return Excel file (.xlsx)
        
        alt Admin dùng RPA Tool (tự động)
            Admin->>RPA: POST /api/export/trigger + upload Excel
            RPA->>RPA: Login ci-support.com (Puppeteer)
            RPA->>CISITE: Upload Excel + Post Order
            RPA-->>Admin: {jobId, success}
        else Admin gửi thủ công
            Note over Admin: Admin tự upload Excel lên ci-support.com
        end
        
        Admin->>CiService: POST /confirm-completed {ids, exportIdFromCi}
        CiService->>DB: Mark jobs → completed
        CiService->>CiService: checkAndResumeStep()
    end

    CiService->>Pipeline: resumeFromWaiting(stepId)
    Note over Pipeline: Pipeline tiếp tục → WAIT_PARTNER_PROCESS → SYNC_DATA_DSP_CI
```

---

## 6. Client-side Architecture

### 6.1. Release Submits Page

**File**: [page.tsx](file:///d:/CODE/ag-release/ag-release-client/app/[locale]/(cms)/release-submits/page.tsx)

```
ReleaseSubmitsPage
├── ReleaseSubmitHeader        — Filter/Search
├── ReleaseSubmitTable         — Bảng danh sách submits
│   ├── Columns: iNo, UPC, Release Name, Type, Status, Target DSPs, Since, Created At
│   ├── Action: View Snapshot (FileJson icon) → ReleaseSubmitSnapshotModal
│   └── Action: View Detail (Eye icon) → ReleaseSubmitDetailModal
├── AppPagination              — Phân trang
├── ReleaseSubmitDetailModal   — Chi tiết submit + step table
│   ├── ReleaseSubmitStepTable — Bảng các steps
│   └── ReleaseSubmitStepDetailModal — Chi tiết step
└── ReleaseSubmitSnapshotModal — Xem JSON snapshot release
```

**API Calls (React Query)**:

| Hook | API Endpoint | Mô tả |
|---|---|---|
| [useGetListReleaseSubmits](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/hooks/use-get-list.ts) | `GET /release-submits` | Lấy danh sách submits (phân trang, filter) |
| [useGetDetailReleaseSubmit](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/hooks/use-get-detail.ts) | `GET /release-submits/:id` | Lấy chi tiết submit + steps + logs |
| [useRetryReleaseSubmitStep](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/hooks/use-retry-step.ts) | `POST /release-submits/steps/:stepId/retry` | Retry step bị failed |

---

### 6.2. Distribution Jobs Page

**File**: [page.tsx](file:///d:/CODE/ag-release/ag-release-client/app/[locale]/(cms)/distribution-jobs/page.tsx)

```
DistributionJobsPage
├── DistributionJobsHeader          — Filter/Search
├── DistributionJobsGroupedTable    — Bảng grouped (theo email + date + type)
│   └── Expand row → chi tiết từng job (UPC, DSP codes, status)
├── AppPagination                   — Phân trang
└── DistributionJobDetailModal      — Modal chi tiết + actions
```

**API Calls (React Query)**:

| Hook | API Endpoint | Mô tả |
|---|---|---|
| [useGetListDistributionJobsGrouped](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-get-list-grouped.ts) | `GET /ci-distribution-jobs/grouped` | Lấy danh sách grouped jobs |
| [useAutoSendEmailDistributionJobs](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-auto-send-email.ts) | `POST /ci-distribution-jobs/auto-send-email` | Auto gửi email (chọn jobs → tạo Excel → gửi) |
| [useDownloadExcelDistributionJobs](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-download-excel.ts) | `POST /ci-distribution-jobs/download-excel` | Tải file Excel (mark → processing) |
| [useConfirmCompletedDistributionJobs](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-confirm-completed.ts) | `POST /ci-distribution-jobs/confirm-completed` | Xác nhận đã gửi (mark → completed → resume pipeline) |
| [useUpdateDistributionJob](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-update-distribution-job.ts) | `PUT /ci-distribution-jobs/:id` | Update job (email, dspCodes, subject, cancel) |

---

## 7. Mapping API Endpoints ↔ Server Handlers

### Release Submits

| Method | Endpoint | Controller | Service Method |
|---|---|---|---|
| `POST` | `/release-submits` | [ReleaseSubmitController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts#L24-L32) | `submit()` |
| `GET` | `/release-submits` | [ReleaseSubmitController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts#L35-L39) | `getList()` |
| `GET` | `/release-submits/:id` | [ReleaseSubmitController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts#L42-L46) | `findOne()` |
| `POST` | `/release-submits/steps/:stepId/retry` | [ReleaseSubmitController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts#L56-L60) | `retryStep()` |

### CI Distribution Jobs

| Method | Endpoint | Controller | Service Method |
|---|---|---|---|
| `GET` | `/ci-distribution-jobs` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L37-L41) | `getList()` |
| `GET` | `/ci-distribution-jobs/grouped` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L49-L56) | `getGrouped()` |
| `POST` | `/ci-distribution-jobs/auto-send-email` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L72-L76) | `autoSendEmail()` |
| `POST` | `/ci-distribution-jobs/download-excel` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L93-L109) | `downloadExcel()` |
| `POST` | `/ci-distribution-jobs/confirm-completed` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L117-L124) | `confirmCompleted()` |
| `POST` | `/ci-distribution-jobs/daily-send` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L78-L85) | `handleDailySend()` |
| `POST` | `/ci-distribution-jobs/:id/cancel` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L128-L132) | `cancelJob()` |
| `PUT` | `/ci-distribution-jobs/:id` | [CiDistributionJobController](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts#L141-L148) | `updateJob()` |

---

## 8. Phân loại DSP: Direct vs CI Aggregator

Server phân loại DSPs dựa trên `DspRoutingConfig`:

```mermaid
graph LR
    DSP["DSP được chọn"] --> RC{"dspRoutingConfig.mode?"}
    RC -->|"AGGREGATOR + aggregator.code = 'CI'"| CI["CI Aggregator DSPs"]
    RC -->|"Khác"| DIRECT["Direct DSPs"]
    
    CI --> CIFLOW["PROCESS_AGG_CI\n(1 parent step cho tất cả CI DSPs)"]
    DIRECT --> DFLOW["PROCESS_DIRECT\n(1 parent step per DSP)"]
```

**CI DSPs** được chia thêm theo `hasDeal`:
- `hasDeal = false` → **State51 DSPs** → tạo `CiDistributionJob` type `EMAIL_STATE51` (tự động gửi email)
- `hasDeal = true` → **Deal DSPs** → tạo `CiDistributionJob` type `ADMIN_EXPORT` (admin tải Excel + gửi thủ công)

---

## 9. Retry & Error Recovery

```mermaid
sequenceDiagram
    participant Admin as Admin (Client)
    participant C as Controller
    participant S as ReleaseSubmitService2

    Admin->>C: POST /release-submits/steps/:stepId/retry
    C->>S: retryStep(stepId)
    
    Note over S: 1. Reset step → NEW
    Note over S: 2. Reset parent step (nếu là child) → NEW
    Note over S: 3. Reset submit → PROCESSING
    Note over S: 4. Reset sibling SKIPPED steps → NEW
    Note over S: 5. Re-execute runPipeline() [fire-and-forget]
    
    S->>Admin: {message: "Retry started"}
```

---

## 10. RPA Tool: `ag-release-tool-export` (Port 8888)

Microservice NestJS riêng biệt, sử dụng **Puppeteer** để tự động hóa các tác vụ trên nền tảng bên thứ ba.

### 10.1. Chức năng chính

| Chức năng | Mô tả |
|---|---|
| **CI-Support RPA** | Tự động đăng nhập ci-support.com → upload Excel → click "Post Order" |
| **OpenIMP Token** | Tự động đăng nhập auth.openimp.com → trích xuất Access Token + Refresh Token |
| **Config Management** | Lưu/đọc credentials được mã hóa AES-256 trên server |
| **Dashboard** | Giao diện HTML quản trị tích hợp (Glassmorphism) |
| **Job Tracking** | Lưu logs chi tiết từng bước RPA vào PostgreSQL |

### 10.2. Luồng RPA ci-support.com

```mermaid
sequenceDiagram
    participant Admin as Admin / Server
    participant RPA as ExportService
    participant Pup as Puppeteer Browser
    participant CI as ci-support.com
    participant DB as PostgreSQL (jobs/job_logs)

    Admin->>RPA: POST /api/export/trigger + Excel file
    RPA->>DB: Create Job (status: running)
    RPA-->>Admin: {jobId, success} (HTTP response ngay)
    
    Note over RPA: Fire-and-forget async
    
    RPA->>RPA: Đọc credentials từ file AES-256
    RPA->>Pup: Launch browser (headless/headed)
    Pup->>CI: Navigate ci-support.com
    RPA->>DB: Log [NAVIGATE_LOGIN]
    
    Pup->>CI: Nhập email + password → Login
    RPA->>DB: Log [ENTER_CREDENTIALS]
    
    Note over Pup: Wait 7s (session settle)
    
    Pup->>CI: Navigate /ordering/.../exports/full.html
    Pup->>CI: Click "Frontline"
    RPA->>DB: Log [CLICK_FRONTLINE]
    
    Pup->>CI: Upload Excel file
    Pup->>CI: Submit upload form
    RPA->>DB: Log [SUBMIT_UPLOAD]
    
    Note over Pup: Wait 10s (server validation)
    
    Pup->>CI: Click "Post Order"
    RPA->>DB: Update Job → success
    RPA->>DB: Log [COMPLETE]
    RPA->>Pup: Close browser
    RPA->>RPA: Cleanup temp Excel file
```

### 10.3. API Endpoints

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| `POST` | `/api/auth/login` | Auth0 | Xác thực Auth0 → trả API Key |
| `GET` | `/api/export/config` | Auth0/API Key | Đọc config (credentials) |
| `POST` | `/api/export/config` | Auth0/API Key | Lưu config vào file mã hóa |
| `POST` | `/api/export/trigger` | Auth0/API Key | Upload Excel → kích hoạt RPA (async) |
| `GET` | `/api/export/status` | Auth0/API Key | Poll trạng thái + live logs |
| `GET` | `/api/export/job/:jobId` | Auth0/API Key | Lấy logs Job từ PostgreSQL |
| `POST` | `/api/export/clear-logs` | Auth0 | Xóa logs in-memory |
| `POST` | `/api/openimp/token` | Auth0/API Key | Puppeteer lấy OpenIMP token (đồng bộ) |
| `GET` | `/` | Public | Serve Dashboard HTML |

### 10.4. Auth System

- **Dual Auth**: API Key (`x-api-key` header) hoặc Auth0 Bearer Token
- API Key = full admin bypass (dùng cho machine-to-machine)
- Auth0 = RBAC fine-grained permissions:
  - `release-tool.export.config.view/edit`
  - `release-tool.export.trigger`
  - `release-tool.export.status`
  - `release-tool.openimp.token`
  - `release-tool.admin` (full access)

### 10.5. Vị trí trong luồng tổng thể

```mermaid
graph LR
    A["EXPORT_CI step tạo\nCiDistributionJob\n(type: ADMIN_EXPORT)"] --> B["Admin tải Excel\ntừ Distribution Jobs page"]
    B --> C{"Cách gửi?"}
    C -->|"Tự động"| D["Upload lên RPA Tool\nPOST /api/export/trigger"]
    C -->|"Thủ công"| E["Admin tự upload\nlên ci-support.com"]
    D --> F["Puppeteer tự động:\nLogin → Upload → Post Order"]
    E --> G["Admin thao tác thủ công\ntrên ci-support.com"]
    F --> H["Admin confirm completed\ntrên Distribution Jobs page"]
    G --> H
    H --> I["Pipeline resume\n→ SYNC_DATA_DSP_CI"]
```

---

## 11. File References

### Client (`ag-release-client`)

| Module | Path |
|---|---|
| Release Submit Module | [modules/release-submit/](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit) |
| Distribution Jobs Module | [modules/distribution-jobs/](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs) |
| Release Submit Types | [types/index.ts](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/types/index.ts) |
| Distribution Jobs Types | [types/index.ts](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/types/index.ts) |
| Release Submit Enums | [enums/index.ts](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/enums/index.ts) |

### Server (`ag-release-server`)

| Module | Path |
|---|---|
| Release Submit Service | [release-submit2.service.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/services/release-submit2.service.ts) |
| CI Distribution Job Service | [ci-distribution-job.service.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/services/ci-distribution-job.service.ts) |
| Release Submit Controller | [release-submit.controller.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts) |
| CI Job Controller | [ci-distribution-job.controller.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/ci-distribution-job.controller.ts) |
| Entity: ReleaseSubmit | [release-submit.entity.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/entities/release-submit.entity.ts) |
| Enums (Server) | [release-submit.enum.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/release-submit.enum.ts) |

### RPA Tool (`ag-release-tool-export`)

| Module | Path |
|---|---|
| Export Controller | [export.controller.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/export.controller.ts) |
| Export Service (Puppeteer RPA) | [export.service.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/services/export.service.ts) |
| OpenIMP Service (Puppeteer) | [openimp.service.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/services/openimp.service.ts) |
| Config File Service (AES-256) | [config-file.service.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/services/config-file.service.ts) |
| Dashboard Controller | [dashboard.controller.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/dashboard/dashboard.controller.ts) |
| Dashboard HTML | [dashboard.html](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/dashboard/views/dashboard.html) |
| Job Entity | [job.entity.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/entities/job.entity.ts) |
| Job Log Entity | [job-log.entity.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/modules/export/entities/job-log.entity.ts) |
| Auth Guard (Unified) | [unified-auth.guard.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/common/guards/unified-auth.guard.ts) |
| Permissions | [permissions.constant.ts](file:///d:/CODE/ag-release/ag-release-tool-export/src/common/constants/permissions.constant.ts) |
