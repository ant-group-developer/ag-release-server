# Cải thiện theo dõi trạng thái Release Submit & Distribution Jobs

## Mục tiêu

Giải quyết 6 pain points khi theo dõi trạng thái hành động:

| # | Vấn đề hiện tại | Giải pháp |
|---|---|---|
| 1 | Phải click modal mới thấy steps | **Progress summary** ngay trên bảng chính |
| 2 | Không biết WAITING_ACTION chờ bao lâu | Hiển thị **scheduled time / countdown** |
| 3 | Không có real-time update | **Auto-polling** với `refetchInterval` |
| 4 | Khó nhìn tổng quan per-DSP progress | **DSP progress badges** trên bảng chính |
| 5 | Không biết CI Job / RPA đang chạy không | **Link-back** từ Distribution Jobs → Submit step |
| 6 | Khó trace lỗi nhanh | **Inline error message** trên bảng chính |

---

## Proposed Changes

### Server (`ag-release-server`)

---

#### [MODIFY] [release-submit.controller.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/controllers/release-submit.controller.ts)

Thêm 1 endpoint mới cho lightweight polling:

```typescript
@Get('polling/:id')
async getPollingStatus(@Param('id') id: string) {
  return this.releaseSubmitService.getPollingStatus(id);
}
```

---

#### [MODIFY] [release-submit2.service.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/services/release-submit2.service.ts)

Thêm method `getPollingStatus()` — trả data nhẹ cho polling (không load full snapshot/logs):

```typescript
async getPollingStatus(id: string) {
  const submit = await this.submitRepo.findOne({
    where: { id },
    relations: ['steps', 'steps.childSteps'],
    select: ['id', 'status', 'completedAt', 'summary'],
  });
  
  return {
    id: submit.id,
    status: submit.status,
    completedAt: submit.completedAt,
    summary: submit.summary,
    progress: this.computeProgress(submit.steps),
    // steps chỉ trả status + type + scheduledAt (lightweight)
    steps: submit.steps.map(s => ({
      id: s.id,
      type: s.type,
      status: s.status,
      scheduledAt: s.scheduledAt,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      errorMessage: s.status === 'FAILED' ? s.metadata?.error : null,
      childSteps: s.childSteps?.map(c => ({
        id: c.id,
        type: c.type,
        status: c.status,
        scheduledAt: c.scheduledAt,
        errorMessage: c.status === 'FAILED' ? c.metadata?.error : null,
      })),
    })),
  };
}

private computeProgress(steps: ReleaseSubmitStep[]) {
  const all = steps.flatMap(s => [s, ...(s.childSteps || [])]);
  const total = all.length;
  const done = all.filter(s => ['DONE', 'SKIPPED'].includes(s.status)).length;
  const failed = all.filter(s => s.status === 'FAILED').length;
  const processing = all.filter(s => s.status === 'PROCESSING').length;
  const waiting = all.filter(s => s.status === 'WAITING_ACTION').length;
  return { total, done, failed, processing, waiting };
}
```

---

#### [MODIFY] [release-submit2.service.ts](file:///d:/CODE/ag-release/ag-release-server/src/modules/release/modules/release-submit/services/release-submit2.service.ts) — `getList()`

Thêm `progress summary` vào response `getList()` — cho mỗi submit, tính tỉ lệ hoàn thành:

```typescript
// Trong getList(), sau khi lấy items:
const itemsWithProgress = items.map(item => ({
  ...item,
  progress: this.computeProgress(item.steps),
}));
```

> [!IMPORTANT]
> Cần cân nhắc performance: `getList()` hiện có load `steps` relation không? Nếu không, cần thêm `leftJoinAndSelect` cho steps ở query `getList()`. Hoặc dùng raw SQL subquery để đếm nhanh mà không load full steps.

---

### Client (`ag-release-client`)

---

#### [NEW] `modules/release-submit/hooks/use-polling-status.ts`

Hook polling trạng thái nhẹ cho submit detail modal:

