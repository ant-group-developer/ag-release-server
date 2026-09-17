import { Injectable } from '@nestjs/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { IsrcService } from 'src/modules/external/isrc/isrc.service';
import { UpcService } from 'src/modules/external/upc/upc.service';
import {
	IdentifierProvisioner,
	ProvisionIsrcInput,
	ProvisionUpcInput,
	ProvisionedIdentifier,
} from '../../application/ports/identifier-provisioner.port';

/**
 * Anti-corruption adapter around the existing generator clients.
 *
 * The old clients remain available to old flows.  V2 adds only the
 * requestId/releaseId/trackId fields and uses this adapter from the isolated
 * worker process.
 */
@Injectable()
export class DistributionV2IdentifierProvisionerAdapter implements IdentifierProvisioner {
	constructor(
		private readonly upcService: UpcService,
		private readonly isrcService: IsrcService,
		private readonly appConfig: AppConfigService,
	) {}

	async provisionUpc(
		input: ProvisionUpcInput,
	): Promise<ProvisionedIdentifier> {
		const prefixUpcId =
			(input.prefixUpcId &&
				input.prefixUpcId !== 'configured-by-adapter' &&
				input.prefixUpcId) ||
			this.appConfig.getValue<string>(
				'config.generator.prefixUpcDefaultId',
			);
		if (!prefixUpcId) {
			throw new Error(
				'Generator prefixUpcDefaultId is not configured for distribution-v2',
			);
		}

		const response = await this.upcService.getUpc({
			prefixUpcId,
			description: input.description ?? undefined,
			requestId: input.requestId,
			releaseId: input.releaseId,
		});
		const value = response?.upc?.trim();
		if (!value) {
			throw new Error('UPC generator returned an empty identifier');
		}

		return {
			kind: 'UPC',
			value,
			requestId: input.requestId,
			response: response as unknown as Record<string, unknown>,
		};
	}

	async provisionIsrc(
		input: ProvisionIsrcInput,
	): Promise<ProvisionedIdentifier> {
		const prefixIsrcId =
			(input.prefixIsrcId &&
				input.prefixIsrcId !== 'configured-by-adapter' &&
				input.prefixIsrcId) ||
			this.appConfig.getValue<string>(
				'config.generator.prefixIsrcDefaultId',
			);
		if (!prefixIsrcId) {
			throw new Error(
				'Generator prefixIsrcDefaultId is not configured for distribution-v2',
			);
		}

		const response = await this.isrcService.create({
			registrantName: input.registrantName ?? 'ANT GROUP',
			recordingArtist: input.recordingArtist ?? 'Various Artists',
			recordingTitle: input.recordingTitle ?? input.trackId,
			versionTitle: input.versionTitle ?? '',
			assetType: input.assetType,
			immersive: input.immersive ?? false,
			explicit: input.explicit ?? false,
			yearOfProduction:
				input.yearOfProduction ?? new Date().getUTCFullYear(),
			duration: input.duration ?? 0,
			isAdded: input.isAdded ?? false,
			prefixIsrcId,
			requestId: input.requestId,
			trackId: input.trackId,
		});
		const value = response?.data?.code?.trim();
		if (!value) {
			throw new Error('ISRC generator returned an empty identifier');
		}

		return {
			kind: 'ISRC',
			value,
			requestId: input.requestId,
			externalId: response.data?.id ?? null,
			response: response as unknown as Record<string, unknown>,
		};
	}
}
