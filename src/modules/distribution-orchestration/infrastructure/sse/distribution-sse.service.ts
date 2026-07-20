import {
	Injectable,
	Logger,
	MessageEvent,
	OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { interval, map, merge, Observable, Subject, takeUntil } from 'rxjs';
import { DISTRIBUTION_EVENT_SAVED } from '../../application/events/distribution-sse-event-names';
import { TimelineEventDto } from '../../application/queries/distribution-timeline.query';

export interface DistributionEventSavedPayload {
	distributionId: string;
	event: TimelineEventDto;
}

/** Heartbeat interval in ms — keeps SSE connection alive through reverse proxies (nginx/ALB). */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * DistributionSseService — manages per-distributionId RxJS Subject streams.
 *
 * Lifecycle:
 *   getOrCreateStream(id) → subscribe (caller returns Observable to NestJS SSE)
 *   response.on('close')  → cleanup(id) — complete + delete Subject to prevent leak
 *   EventEmitter2 emits 'distribution.event.saved' → handleEventSaved → pushEvent
 *
 * Heartbeat: merges interval(30s) keepalive into each stream to prevent proxy timeout.
 *   Uses per-stream stop$ signal via takeUntil — cleanup() fires stop$ to kill heartbeat interval.
 * Metrics: in-process counters for connections, events pushed, and active streams.
 */
@Injectable()
export class DistributionSseService implements OnModuleDestroy {
	private readonly logger = new Logger(DistributionSseService.name);
	private readonly streams = new Map<string, Subject<MessageEvent>>();
	/** Per-stream stop signal — fires on cleanup() to kill heartbeat interval. */
	private readonly stopSignals = new Map<string, Subject<void>>();

	// ── Metrics (in-process, read via getMetrics()) ──
	private _connectionsTotal = 0;
	private _disconnectionsTotal = 0;
	private _eventsPushedTotal = 0;

	getOrCreateStream(distributionId: string): Observable<MessageEvent> {
		if (!this.streams.has(distributionId)) {
			this.streams.set(distributionId, new Subject<MessageEvent>());
			this.stopSignals.set(distributionId, new Subject<void>());
		}
		this._connectionsTotal++;

		const events$ = this.streams.get(distributionId)!.asObservable();
		const stop$ = this.stopSignals.get(distributionId)!;

		// Heartbeat: SSE comment event every 30s — keeps connection alive through proxies
		// takeUntil(stop$) ensures interval is killed when cleanup() fires
		const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
			takeUntil(stop$),
			map((): MessageEvent => ({ data: '', type: 'keepalive' })),
		);

		return merge(events$, heartbeat$);
	}

	pushEvent(distributionId: string, event: TimelineEventDto): void {
		this.streams.get(distributionId)?.next({
			data: event,
			id: event.id,
			type: event.type,
		});
		if (this.streams.has(distributionId)) {
			this._eventsPushedTotal++;
		}
	}

	/** Must be called on client disconnect — prevents Subject Map from growing unboundedly. */
	cleanup(distributionId: string): void {
		const stop = this.stopSignals.get(distributionId);
		if (stop) {
			stop.next();
			stop.complete();
			this.stopSignals.delete(distributionId);
		}
		const subject = this.streams.get(distributionId);
		if (subject) {
			subject.complete();
			this.streams.delete(distributionId);
			this._disconnectionsTotal++;
		}
	}

	onModuleDestroy(): void {
		for (const stop of this.stopSignals.values()) {
			stop.next();
			stop.complete();
		}
		this.stopSignals.clear();
		for (const subject of this.streams.values()) {
			subject.complete();
		}
		this.streams.clear();
	}

	@OnEvent(DISTRIBUTION_EVENT_SAVED)
	handleEventSaved(payload: DistributionEventSavedPayload): void {
		this.pushEvent(payload.distributionId, payload.event);
	}

	// ── Observability ────────────────────────────────────────────

	/** In-process metrics snapshot — no external dependency needed. */
	getMetrics(): SseMetrics {
		return {
			activeStreams: this.streams.size,
			connectionsTotal: this._connectionsTotal,
			disconnectionsTotal: this._disconnectionsTotal,
			eventsPushedTotal: this._eventsPushedTotal,
		};
	}
}

export interface SseMetrics {
	activeStreams: number;
	connectionsTotal: number;
	disconnectionsTotal: number;
	eventsPushedTotal: number;
}
