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
		const partners = this.appConfigService.getCache().config?.partners;
		const clientId = bodyClientId || partners?.spotify?.clientId;
		const clientSecret = bodyClientSecret || partners?.spotify?.clientSecret;

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
						// Authorization: 'Bearer BQCBByzQdM-BktTBAl1pW4tvDQUX74x02FlSaaApUB7GQ4s0n0To7u2iTvoniA7a-Df_KgqPksRGOTTlJYW1fkWuh07f3WwU6LAL2i02rdObl459uPRwQLqNr5mi69_QTgkJ14CU3wFDohdq76XLD3vMA0tWZvVNKBjdoEGlVVwPPzohkmoNgTQvkdG5e3sbQbp4sIQKW8hSF4Hfk19mbEJUcAfcycLe_bRzDZ92JAE9UqZhzQjDeVlDu06DcUWea4JyvncUWUtSZ7IaAxiPm_8gpWeV4Touz95PGD272SuvrIgSbb_oVePvmFPV1W-GaTE0_O7nC993dvBzae1GZB-WZoxJhgTWIBeG3gyPRO1Pf_-lGxJJ6pduoXDRY-uXAiD-MI9LRF1j62vueI4ph5mjhP5W'
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
