# Phase 3 — Timeline read-side + SSE (CQRS projection từ distribution_event)

**Priority:** Trung bình-cao · **Status:** ✅ HOÀN THÀNH (30 tests, 5/5 steps) · **Depends on:** Phase 2 ✅ (distribution_event write-side)

## Context Links

- Kiến trúc: `docs/flow-release-submit-new/kien-truc-luong-phat-hanh-moi.md` §12.d (Timeline API + SSE), §11 (CQRS-lite)
- Phase 2: `phase-02-bullmq-engine.md` — đã ghi `distribution_event` append-only + outbox relay
- Domain events: `src/modules/distribution-orchestration/domain/events/` — 15+ event types với level (milestone/progress)
- Research reports:
    - `plans/reports/researcher-260718-1406-nestjs-sse-eventemitter2.md` — SSE + EventEmitter2 patterns
    - Agent CQRS projection research (in-context) — checkpoint, UPSERT, reconciliation

## Ranh giới với Phase 2 (đã chốt 2026-07-16)

Phase 2 = **write-side**: `distribution_event` + `outbox_event` ghi trong transaction, relay polling dispatch. **Phase 3 KHÔNG làm lại phần đó** — Phase 3 = **read-side** (CQRS-lite): đọc event đã ghi → chiếu ra timeline + SSE realtime cho UI.

## Mục tiêu

Observability cho user: dev/kiểm duyệt viên/user theo dõi tiến độ realtime của release — từ milestone milestone (user thấy) đến progress (admin/dev thấy).

**Exit criteria:**

- Timeline API `GET /distributions/:id/timeline` trả event list filter theo `level`
- SSE endpoint `GET /distributions/:id/stream` đẩy event mới realtime (<1s latency)
- Projection `release_dsp_delivery` đồng bộ từ event (status + timestamps khớp)
- Integration test: submit release → SSE client nhận events → read model cập nhật

## Architecture

### 3 thành phần chính

```text
┌───────────────────────┐
│ Write-side (Phase 2)  │ ← Aggregate apply() → pullDomainEvents()
│ • distribution_event  │     ↓ INSERT in saveWithOutbox tx
│ • outbox_event        │
└───────────┬───────────┘
            │
            ↓ outbox-relay polls every 5s
┌───────────────────────────────────────────────────────┐
│ Phase 3 Bridge: OutboxRelay + EventEmitter2          │
│ • markDispatched(id) → commit                         │
│ • eventEmitter.emit('distribution.event.saved', evt)  │ ← in-process
└───────────┬───────────────────────────────────────────┘
            │
            ├─────────────────┬─────────────────┐
            ↓                 ↓                 ↓
   ┌────────────────┐  ┌──────────────┐  ┌────────────────┐
   │ SSE Gateway    │  │ Timeline API │  │ Projection Svc │
   │ (realtime)     │  │ (snapshot)   │  │ (read model)   │
   └────────────────┘  └──────────────┘  └────────────────┘
     Subject<Event>      SELECT WHERE       UPSERT status
     per distributionId  distributionId     to release_dsp_
                         + level filter     delivery
```

### Design decisions (đã chốt từ research)

| #   | Chủ đề                  | Chốt                                                                                       | Lý do                                                                            |
| --- | ----------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | **SSE vs WebSocket**    | **SSE** (đơn hướng server→client).                                                         | Luồng read-only; SSE có auto-reconnect HTTP; không cần bidirectional.            |
| 2   | **Realtime nguồn**      | **EventEmitter2 in-process** (primary) + poll `distribution_event` (fallback reconnect).   | Zero infra, latency <10ms; project đã có `@nestjs/event-emitter` v3.0.1.         |
| 3   | **Projection trigger**  | **Piggyback trên OutboxRelay** — sau `markDispatched()`, poll event WHERE id > checkpoint. | Reuse polling infra; KISS. Nếu lag > 5s trở thành vấn đề, tách BullMQ job riêng. |
| 4   | **Projection strategy** | **UPSERT với timestamp guard** (`WHERE EXCLUDED IS DISTINCT FROM`).                        | Idempotent; ngăn no-op writes; event replay safe.                                |
| 5   | **Checkpoint**          | Bảng `projection_checkpoint(name PK, last_event_id bigint)`.                               | At-most-once per poll batch; bigserial monotonic → no double-process.            |
| 6   | **Read model target**   | **Reuse bảng `release_dsp_delivery` v3** — project events → update status/timestamps.      | Không tạo bảng mới; UI đã dựng trên bảng này.                                    |
| 7   | **Timeline query**      | Cursor-based pagination với keyset `WHERE id > cursor ORDER BY id`.                        | O(log N) seek qua index `(distributionId, id)` — đã có từ Phase 2.               |
| 8   | **Redis Pub/Sub**       | **Deferred Phase 4+** (khi multi-instance cần horizontal scale).                           | EventEmitter2 đủ cho single-instance; thêm Redis khi chứng minh cần.             |

