# NestJS SSE + EventEmitter2 for Realtime Distribution Events

## 1. NestJS SSE Implementation

**Basic Pattern**: Use `@Sse()` decorator returning RxJS `Observable<MessageEvent>`:

```typescript
@Injectable()
export class DistributionSseService {
  private streams = new Map<string, Subject<MessageEvent>>();

  getStream(distributionId: string): Observable<MessageEvent> {
    if (!this.streams.has(distributionId)) {
      this.streams.set(distributionId, new Subject<MessageEvent>());
    }
    return this.streams.get(distributionId)!.asObservable();
  }

  pushEvent(distributionId: string, event: MessageEvent) {
    this.streams.get(distributionId)?.next(event);
  }

  cleanup(distributionId: string) {
    const stream = this.streams.get(distributionId);
    stream?.complete();
    this.streams.delete(distributionId);
  }
}

@Controller('distributions')
export class DistributionSseController {
  @Sse(':id/stream')
  streamEvents(@Param('id') id: string, @Res() response: Response) {
    response.on('close', () => this.sseService.cleanup(id));
    return this.sseService.getStream(id);
  }
}
```

**Key Points**:
- Use `Subject` per distributionId (not global interval)
- Return `Observable<MessageEvent>` where `MessageEvent = { data: any; id?: string; type?: string }`
- **Critical**: Listen `response.on('close')` to cleanup Subject → prevent memory leak
- Hot observable (shared) vs cold (per-subscriber) matters for broadcast

## 2. EventEmitter2 Integration

**Pattern**: Emit domain events AFTER DB commit (in OutboxRelay):

```typescript
// outbox-relay.ts (after markDispatched)
await this.markDispatched(qr, row.id);
this.eventEmitter.emit('distribution.event.saved', {
  distributionId: row.payload.distributionId,
  event: row.payload, // full event data
});

// sse-service.ts
@OnEvent('distribution.event.saved')
handleEventSaved(payload: { distributionId: string; event: DistributionEvent }) {
  this.pushEvent(payload.distributionId, {
    data: payload.event,
    id: String(Date.now()),
  });
}
```

**Why after commit**: Outbox relay's `markDispatched` = confirmation event is durable in `distribution_event` table. Emit → SSE streams catch → push to connected clients.

## 3. Architecture Pattern

**Dual-path design**:
- **Primary (realtime)**: EventEmitter2 → SSE (sub-second latency)
- **Fallback (reconnect)**: Poll `distribution_event` table WHERE `id > lastEventId` (client reconnects with `Last-Event-ID` header)

**Why not WebSocket**: SSE simpler (HTTP, auto-reconnect), unidirectional sufficient for read-only event stream.

**Event filtering**: SSE controller filters by distributionId before streaming (client subscribes to `/distributions/{id}/stream`).

## 4. Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **EventEmitter2 in-process** | Zero infra, low latency (<10ms) | Single-instance only, lost events on crash |
| **Redis Pub/Sub** | Horizontal scale, survives restart | External dep, network latency (20-50ms) |
| **Polling only** | No memory mgmt, simple | High latency (5s), DB load |

**Recommendation**: Start with EventEmitter2 (project already has `@nestjs/event-emitter` v3.0.1). Phase 4: add Redis if multi-instance deployment required.

## Unresolved Questions

- Should SSE include `retry:` directive (client auto-reconnect interval)?
- Filter events by `level` (milestone only) or send all?
- Heartbeat/keepalive needed for proxy timeout handling?

---

**Sources**:
- [NestJS SSE Docs](https://docs.nestjs.com/techniques/server-sent-events)
- [SSE Event-Driven with Subject](https://openillumi.com/en/en-nestjs-sse-event-driven-with-rxjs-subject/)
- [SSE Broadcast Hot Stream Fix](https://openillumi.com/en/en-nestjs-sse-broadcast-issue-fix/)
- [SSE in NestJS In-Depth](https://dev.to/dmitryvz/server-sent-events-in-nestjs-in-depth-38nh)
