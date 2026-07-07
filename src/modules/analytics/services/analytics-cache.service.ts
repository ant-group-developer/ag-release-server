import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

@Injectable()
export class AnalyticsCacheService {
	private readonly logger = new Logger(AnalyticsCacheService.name);

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

		const promise = loader()
			.then((value) => {
				this.cache.set(key, value);
				return value;
			})
			.finally(() => {
				this.inflight.delete(key);
			});

		this.inflight.set(key, promise);
		return promise;
	}

	clear(): void {
		this.cache.clear();
		this.inflight.clear();
	}
}