## Scope

### 3.1 Timeline Query Service (read từ `distribution_event`)

```ts
// application/queries/distribution-timeline.query.ts
interface TimelineQueryDto {
	distributionId: string;
	level?: 'milestone' | 'progress'; // default 'milestone' (user view)
	cursor?: string; // base64(eventId bigint)
	limit?: number; // default 50
}

interface TimelineEventDto {
	id: string;
	type: string;
	channelId?: string;
	level: string;
	payload: object;
	occurredAt: Date;
}

@Injectable()
export class DistributionTimelineQueryService {
	async getTimeline(dto: TimelineQueryDto): Promise<{
		items: TimelineEventDto[];
		nextCursor: string | null;
	}> {
		const cursor = dto.cursor ? decodeCursor(dto.cursor) : '0';
		const rows = await this.query(
			`
      SELECT id, type, channel_id, level, payload, occurred_at
      FROM   distribution_event
      WHERE  distribution_id = $1
        AND  ($2::varchar IS NULL OR level = $2)
        AND  id > $3
      ORDER  BY id ASC
      LIMIT  $4
    `,
			[dto.distributionId, dto.level, cursor, dto.limit],
		);

		return {
			items: rows,
			nextCursor:
				rows.length === dto.limit
					? encodeCursor(rows[rows.length - 1].id)
					: null,
		};
	}
}
```

**Index đã có từ Phase 2:** `IDX_distribution_event_distribution_id_id (distribution_id, id)` — keyset cursor tối ưu.

**Grouping by channel**: Application layer — partition `channelId IS NULL` (distribution-level) vs có (channel-level). Không cần thêm index.

### 3.2 SSE Streaming Gateway (realtime push)

```ts
// infrastructure/sse/distribution-sse.service.ts
@Injectable()
export class DistributionSseService {
	private readonly streams = new Map<string, Subject<MessageEvent>>();

	getStream(distributionId: string): Observable<MessageEvent> {
		if (!this.streams.has(distributionId)) {
			this.streams.set(distributionId, new Subject<MessageEvent>());
		}
		return this.streams.get(distributionId)!.asObservable();
	}

	pushEvent(distributionId: string, event: TimelineEventDto): void {
		const stream = this.streams.get(distributionId);
		if (stream) {
			stream.next({
				data: event,
				id: String(event.id),
				type: event.type,
			});
		}
	}

	cleanup(distributionId: string): void {
		const stream = this.streams.get(distributionId);
		if (stream) {
			stream.complete();
			this.streams.delete(distributionId);
		}
	}

	// Hook từ OutboxRelay hoặc dedicated listener
	@OnEvent('distribution.event.saved')
	handleEventSaved(payload: {
		distributionId: string;
		event: TimelineEventDto;
	}): void {
		this.pushEvent(payload.distributionId, payload.event);
	}
}

// application/controllers/distribution.controller.ts
@Controller('distributions')
export class DistributionController {
	@Sse(':id/stream')
	streamEvents(
		@Param('id') id: string,
		@Res() response: Response,
	): Observable<MessageEvent> {
		// CRITICAL: cleanup on client disconnect → prevent memory leak
		response.on('close', () => this.sseService.cleanup(id));
		return this.sseService.getStream(id).pipe(
			// Optional: heartbeat every 30s to keep connection alive through proxies
			timeout(30000),
			catchError(() => of({ data: 'keepalive' })),
		);
	}

	@Get(':id/timeline')
	async getTimeline(
		@Param('id') id: string,
		@Query() query: TimelineQueryDto,
	) {
		return this.timelineQuery.getTimeline({ ...query, distributionId: id });
	}
}
```

**Memory leak guard:** `response.on('close')` cleanup Subject khi client disconnect. **Phải có** — không thì Map phình vô hạn.

**Fallback reconnect:** Client gửi `Last-Event-ID` header → server query `WHERE id > lastEventId` trả missed events khi reconnect.

