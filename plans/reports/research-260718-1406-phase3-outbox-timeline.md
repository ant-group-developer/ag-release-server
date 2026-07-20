# Phase 3 Outbox-Timeline Research Summary

**Date:** 2026-07-18 · **Status:** ✅ Complete · **Output:** `phase-03-outbox-timeline-detailed.md`

## Objectives

Nghiên cứu chi tiết Phase 3 architecture: Timeline read-side + SSE realtime từ `distribution_event` (CQRS projection).

## Research Approach

- **2 researcher agents song song:**
  - Agent 1: CQRS projection patterns (checkpoint, UPSERT, reconciliation, keyset pagination)
  - Agent 2: NestJS SSE + EventEmitter2 (realtime push, memory management, dual-path)
- **Context survey:** Phase 2 code (`distribution_event` ORM, outbox-relay), domain events (15+ types), v3 `release_dsp_delivery`
- **Duration:** ~20 min total (parallel execution)

## Key Findings

### Architecture (3 components)

1. **Timeline Query API** — read `distribution_event` với cursor pagination (keyset), filter `level` (milestone/progress)
2. **SSE Gateway** — `Map<distributionId, Subject<MessageEvent>>`, EventEmitter2 bridge từ outbox-relay
3. **Projection Handler** — poll events WHERE `id > checkpoint`, UPSERT → `release_dsp_delivery`

### Design Decisions (8 chốt)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Realtime push | **SSE** (not WebSocket) | Unidirectional read-only; auto-reconnect HTTP |
| 2 | Event bus | **EventEmitter2 in-process** | Zero infra, <10ms latency; project đã có `@nestjs/event-emitter` v3.0.1 |
| 3 | Projection trigger | **Piggyback outbox-relay** (poll after markDispatched) | Reuse polling infra; KISS |
| 4 | Projection strategy | **UPSERT** với `WHERE IS DISTINCT FROM` | Idempotent; event replay safe; no-op writes skipped |
| 5 | Checkpoint | `projection_checkpoint(name, last_event_id bigint)` | At-most-once; bigserial monotonic |
| 6 | Read model | **Reuse `release_dsp_delivery` v3** | UI đã dựng trên bảng này; không tạo mới |
| 7 | Timeline pagination | **Keyset cursor** `WHERE id > cursor` | O(log N); index `(distributionId, id)` từ Phase 2 |
| 8 | Redis Pub/Sub | **Deferred Phase 4+** | EventEmitter2 đủ single-instance; thêm khi cần scale horizontal |

### Event → Status Mapping

15+ domain events → 6 read model status:
- `DistributionSubmitted` → `processing` + set `lastEnqueuedAt`
- `ChannelLive` → `distributed` + `hasLiveVersion=true` + set `lastDeliveredAt`
- `ChannelIssues` → `issues`
- `ChannelReset` → `processing` + enqueue timestamp
- `ChannelTakenDown` → `taken_down` + `hasLiveVersion=false`
- `Distributed` / `PartiallyDistributed` / `DistributionFailed` → tương ứng

### Dual-path Realtime

- **Primary (fast):** OutboxRelay.markDispatched() → EventEmitter2.emit() → SSE pushes <1s
- **Fallback (reconnect):** Client gửi `Last-Event-ID` header → query `distribution_event WHERE id > lastId`

### Critical Implementation Details

**Memory leak guard:**
```ts
@Sse(':id/stream')
streamEvents(@Param('id') id: string, @Res() response: Response) {
  response.on('close', () => this.sseService.cleanup(id)); // ← MUST HAVE
  return this.sseService.getStream(id);
}
```
Không có `cleanup()` → Map subjects phình vô hạn.

**Projection idempotency:**
```sql
ON CONFLICT (release_id, dsp_id) DO UPDATE
  SET status = EXCLUDED.status
  WHERE EXCLUDED.status IS DISTINCT FROM release_dsp_delivery.status;
```
Guard `IS DISTINCT FROM` → replay event cũ = no-op.

## Implementation Plan (5 Steps)

1. **Timeline Query Service + API** — read-only endpoint, cursor pagination
2. **SSE Gateway + EventEmitter2** — hook outbox-relay → emit → push
3. **Projection handler** — checkpoint + UPSERT read model
4. **Reconciliation + replay** — gap detection, rebuild từ event log
5. **Performance tuning** — profiling, keepalive, metrics

**Exit criteria:** Timeline API filter `level`, SSE push <1s, read model sync từ events, no memory leak.

## Risks Mitigated

- **Single-instance EventEmitter2:** Fallback poll `distribution_event` khi reconnect; Redis deferred Phase 4
- **Projection lag >5s:** Tách BullMQ job riêng nếu UI cần <1s (chưa chứng minh)
- **SSE proxy timeout:** Keepalive heartbeat 30s
- **Out-of-order events:** Bigserial `id` + checkpoint at-most-once
- **Concurrent distributions:** Unresolved — cần thêm `distributionId` FK vào `release_dsp_delivery`?

## Unresolved Questions (7)

1. Multi-distribution per release: overlap RETRY + INITIAL → UPSERT conflict?
2. Projection lag SLA: eventual consistency 5-10s hay <1s?
3. Level filter default: `milestone` (user) hay `all` (admin)?
4. SSE `retry:` directive interval: 5s? 30s?
5. Redis timing: Phase 4 ngay hay đợi multi-instance deployment?
6. Reconciliation frequency: cron 30 phút hay on-demand?
7. `release_dsp_delivery.logs`: projection ghi error vào đây hay UI tự query events?

## Deliverables

- **Detailed plan:** `plans/260713-distribution-vnext/phase-03-outbox-timeline-detailed.md` (730 lines)
- **Research reports:**
  - `plans/reports/researcher-260718-1406-nestjs-sse-eventemitter2.md` (SSE patterns)
  - CQRS projection findings (inline agent output — checkpoint, UPSERT, keyset pagination)

## Next Actions

1. Review detailed plan với user → clarify 7 unresolved questions
2. Execute Step 1 (Timeline Query Service) — có thể chạy song song với Phase 4 (ACL adapters)
3. Update `plan.md` status Phase 3 → "📋 Đặc tả xong — sẵn sàng EXECUTE"

## Token Efficiency

- Research: 2 agents parallel, <100K tokens total
- Output: 730-line detailed spec vs 38-line skeleton (19× expansion)
- Sacrifice grammar for concision ✓
