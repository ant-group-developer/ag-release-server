# Group A Adapter Audit Report — CiQaAdapter (B8) + CiDeliverDesireAdapter (B10)

Date: 2026-07-20  
Branch: dev-duc-phase4-integration-acl  
Reference bug: B7 (aggregate sai do response chứa nhiều UPC, không filter theo UPC của distribution)

---

## 1. CiQaAdapter (B8)

Files:
- `src/modules/distribution-orchestration/infrastructure/adapters/ci-qa.adapter.ts`
- `src/modules/distribution-orchestration/infrastructure/ci-api/ci-qa-api.service.ts`

### B8-BUG-1: is_blocker không được dùng để lọc — non-blocker open flags block distribution oan (MEDIUM)

**Evidence:**

- Docs B8.3 (line 201): `qa_flag_type.is_blocker | true = chặn phân phối` → ngụ ý rõ ràng chỉ blocker flag mới chặn.
- `ci-qa-api.service.ts` line 168–188: filter chỉ theo `closed_date === null`, lấy TẤT CẢ open flags (bao gồm `is_blocker: false`).
- `ci-qa.adapter.ts` line 59: `if (!result.hasOpenFlags)` → nếu bất kỳ flag nào open (kể cả non-blocker) → return `{kind: 'flagged'}` → block toàn bộ distribution.

**Logic hiện tại:**
```
openFlags = _embedded.filter(f => f.closed_date === null)   // mọi open flag
hasOpenFlags = openFlags.length > 0                          // kể cả non-blocker
→ flagged → block
```

**Logic đúng theo docs:**
```
openFlags = _embedded.filter(f => f.closed_date === null && f.qa_flag_type.is_blocker === true)
hasOpenFlags = openFlags.length > 0
→ non-blocker open flags → cảnh báo nhưng không block
```

**Đề xuất fix (ci-qa-api.service.ts line 168):**
```typescript
const openFlags: OpenQaFlag[] = response._embedded
    .filter((flag) => flag.closed_date === null && flag.qa_flag_type.is_blocker === true)
    .map((flag) => ({ ... }));
```

> **Lưu ý quan trọng:** Trong sample data B8b, TẤT CẢ 9 open flags đều có `is_blocker: true`. Nếu thực tế CI không bao giờ tạo non-blocker flag thì bug này sẽ không trigger. Tuy nhiên, đây là logic sai so với spec. Xem Unresolved Questions #1.

---

### B8-CHECK-2: B8a page_size=1 — có thể bỏ sót release không? (LOW / VERIFIED LOGIC OK)

**Evidence:**
- Docs B8.1 (line 180): `?gtin={{release_upc}}&page_size=1`
- Code `ci-qa-api.service.ts` line 107: `{ gtin: upc, page_size: 1 }`
- Code line 122: `response._embedded[0].release_id` → lấy phần tử đầu tiên.

**Phân tích:** 1 UPC luôn chỉ map về 1 ReleaseFormat duy nhất trên CI (GTIN là unique identifier). `page_size=1` là đủ và khớp với docs. Không có bug.

---

### B8-CHECK-3: B8b endpoint URL — releaseformats vs releases (LOW / VERIFIED OK)

**Evidence:**
- Docs API table (line 277): `/releases/v2/.../releaseformats/:release_id/qaflags` ← khớp code.
- B8b response `_links.self` (line 845): `/releases/v2/.../releases/:id/metadata/qa_flag` ← khác.

**Phân tích:** Code dùng đúng URL theo API reference table. Response `_links.self` có thể là alias hoặc CI tự chèn href khác. API table là authoritative spec. Không có bug.

---

### B8-CHECK-4: closed_date filter (VERIFIED CORRECT)

Code line 169: `flag.closed_date === null` → đúng spec B8.3. Closed flags bị loại bỏ đúng.

---

### B8-CHECK-5: field mapping release_id (VERIFIED CORRECT)

- B8a trả về `_embedded[0].release_id` (string).
- Code (line 122) lấy đúng `release_id` và pass vào B8b endpoint `/releaseformats/:release_id/qaflags`.
- Không nhầm lẫn với `release_format_id` hay `id`.

---

### B8-CHECK-6: Multi-track/multi-volume track_number + volume_part (VERIFIED CORRECT)

- Code line 67–69 (`ci-qa.adapter.ts`): format string có cả `trackNumber` và `volumePart`.
- Interface maps `track_number` (string) và `volume_part` (number) đúng field name.

---

### Tóm tắt CiQaAdapter

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| B8-BUG-1 | Non-blocker open flags block distribution | MEDIUM | BUG — cần confirm business rule |
| B8-CHECK-2 | page_size=1 có đủ không | LOW | Verified OK |
| B8-CHECK-3 | URL endpoint mismatch vs _links | LOW | Verified OK |
| B8-CHECK-4 | closed_date filter | - | Verified OK |
| B8-CHECK-5 | release_id field mapping | - | Verified OK |
| B8-CHECK-6 | multi-track/volume | - | Verified OK |

