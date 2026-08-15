import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface JobEvent {
	jobId: string;
	type: 'progress' | 'completed' | 'failed' | 'cancelled' | 'snapshot';
	data: Record<string, any>;
	timestamp: string;
}

const JOB_EVENTS_CHANNEL = 'job_events';
const JOB_CANCEL_CHANNEL = 'job_cancel';


@Injectable()
export class JobEventsGateway implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(JobEventsGateway.name);
	private readonly stream$ = new Subject<JobEvent>();
	private readonly cancel$ = new Subject<string>();
	private subscriber?: Redis;

	constructor(@InjectRedis() private readonly redis: Redis) {}

	async onModuleInit(): Promise<void> {
		// duplicate() vì connection ở subscribe mode không dùng được cho command khác.
		this.subscriber = this.redis.duplicate();

		this.subscriber.on('error', (err) => {
			this.logger.error(`Job events subscriber error: ${err.message}`);
		});

		this.subscriber.on('message', (channel: string, payload: string) => {
			try {
				if (channel === JOB_EVENTS_CHANNEL) {
					this.stream$.next(JSON.parse(payload) as JobEvent);
				} else if (channel === JOB_CANCEL_CHANNEL) {
					const parsed = JSON.parse(payload) as { jobId?: string };
					if (parsed.jobId) this.cancel$.next(parsed.jobId);
				}
			} catch (err) {
				this.logger.warn(
					`Dropped malformed message on ${channel}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		});

		await this.subscriber.subscribe(
			JOB_EVENTS_CHANNEL,
			JOB_CANCEL_CHANNEL,
		);
		this.logger.log('Job events gateway subscribed to Redis pub/sub');
	}

	async onModuleDestroy(): Promise<void> {
		if (!this.subscriber) return;
		await this.subscriber.unsubscribe().catch(() => undefined);
		this.subscriber.disconnect();
		this.subscriber = undefined;
	}

	/**
	 * Publish event tới mọi process. Fire-and-forget — progress event mất một cái
	 * không sao (SSE có poll fallback), và caller đang ở hot path.
	 */
	emit(event: JobEvent): void {
		this.redis
			.publish(JOB_EVENTS_CHANNEL, JSON.stringify(event))
			.catch((err) => {
				this.logger.warn(
					`Failed to publish job event ${event.jobId}: ${err.message}`,
				);
			});
	}

	subscribe(jobId: string): Observable<JobEvent> {
		return this.stream$
			.asObservable()
			.pipe(filter((evt) => evt.jobId === jobId));
	}

	/** Broadcast yêu cầu cancel tới process đang giữ worker thread của job. */
	publishCancel(jobId: string): void {
		this.redis
			.publish(JOB_CANCEL_CHANNEL, JSON.stringify({ jobId }))
			.catch((err) => {
				this.logger.warn(
					`Failed to publish cancel for ${jobId}: ${err.message}`,
				);
			});
	}

	/** Stream jobId bị yêu cầu cancel — ExportWorkerPoolService subscribe. */
	onCancelRequest(): Observable<string> {
		return this.cancel$.asObservable();
	}
}
