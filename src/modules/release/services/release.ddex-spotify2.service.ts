import { Injectable, OnModuleInit } from '@nestjs/common';

import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { DspService } from 'src/modules/dsp/services/dsp.service';
import { ReleaseDdexService } from './release-ddex.service';

@Injectable()
export class ReleaseSpotifyService2 implements OnModuleInit {
	private DDEX_PARTY_ID_SPOTIFY: string;
	private DDEX_PARTY_NAME_SPOTIFY: string;

	constructor(
		private readonly dspSv: DspService,
		private readonly appConfigSv: AppConfigService,
		private readonly releaseDdexService: ReleaseDdexService,
	) {}

	@OnEvent(AppEvent.UPDATE_DDEX_PARTY)
	async handleDdexPartyUpdated() {
		await this.reloadConfig();
	}

	async onModuleInit() {
		await this.reloadConfig();
	}

	private async reloadConfig() {
		const { ddexId, ddexName } = await this.dspSv.getDdexPartySpotify();

		this.DDEX_PARTY_ID_SPOTIFY = ddexId;
		this.DDEX_PARTY_NAME_SPOTIFY = ddexName;
	}

	async createMetadataSpotifyOnServer(releaseId: string) {
		await this.releaseDdexService.createMetadataOnServer({
			releaseId,
			ernVersion: '4.3',
			sender: {
				partyId: this.appConfigSv.DDEX_PARTY_ID_AMG(),
				name: this.appConfigSv.DDEX_PARTY_NAME_AMG(),
			},
			recipient: {
				partyId: this.DDEX_PARTY_ID_SPOTIFY,
				name: this.DDEX_PARTY_NAME_SPOTIFY,
			},
		});
	}

	async uploadMetadataSpotifyToSftp(releaseId: string) {
		await this.releaseDdexService.uploadMetadataDdexSpotifyToSftp(
			releaseId,
		);
	}

	//
	async createAndUploadMetadataSpotify(releaseId: string) {
		await this.createMetadataSpotifyOnServer(releaseId);
		await this.uploadMetadataSpotifyToSftp(releaseId);
	}
}
