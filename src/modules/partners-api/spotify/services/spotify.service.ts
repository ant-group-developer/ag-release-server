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
			) ||
			process.env.SPOTIFY_CLIENT_ID;
		const clientSecret =
			bodyClientSecret ||
			this.appConfigService.getValue<string>(
				'config.partners.spotify.clientSecret',
			) ||
			process.env.SPOTIFY_CLIENT_SECRET;

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
}
