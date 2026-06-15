import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';

@Injectable()
export class SpotifyService {
	private readonly logger = new Logger(SpotifyService.name);
	private resToken: {
		access_token: string;
		expires_in: number;
	} = {
		access_token: '',
		expires_in: 0,
	};

	private tokenTimeout: NodeJS.Timeout | null = null;

	constructor(private readonly appConfigService: AppConfigService) {}

	async getToken(bodyClientId?: string, bodyClientSecret?: string) {
		const clientId =
			bodyClientId ||
			this.appConfigService.getValue<string>(
				'config.partners.spotify.clientId',
			);
		const clientSecret =
			bodyClientSecret ||
			this.appConfigService.getValue<string>(
				'config.partners.spotify.clientSecret',
			);

		if (!clientId || !clientSecret) {
			throw new Error('Spotify credentials not configured');
		}

		const authString = Buffer.from(`${clientId}:${clientSecret}`).toString(
			'base64',
		);

		try {
			const response = await axios.post(
				'https://accounts.spotify.com/api/token',
				'grant_type=client_credentials',
				{
					headers: {
						Authorization: `Basic ${authString}`,
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				},
			);

			const data = response.data; // { access_token, token_type, expires_in }

			this.resToken = {
				access_token: data.access_token,
				expires_in: data.expires_in,
			};

			if (this.tokenTimeout) {
				clearTimeout(this.tokenTimeout);
			}

			// Clear token exactly when it expires (or 5 seconds earlier to be safe)
			const timeoutMs = Math.max((data.expires_in - 5) * 1000, 0);
			this.tokenTimeout = setTimeout(() => {
				this.resToken = { access_token: '', expires_in: 0 };
			}, timeoutMs);

			this.logger.log(
				`token spotify: ${data.access_token}`,
			);

			return data;
		} catch (error: any) {
			this.logger.error(
				`Failed to get Spotify token: ${error.response?.data?.error || error.message}`,
			);
			throw error;
		}
	}

	async getCacheToken() {
		if (!this.resToken.access_token) {
			await this.getToken();
		}
		return this.resToken.access_token;
	}

	async getArtistDetail(artistId: string) {
		try {
			const response = await axios.get(
				`https://api.spotify.com/v1/artists/${artistId}`,
				{
					headers: {
						Authorization: `Bearer ${await this.getCacheToken()}`,
					},
				},
			);

			return response.data;
		} catch (error: any) {
			this.logger.error(
				`Failed to get Spotify artist detail: ${error.response?.data?.error?.message || error.message}`,
			);
			throw error;
		}
	}

	private readonly logger2 = new Logger('SpotifyRequestQueue');
	private readonly requestQueue = new RequestQueue(2, 300, this.logger2);

	/**
	 * Enqueue a task to be executed using the centralized Spotify request queue.
	 * All Spotify API calls MUST go through this to respect rate limits.
	 */
	enqueue<T>(fn: () => Promise<T>): Promise<T> {
		return this.requestQueue.add(fn);
	}

	getQueueStats() {
		return this.requestQueue.getStats();
	}
}

class RequestQueue {
	private queue: Array<{
		fn: () => Promise<any>;
		resolve: (value: any) => void;
		reject: (reason?: any) => void;
	}> = [];
	private activeCount = 0;
	private requestTimestamps: number[] = [];
	private readonly windowMs = 60_000; // 1 minute sliding window

	constructor(
		private readonly maxConcurrency: number,
		private readonly maxRequestsPerMinute: number,
		private readonly logger: Logger,
	) {}

	add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({ fn, resolve, reject });
			this.next();
		});
	}

	getStats() {
		return {
			queueLength: this.queue.length,
			activeCount: this.activeCount,
			requestsPerMinute: this.getRequestsInWindow(),
			maxRequestsPerMinute: this.maxRequestsPerMinute,
		};
	}

	private getRequestsInWindow(): number {
		const now = Date.now();
		const cutoff = now - this.windowMs;
		this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);
		return this.requestTimestamps.length;
	}

	private async waitForRateLimit(): Promise<void> {
		const currentRate = this.getRequestsInWindow();
		if (currentRate < this.maxRequestsPerMinute) {
			return;
		}

		// Calculate how long to wait until the oldest request in the window expires
		const oldest = this.requestTimestamps[0];
		const waitMs = oldest + this.windowMs - Date.now() + 100; // +100ms buffer
		if (waitMs > 0) {
			this.logger.warn(
				`[Rate Limit] Hit ${currentRate}/${this.maxRequestsPerMinute} req/min cap. ` +
				`Pausing ${waitMs}ms. Queue depth: ${this.queue.length}`,
			);
			await new Promise((r) => setTimeout(r, waitMs));
		}
	}

	private async next() {
		if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
			return;
		}

		this.activeCount++;
		const { fn, resolve, reject } = this.queue.shift()!;

		try {
			// Wait if rate limit would be exceeded
			await this.waitForRateLimit();

			// Track this request
			this.requestTimestamps.push(Date.now());
			const rpm = this.getRequestsInWindow();

			// Log every 10th request to reduce spam
			if (rpm % 10 === 0 || rpm >= this.maxRequestsPerMinute - 5) {
				this.logger.log(`[Spotify API] Rate: ${rpm}/${this.maxRequestsPerMinute} req/min | Queue: ${this.queue.length} | Active: ${this.activeCount}`);
			}

			const result = await fn();
			resolve(result);
		} catch (error) {
			reject(error);
		} finally {
			this.activeCount--;
			this.next();
		}
	}
}