```typescript
export const usePollingReleaseSubmit = (id?: string, enabled = false) => {
  return useQuery({
    queryKey: releaseSubmitQueryKeys.polling(id ?? ''),
    queryFn: () => releaseSubmitApis.getPollingStatus(id ?? ''),
    enabled: !!id && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.data?.status;
      // Polling 5s khi PROCESSING, 15s khi WAITING_ACTION, dừng khi DONE/FAILED/CANCELLED
      if (['DONE', 'FAILED', 'CANCELLED', 'PARTIAL_DONE'].includes(status)) return false;
      if (status === 'WAITING_ACTION') return 15_000;
      return 5_000;
    },
  });
};
```

---

#### [MODIFY] [modules/release-submit/hooks/use-get-list.ts](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/hooks/use-get-list.ts)

Thêm auto-refetch khi có submit đang PROCESSING/WAITING_ACTION:

```typescript
export const useGetListReleaseSubmits = (params: ReleaseSubmitFilter) => {
  const { data, ...rest } = useQuery({
    queryKey: releaseSubmitQueryKeys.getLists(params),
    queryFn: () => releaseSubmitApis.getList(params),
    placeholderData: (prevData) => prevData,
    refetchInterval: (query) => {
      const items = query.state.data?.data?.data?.items ?? [];
      const hasActive = items.some(i => 
        ['NEW', 'PROCESSING', 'WAITING_ACTION'].includes(i.status)
      );
      return hasActive ? 10_000 : false; // Poll 10s nếu có active submit
    },
  });
  // ...
};
```

---

#### [NEW] `modules/release-submit/components/progress-bar/index.tsx`

Component progress bar nhỏ gọn, hiển thị inline trên bảng:

```
[████████░░░░] 6/10 steps • 1 waiting • 0 failed
```

- Dùng Ant Design `Progress` hoặc custom div
- Màu segments: ✅ done (green) | 🔄 processing (blue, animate pulse) | ⏳ waiting (amber) | ❌ failed (red) | ⬜ new (gray)

---

#### [MODIFY] Release Submit Table — Thêm 2 cột mới

**File**: [modules/release-submit/components/table/index.tsx](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/components/table/index.tsx)

1. **Cột "Progress"** — Hiển thị `ProgressBar` component (segmented bar + text summary)
2. **Cột "Current Step"** — Hiển thị step đang `PROCESSING` hoặc `WAITING_ACTION`:
   - Nếu `PROCESSING`: hiển thị step type + pulse animation
   - Nếu `WAITING_ACTION`: hiển thị step type + countdown (`scheduledAt - now`)
   - Nếu `FAILED`: hiển thị step type + error message (truncated, tooltip full)

```
| UPC | Title | Type | Status | Progress          | Current Step              | Since | Actions |
|-----|-------|------|--------|-------------------|---------------------------|-------|---------|
| ... | ...   | ...  | 🔄     | [████░░] 4/8      | 🔄 Create And Upload CI   | 2m    | 👁️      |
| ... | ...   | ...  | ⏳     | [██████░] 6/8     | ⏳ Wait Partner (in 58m)  | 1h    | 👁️      |
| ... | ...   | ...  | ❌     | [████░░░] 4/8 1❌ | ❌ Validate: Invalid UPC  | 5m    | 👁️ 🔄  |
```

---

#### [MODIFY] Detail Modal — Thêm auto-polling + visual pipeline

**File**: [modules/release-submit/components/detail-modal/index.tsx](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/components/detail-modal/index.tsx)

1. Sử dụng `usePollingReleaseSubmit` khi modal mở + submit đang active
2. Merge polling data vào `releaseSubmitDetail` để cập nhật status real-time
3. Thêm visual pipeline overview phía trên bảng steps:

```
┌─────────────────────────────────────────────────────────────────┐
│  GEN_UPC ✅ → GEN_ISRCS ✅ → VALIDATE ✅                       │
│  ├── PROCESS_DIRECT (Apple) ✅                                 │
│  ├── PROCESS_DIRECT (Spotify) 🔄 → WAIT_PARTNER (in 45m)      │
│  └── PROCESS_AGG_CI ⏳ → EXPORT_CI → waiting admin action      │
└─────────────────────────────────────────────────────────────────┘
```

