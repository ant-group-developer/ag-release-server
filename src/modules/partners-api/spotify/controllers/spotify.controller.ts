import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpotifyService } from '../services/spotify.service';
import { SpotifyService2 } from '../services/spotify2.service';

@ApiTags('Partners API - Spotify')
@Controller('partners/spotify')
export class SpotifyController {
	constructor(
		private readonly spotifyService: SpotifyService,
		private readonly spotifyService2: SpotifyService2,
	) {}

	@Post('token')
	async getToken(@Body() body: { clientId?: string; clientSecret?: string }) {
		return this.spotifyService.getToken(body?.clientId, body?.clientSecret);
	}

	@Get('artists/:id')
	async getArtistDetail(@Param('id') id: string) {
		return this.spotifyService2.getArtistDetail(id);
	}
}
