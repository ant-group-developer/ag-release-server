```mermaid
sequenceDiagram
    participant Agg as Distribution Aggregate
    participant Repo as DistributionRepository
    participant DB as Postgres
    participant Relay as OutboxRelay (5s cron)
    participant EM as EventEmitter2
    participant SSE as SSE Gateway
    participant Proj as Projection Handler
    participant RDD as release_dsp_delivery

    Note over Agg,DB: WRITE-SIDE (Phase 2)
    Agg->>Agg: apply(command) → state transition
    Agg->>Agg: pullDomainEvents() → [events]
    Agg->>Repo: saveWithOutbox(dist, events)
    Repo->>DB: BEGIN TX
    Repo->>DB: UPDATE distribution SET state=...
    Repo->>DB: UPSERT channel_delivery
    Repo->>DB: INSERT distribution_event (append-only)
    Repo->>DB: INSERT outbox_event
    Repo->>DB: COMMIT
    
    Note over Relay,Proj: READ-SIDE (Phase 3)
    
    loop Every 5s
        Relay->>DB: SELECT outbox_event WHERE dispatched_at IS NULL FOR UPDATE SKIP LOCKED
        Relay->>Relay: enqueue to BullMQ
        Relay->>DB: UPDATE outbox_event SET dispatched_at=now()
        Relay->>EM: emit('distribution.event.saved', event) [in-process]
    end
    
    Note over SSE: Realtime push (primary path)
    EM-->>SSE: @OnEvent('distribution.event.saved')
    SSE->>SSE: pushEvent(distributionId, event)
    SSE-->>Client: SSE stream → data: {...}
    
    Note over Proj: Projection (eventual consistency)
    loop Piggyback relay tick or dedicated @Cron
        Proj->>DB: SELECT checkpoint.last_event_id
        Proj->>DB: SELECT distribution_event WHERE id > checkpoint<br/>JOIN distribution, channel_delivery
        Proj->>Proj: applyEvent() → map type to status
        Proj->>RDD: UPSERT release_dsp_delivery<br/>SET status, hasLiveVersion, timestamps<br/>WHERE IS DISTINCT FROM
        Proj->>DB: UPDATE checkpoint SET last_event_id = latest
    end
    
    Note over Client,RDD: Query paths
    Client->>API: GET /distributions/:id/timeline?level=milestone
    API->>DB: SELECT distribution_event<br/>WHERE distributionId AND level<br/>AND id > cursor ORDER BY id
    DB-->>API: events[]
    API-->>Client: {items, nextCursor}
    
    Client->>SSE: GET /distributions/:id/stream (long-lived connection)
    SSE-->>Client: event: DistributionSubmitted
    SSE-->>Client: event: ChannelLive
    Note over Client: Client reconnect with Last-Event-ID header
    Client->>API: Last-Event-ID: 12345
    API->>DB: SELECT WHERE id > 12345 (fallback)
    DB-->>Client: missed events
```

## Architecture Diagram — Phase 3 Timeline + SSE

### Flow giải thích

1. **Write-side (Phase 2):** Aggregate apply → repo saveWithOutbox → INSERT `distribution_event` + `outbox_event` cùng transaction
2. **OutboxRelay (bridge):** Poll outbox 5s → dispatch BullMQ → mark dispatched → **emit EventEmitter2** in-process
3. **SSE realtime (primary):** EventEmitter2 → SSE gateway catches → push to connected clients (<1s latency)
4. **Projection (eventual):** Poll `distribution_event WHERE id > checkpoint` → map event → UPSERT `release_dsp_delivery` status
5. **Query paths:**
   - Timeline API: keyset cursor pagination `WHERE id > cursor`
   - SSE stream: long-lived connection, auto-reconnect với `Last-Event-ID` fallback

### Key components

- **EventEmitter2:** In-process event bus (zero infra, single-instance)
- **SSE Gateway:** `Map<distributionId, Subject<MessageEvent>>` — one Subject per distribution
- **Projection Handler:** Checkpoint-based polling → idempotent UPSERT với `IS DISTINCT FROM` guard
- **Dual-path:** EventEmitter2 (fast) + poll `distribution_event` (fallback reconnect)

### Critical guards

- `response.on('close')` cleanup Subject → prevent memory leak
- `WHERE IS DISTINCT FROM` trong UPSERT → replay event cũ = no-op
- Checkpoint `last_event_id` bigint → at-most-once processing per batch