### 3.3 Projection Handler (event → `release_dsp_delivery`)

```ts
// application/projection/release-dsp-delivery.projection.ts
interface ProjectionCheckpoint {
  name: string;       // PK: 'release_dsp_delivery'
  lastEventId: string; // bigint as string
}

@Injectable()
export class ReleaseDspDeliveryProjection {
  private readonly logger = new Logger(ReleaseDspDeliveryProjection.name);

  // Piggyback trên OutboxRelay hoặc dedicated @Cron
  async pollAndProject(batchSize = 200): Promise<number> {
    const checkpoint = await this.getCheckpoint('release_dsp_delivery');

    const events = await this.query<DistributionEventRow[]>(`
      SELECT de.id, de.distribution_id, de.channel_id, de.type, de.level,
             de.payload, de.occurred_at,
             d.release_id, cd.dsp_code
      FROM   distribution_event de
      JOIN   distribution d ON d.id = de.distribution_id
      LEFT JOIN channel_delivery cd ON cd.channel_id = de.channel_id
      WHERE  de.id > $1
      ORDER  BY de.id ASC
      LIMIT  $2
    `, [checkpoint.lastEventId, batchSize]);

    if (events.length === 0) return 0;

    for (const ev of events) {
      try {
        await this.applyEvent(ev);
      } catch (err) {
        this.logger.error(`Projection failed for event ${ev.id}`, err);
        // Skip or DLQ — không chặn batch
      }
      await this.advanceCheckpoint('release_dsp_delivery', ev.id);
    }

    return events.length;
  }

  private async applyEvent(ev: DistributionEventRow): Promise<void> {
    const mapper = EVENT_TO_STATUS_MAP[ev.type];
    if (!mapper) return; // Event không cần project vào read model

    const { status, hasLiveVersion, setEnqueuedAt, setDeliveredAt } = mapper(ev);

    if (ev.channelId && ev.dspCode) {
      // Channel-level event → update 1 dòng
      const dspId = await this.resolveDspId(ev.dspCode);
      await this.upsertDelivery({
        releaseId: ev.releaseId,
        dspId,
        status,
        hasLiveVersion,
        lastEnqueuedAt: setEnqueuedAt ? ev.occurredAt : undefined,
        lastDeliveredAt: setDeliveredAt ? ev.occurredAt : undefined,
      });
    } else {
      // Distribution-level event → update ALL dòng của releaseId
      await this.upsertAllDeliveries(ev.releaseId, { status, .../* mapper result */ });
    }
  }

  private async upsertDelivery(data: {
    releaseId: string;
    dspId: string;
    status?: ReleaseDspStatus;
    hasLiveVersion?: boolean;
    lastEnqueuedAt?: Date;
    lastDeliveredAt?: Date;
  }): Promise<void> {
    await this.query(`
      INSERT INTO release_dsp_delivery (release_id, dsp_id, status, has_live_version, last_enqueued_at, last_delivered_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (release_id, dsp_id) DO UPDATE
        SET status            = COALESCE(EXCLUDED.status, release_dsp_delivery.status),
            has_live_version  = COALESCE(EXCLUDED.has_live_version, release_dsp_delivery.has_live_version),
            last_enqueued_at  = COALESCE(EXCLUDED.last_enqueued_at, release_dsp_delivery.last_enqueued_at),
            last_delivered_at = COALESCE(EXCLUDED.last_delivered_at, release_dsp_delivery.last_delivered_at),
            updated_at        = now()
        WHERE EXCLUDED.status IS DISTINCT FROM release_dsp_delivery.status
           OR EXCLUDED.has_live_version IS DISTINCT FROM release_dsp_delivery.has_live_version
    `, [data.releaseId, data.dspId, data.status, data.hasLiveVersion, data.lastEnqueuedAt, data.lastDeliveredAt]);
  }
}

// Event → status mapping (theo spec domain events)
const EVENT_TO_STATUS_MAP: Record<string, (ev: DistributionEventRow) => ProjectionUpdate> = {
  'DistributionSubmitted': (ev) => ({ status: 'processing', setEnqueuedAt: true }),
  'ChannelLive': (ev) => ({ status: 'distributed', hasLiveVersion: true, setDeliveredAt: true }),
  'ChannelIssues': (ev) => ({ status: 'issues' }),
  'ChannelReset': (ev) => ({ status: 'processing', setEnqueuedAt: true }),
  'ChannelTakenDown': (ev) => ({ status: 'taken_down', hasLiveVersion: false }),
  'Distributed': (ev) => ({ status: 'distributed', hasLiveVersion: true, setDeliveredAt: true }),
  'PartiallyDistributed': (ev) => ({ status: 'processing' }), // UI cần hiện "5/8 DSP distributed"
  'DistributionFailed': (ev) => ({ status: 'issues' }),
  // Các event khác (IdsProvisioned, PackageBuilt, Validated) → không cập nhật release_dsp_delivery
};
```

**Idempotency:** UPSERT với `WHERE IS DISTINCT FROM` → replay event cũ = no-op, không ghi đè timestamp.

**Error handling:** Skip event lỗi projection + log + optional DLQ table; advance checkpoint để không chặn batch kế.

### 3.4 Schema Changes

```sql
-- Migration: 1784300000000-CreateProjectionCheckpoint.ts
CREATE TABLE projection_checkpoint (
  name         varchar(80) PRIMARY KEY,
  last_event_id bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed checkpoint cho read model
INSERT INTO projection_checkpoint (name, last_event_id)
VALUES ('release_dsp_delivery', 0);

-- Optional: DLQ table cho projection errors
CREATE TABLE projection_dead_letter (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_name varchar(80) NOT NULL,
  event_id     bigint NOT NULL,
  event_type   varchar(60),
  error_message text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IDX_projection_dead_letter_checkpoint ON projection_dead_letter (checkpoint_name, event_id);
```

**Không sửa `release_dsp_delivery`** — bảng đã có đủ cột: `status`, `hasLiveVersion`, `lastEnqueuedAt`, `lastDeliveredAt`, `logs`, `issues`.

**Optional index:** Nếu query `level = 'milestone'` chiếm đa số, thêm partial index:

```sql
CREATE INDEX IDX_distribution_event_milestone
  ON distribution_event (distribution_id, id)
  WHERE level = 'milestone';
```

Chờ profiling Step 5 mới quyết.

## Implementation Steps

### Step 1: Timeline Query Service + API endpoint (read-only, no writes)

- [ ] `DistributionTimelineQueryService.getTimeline()` — query `distribution_event` với cursor pagination
- [ ] REST endpoint `GET /distributions/:id/timeline` + DTO validation
- [ ] Integration test: submit release qua Phase 2 → query timeline assert events

**Exit:** API trả danh sách events filter theo `level`, cursor hoạt động.

### Step 2: SSE Gateway + EventEmitter2 hook

- [ ] `DistributionSseService` — Map Subject, `pushEvent()`, cleanup guard
- [ ] SSE endpoint `GET /distributions/:id/stream` + `response.on('close')`
- [ ] Hook vào `OutboxRelay.markDispatched()` — emit `'distribution.event.saved'` sau commit
- [ ] Test: connect SSE client → submit release → assert client nhận events <1s

**Exit:** SSE stream nhận events realtime; client disconnect không leak memory.

### Step 3: Projection handler (checkpoint + UPSERT)

- [x] Migration `projection_checkpoint` table + seed row
- [x] `ReleaseDspDeliveryProjection.pollAndProject()` — fetch events WHERE id > checkpoint
- [x] `applyEvent()` + `EVENT_TO_STATUS_MAP` — map event → UPSERT `release_dsp_delivery`
- [x] Dedicated `@Cron('*/10 * * * * *')` + module provider registration
- [x] Integration test (8 cases): channel/distribution-level events, idempotent replay, checkpoint advance, unknown event skip, multi-event lifecycle

**Exit:** Read model `release_dsp_delivery` đồng bộ từ events; checkpoint advance. ✅

### Step 4: Reconciliation + replay tooling

- [x] Reconciliation query `detectDrift()` — CTE so sánh latest status-bearing event vs read model
- [x] Admin tool: `resetCheckpoint()` + `resetAndReplay()` — replay events từ id=0
- [x] Projection DLQ table `projection_dead_letter` + migration + `writeDeadLetter()` on error
- [x] Monitoring: `getLagSeconds()` — checkpoint event timestamp vs now, returns 0 when caught up
- [x] Integration test (7 cases): replay rebuild, drift detection, lag metric, DLQ query, checkpoint reset

**Exit:** Audit script phát hiện drift; có cách rebuild read model từ event log. ✅

### Step 5: Performance tuning + observability

- [x] Profiling: partial index `IDX_distribution_event_milestone` cho milestone-only queries
- [x] SSE keepalive heartbeat 30s (`interval` + `takeUntil(stop$)`) — proxy timeout prevention
- [x] Metrics: `SseMetrics` (activeStreams, connections, events pushed) + `ProjectionMetrics` (events processed, errors, polls)
- [x] `GET /distributions/metrics` endpoint — combined SSE + projection + lag
- [x] Regression: 30/30 tests pass (SSE heartbeat cleanup verified)

**Exit:** Production-ready; SSE stable qua proxy; metrics endpoint sẵn sàng. ✅

## Todo

- [x] Step 1: Timeline Query Service + REST endpoint
- [x] Step 2: SSE Gateway + EventEmitter2 bridge
- [x] Step 3: Projection handler + checkpoint
- [x] Step 4: Reconciliation + replay tooling
- [x] Step 5: Performance tuning + monitoring ✅

## Success Criteria

- Timeline API `GET /distributions/:id/timeline?level=milestone` trả events đúng filter
- SSE `GET /distributions/:id/stream` push events <1s sau submit
- `release_dsp_delivery.status` cập nhật từ events (test: submit → wait 10s → assert 'distributed')
- Client disconnect SSE → cleanup Subject (memory không tăng)
- Projection checkpoint advance; replay từ id=0 rebuild read model đúng
- Integration test E2E: submit release → SSE nhận events → query timeline → assert read model

## Risk Assessment

- **EventEmitter2 single-instance:** Events mất khi crash. Mitigation: fallback poll `distribution_event` khi reconnect; Phase 4 thêm Redis nếu cần.
- **Projection lag >5s:** Nếu UI phàn nàn chậm → tách projection thành BullMQ job riêng (decoupled from relay).
- **SSE proxy timeout:** Reverse proxy (nginx/ALB) có thể kill connection im lặng. Mitigation: heartbeat keepalive 30s.
- **Out-of-order events:** Bigserial `id` đảm bảo INSERT order = event order (trong 1 transaction). Cross-transaction race: checkpoint tiến từng bước → at-most-once.
- **Concurrent distributions cho cùng release:** Nếu có 2 distribution cùng `releaseId` (vd RETRY overlap INITIAL) → UPSERT có thể overwrite status cũ bằng mới. Mitigation: thêm `distributionId` FK vào `release_dsp_delivery` (breaking change bảng v3 — cần discussion).

## Security Considerations

- Timeline API auth: RBAC check `user can read distribution/:id` (đã có ở Phase 2)
- SSE stream auth: validate JWT trong `Authorization` header trước subscribe
- Projection không log PII từ event payload (snapshot có tên nghệ sĩ/email)

## Next Steps

Sau Phase 3: **Phase 4** (ACL adapter thật cho 9 port — SFTP/CI/gRPC/email) có thể chạy song song với Phase 3 vì 2 concerns độc lập.

**Migration v3 → v-next:** Xen giữa Phase 2–3 (khi schema + event log ổn). Cần sub-plan riêng: map state v3 → state machine mới, backfill events cho distributions đang chạy.

## Unresolved Questions

1. **Multi-distribution per release:** Nếu cùng `releaseId` có 2 distributions đồng thời (RETRY + INITIAL) → UPSERT `release_dsp_delivery` cần `distributionId` FK để phân biệt? Hoặc rule nghiệp vụ chặn overlap?
2. **Projection lag SLA:** UI chấp nhận eventual consistency 5-10s hay cần <1s? Nếu <1s → tách projection job riêng, không piggyback relay.
3. **Level filter mặc định:** Timeline API trả `milestone` only (user view) hay `all` (admin)? Frontend filter client-side hay server-side?
4. **SSE `retry:` directive:** Client auto-reconnect interval bao nhiêu? 5s? 30s?
5. **Redis Pub/Sub timing:** Phase 4 thêm ngay hay đợi khi có 2+ instance deployment?
6. **Projection reconciliation frequency:** Cron mỗi 30 phút hay on-demand manual trigger?
7. **`release_dsp_delivery.logs` column:** Projection có nên ghi event error vào `logs` text không, hay để UI tự query `distribution_event` filter `ChannelIssues`?

## Research Reports Referenced

- SSE + EventEmitter2: `plans/reports/researcher-260718-1406-nestjs-sse-eventemitter2.md`
- CQRS projection: inline research agent output (checkpoint, UPSERT, keyset pagination, reconciliation)
