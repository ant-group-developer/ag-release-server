import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
	Optional,
} from '@nestjs/common';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

@Injectable()
export class AnalyticsCacheService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(AnalyticsCacheService.name);
	private generation = 0;
	private subscriber?: Redis;

	constructor(@Optional() @InjectRedis() private readonly redis?: Redis) {}

	async onModuleInit() {
		if (!this.redis) return;
		this.subscriber = this.redis.duplicate();
		this.subscriber.on('message', (channel) => {
			if (channel === 'analytics:invalidate') this.clear();
		});
		this.subscriber.on('error', (error) =>
			this.logger.warn(`Analytics cache subscription: ${error.message}`),
		);
		await this.subscriber.subscribe('analytics:invalidate');
	}

	onModuleDestroy() {
		this.subscriber?.disconnect();
	}

	private readonly cache = new LRUCache<string, object>({
		max: 500,
		ttl: 60_000, // 60s
		updateAgeOnGet: false,
	});

	private readonly inflight = new Map<string, Promise<object>>();

	buildKey(namespace: string, tenantId: string, query: object): string {
		const normalized = this.stableStringify(query);
		return `${namespace}:${tenantId}:${normalized}`;
	}

	private stableStringify(value: unknown): string {
		if (value === null || typeof value !== 'object')
			return JSON.stringify(value);
		if (Array.isArray(value)) {
			return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
		}
		const obj = value as Record<string, unknown>;
		const keys = Object.keys(obj).sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${this.stableStringify(obj[k])}`).join(',')}}`;
	}

	get<T extends object>(key: string): T | undefined {
		return this.cache.get(key) as T | undefined;
	}

	set<T extends object>(key: string, value: T): void {
		this.cache.set(key, value);
	}

	async wrap<T extends object>(
		key: string,
		loader: () => Promise<T>,
	): Promise<T> {
		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return cached as T;
		}

		const existing = this.inflight.get(key);
		if (existing) {
			return existing as Promise<T>;
		}

		const generation = this.generation;
		const promise = loader()
			.then((value) => {
				if (generation === this.generation) this.cache.set(key, value);
				return value;
			})
			.finally(() => {
				if (generation === this.generation) this.inflight.delete(key);
			});

		this.inflight.set(key, promise);
		return promise;
	}

	clear(): void {
		this.generation++;
		this.cache.clear();
		this.inflight.clear();
	}
}
