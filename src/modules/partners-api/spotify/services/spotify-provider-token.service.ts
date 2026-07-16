import { Injectable, Logger } from '@nestjs/common';
import { CiToolService } from '../../ci-tool/ci-tool.service';

interface TokenCache {
	token: string;
	expiresAt: Date;
}

@Injectable()
export class SpotifyProviderTokenService {
	private readonly logger = new Logger(SpotifyProviderTokenService.name);
	private cachedToken: TokenCache | null = null;

	constructor(private readonly ciToolService: CiToolService) {}

	async getToken(): Promise<string> {
		const now = new Date();
		const bufferMs = 60_000;

		if (this.cachedToken && this.cachedToken.expiresAt.getTime() - now.getTime() > bufferMs) {
			return this.cachedToken.token;
		}

		this.logger.log('Refreshing Spotify provider token via CI tool...');
		const { jobId } = await this.ciToolService.triggerSpotifyProviderRefreshToken();

		const token = await this.pollForToken(jobId);
		const expiresAt = new Date(now.getTime() + 55 * 60 * 1000);
		this.cachedToken = { token, expiresAt };
		this.logger.log(`Spotify provider token refreshed, expires at ${expiresAt.toISOString()}`);

		return token;
	}

	private async pollForToken(jobId: string): Promise<string> {
		const maxWaitMs = 60_000;
		const startTime = Date.now();
		let delay = 2_000;

		while (Date.now() - startTime < maxWaitMs) {
			const result = await this.ciToolService.getSpotifyProviderRefreshStatus(jobId);

			if (result.data.status === 'success') {
				if (!result.data.token?.access_token) {
					throw new Error('CI tool returned success but no access_token');
				}
				return result.data.token.access_token;
			}

			if (result.data.status === 'failed') {
				throw new Error(`CI tool token refresh failed: ${result.data.error ?? 'unknown error'}`);
			}

			await new Promise((resolve) => setTimeout(resolve, delay));
			delay = Math.min(delay * 1.5, 10_000);
		}

		throw new Error(`CI tool token refresh timed out after ${maxWaitMs}ms`);
	}
}