---

## 2. CiDeliverDesireAdapter (B10)

Files:
- `src/modules/distribution-orchestration/infrastructure/adapters/ci-deliver-desire.adapter.ts`
- `src/modules/distribution-orchestration/infrastructure/ci-api/ci-deliver-desire-api.service.ts`

### B10-CHECK-1: _embedded semantics — API đã filter sẵn (VERIFIED CORRECT)

**Evidence:**
- Docs B10.2 (line 255): "Mỗi phần tử trong `_embedded[]` đại diện cho 1 DSP đã phân phối thành công."
- Code passes `status=complete&transfer_batch_status=transferred` as query params (line 70–72) → API đã filter.
- DSP không có trong response → default `pending` (line 111–118) → đúng.

**Nhận xét:** `translateStatus()` trong adapter check lại `status === 'complete' && transferStatus === 'transferred'` là redundant (API đã filter rồi) nhưng không sai. Mọi DSP trong response đều sẽ → 'live'. Logic đúng.

---

### B10-CHECK-2: dpc mapping, case-sensitivity (VERIFIED CORRECT)

**Evidence:**
- `ci-deliver-desire-api.service.ts` line 90–92: `dpcLower = item.musicService.dpc.toLowerCase()` và lookup cũng dùng `keyLower = dspCode.toLowerCase()`.
- Case-insensitive matching đúng.

---

### B10-CHECK-3: rejected status — dead code không gây hại (LOW)

**Evidence:**
- `translateStatus()` line 120: xử lý `status === 'rejected'` → `DspLiveStatus.rejected`.
- Nhưng endpoint đã filter `?status=complete` → `rejected` sẽ KHÔNG BAO GIỜ xuất hiện trong response này.
- Docs B10 response mẫu (line 864–898): không có status 'rejected', chỉ có 'complete'.

**Phân tích:** Dead code, không gây bug. Nếu CI API có endpoint riêng báo rejected thì sẽ cần adapter khác. Hiện tại code không sai, nhưng hơi misleading.

---

### B10-CHECK-4: DSP not in response → pending (VERIFIED CORRECT)

- `ci-deliver-desire-api.service.ts` line 111–118: DSP không tìm thấy → status='pending', transferStatus='pending'.
- Adapter line 62–64: DSP không có trong map → return 'pending'. Đúng.

---

### B10-CHECK-5: Multi-UPC contamination (VERIFIED CLEAN — khác B7)

**Evidence:**
- B10 query: `?gtin={{release_upc}}` — filter theo UPC trực tiếp (line 67–68).
- Không giống B7 (filter theo `import_external_identifier` = batch chứa nhiều UPC).
- Response chỉ chứa deliver_desire records cho UPC được query. Không có cross-UPC contamination.

---

### Tóm tắt CiDeliverDesireAdapter

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| B10-CHECK-1 | _embedded semantics + double-check redundant | - | Verified OK (redundant but harmless) |
| B10-CHECK-2 | dpc case-sensitivity | - | Verified OK |
| B10-CHECK-3 | rejected dead code | LOW | Not a bug, misleading comment only |
| B10-CHECK-4 | DSP not in response → pending | - | Verified OK |
| B10-CHECK-5 | Multi-UPC contamination | - | Verified clean (gtin filter) |

**Kết luận B10: No bugs found. Verified correct.**

---

## 3. Tổng hợp

| Adapter | Bug | Severity |
|---------|-----|----------|
| CiQaAdapter (B8) | B8-BUG-1: Non-blocker open flags không nên block distribution | MEDIUM |
| CiDeliverDesireAdapter (B10) | Không có bug | - |

---

## Unresolved Questions

1. **[CRITICAL business rule] B8 — is_blocker:** Docs nói `is_blocker: true = chặn phân phối`, nhưng không nói rõ non-blocker open flag (`is_blocker: false`) có block hay không. Hai khả năng:
   - (a) Non-blocker = chỉ cảnh báo, không block → phải fix code filter theo `is_blocker`.
   - (b) Tất cả open flag (dù blocker hay không) đều block → code hiện tại đúng, docs chỉ note is_blocker để categorize severity.
   - Trong sample B8b không có flag nào `is_blocker: false`, nên chưa thể xác nhận từ data thực.
   - **Cần hỏi BA/PO hoặc test với CI API thực để xác nhận business rule.**

2. **[LOW] B10 — rejected DSP:** Nếu CI có endpoint khác báo DSP rejected (e.g., `?status=rejected`), code hiện tại sẽ không bắt được. Cần xác nhận với CI API docs có endpoint nào báo rejected không, hay rejected được báo qua email manually.
