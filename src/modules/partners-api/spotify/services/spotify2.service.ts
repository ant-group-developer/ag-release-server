import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from 'src/modules/app-config/app-config.service';

@Injectable()
export class SpotifyService2 {
	private readonly logger = new Logger(SpotifyService2.name);

	constructor(private readonly appConfigService: AppConfigService) {}

	async getArtistDetail(artistId: string) {
		try {
			const partners = this.appConfigService.getCache().config?.partners;
			const token = partners?.spotify?.token;

			if (!token) {
				throw new Error('Spotify direct token not configured');
			}

			const response = await axios.get(
				`https://api.spotify.com/v1/artists/${artistId}`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
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