---

#### [MODIFY] Step Table/List — WAITING_ACTION countdown

**File**: [modules/release-submit/components/step-table/index.tsx](file:///d:/CODE/ag-release/ag-release-client/modules/release-submit/components/step-table/index.tsx)

Khi step có `status = WAITING_ACTION` và `scheduledAt`:
- Hiển thị countdown: "Resumes in 45m 20s" (cập nhật mỗi giây bằng `useEffect` + `setInterval`)
- Khi `scheduledAt` < now: "Ready to resume" (chờ CRON claim)

Khi step có `status = WAITING_ACTION` nhưng không có `scheduledAt`:
- Hiển thị "Waiting for admin action" (EXPORT_CI type)

---

#### [MODIFY] Step Table — Inline error message

Khi step `FAILED`, hiển thị error message rút gọn trực tiếp trên row:

```
| Step Type          | Status  | Error                            |
|--------------------|---------|----------------------------------|
| Validate           | ❌ FAILED| "UPC 123456 already exists in…"  |
```

- Error lấy từ `step.metadata?.error` hoặc `step.metadata?.output?.error`
- Truncate 80 chars, tooltip hiển thị full

---

#### [MODIFY] Distribution Jobs Grouped Table — Thêm link tới Submit

**File**: [modules/distribution-jobs/components/grouped-table/index.tsx](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/components/grouped-table/index.tsx)

- Thêm cột "Release Submit" — link/button mở ReleaseSubmitDetailModal cho `releaseSubmitId` tương ứng
- Mỗi row grouped hiển thị thêm: pending/total jobs count

---

#### [MODIFY] Distribution Jobs List Hook — Auto-polling

**File**: [modules/distribution-jobs/hooks/use-get-list-grouped.ts](file:///d:/CODE/ag-release/ag-release-client/modules/distribution-jobs/hooks/use-get-list-grouped.ts)

```typescript
refetchInterval: (query) => {
  const items = query.state.data?.data?.data?.items ?? [];
  const hasPending = items.some(group => 
    group.status?.includes('pending') || group.status?.includes('processing')
  );
  return hasPending ? 15_000 : false;
},
```

---

## Open Questions

> [!IMPORTANT]
> **1. Phương án Real-time: Polling hay SSE?**
> 
> Tôi đề xuất **Polling (refetchInterval)** vì:
> - Đơn giản, không cần thay đổi infra (không cần WebSocket gateway)
> - Phù hợp với tần suất cập nhật (steps thay đổi mỗi vài phút, không phải mỗi giây)
> - React Query hỗ trợ sẵn `refetchInterval` với logic adaptive (tắt khi done)
> - Performance hợp lý với endpoint `getPollingStatus()` nhẹ
>
> SSE/WebSocket chỉ nên dùng nếu sau này cần real-time cho hàng chục user cùng xem 1 submit.

> [!IMPORTANT]
> **2. Performance `getList()` khi thêm progress:**
>
> Hiện tại `getList()` có thể chưa load `steps` relation. Có 2 cách:
> - **Option A**: Thêm LEFT JOIN steps vào query → nặng hơn nhưng chính xác
> - **Option B**: Dùng raw SQL subquery `COUNT(*)` trực tiếp → nhẹ hơn, nhưng code phức tạp hơn
>
> Bạn muốn hướng nào?

> [!WARNING]
> **3. Countdown trên client:**
>
> `scheduledAt` từ server là UTC timestamp. Client cần đảm bảo format đúng timezone. Verify rằng `dayjs` hoặc `date-fns` đang dùng đúng timezone config.

---

## Verification Plan

### Automated Tests
- Unit test `computeProgress()` với các edge cases (all done, mix, empty steps)
- Verify `getPollingStatus()` response shape

### Manual Verification
1. Submit 1 release → quan sát bảng chính cập nhật progress bar tự động
2. Khi step WAITING_ACTION → verify countdown hiển thị đúng
3. Khi step FAILED → verify error message hiển thị inline
4. Mở Distribution Jobs → verify link tới Submit step hoạt động
5. Verify polling tự dừng khi submit DONE/FAILED
