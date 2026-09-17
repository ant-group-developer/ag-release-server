import { DistributionV2IdentifierProvisionerAdapter } from './distribution-v2-identifier-provisioner.adapter';

describe('DistributionV2IdentifierProvisionerAdapter', () => {
	it('forwards additive UPC request context and normalizes the result', async () => {
		const upcService = {
			getUpc: jest.fn().mockResolvedValue({ upc: ' 0085008065001 ' }),
		};
		const isrcService = { create: jest.fn() };
		const appConfig = {
			getValue: jest.fn().mockReturnValue('prefix-upc'),
		};
		const adapter = new DistributionV2IdentifierProvisionerAdapter(
			upcService as any,
			isrcService as any,
			appConfig as any,
		);

		const result = await adapter.provisionUpc({
			requestId: 'distribution-v2:upc:1',
			consumer: 'distribution-v2',
			releaseId: 'release-1',
			idempotencyKey: 'distribution-v2:upc:1',
			description: 'Release 1',
		});

		expect(upcService.getUpc).toHaveBeenCalledWith({
			prefixUpcId: 'prefix-upc',
			description: 'Release 1',
			requestId: 'distribution-v2:upc:1',
			releaseId: 'release-1',
		});
		expect(result).toMatchObject({
			kind: 'UPC',
			value: '0085008065001',
			requestId: 'distribution-v2:upc:1',
		});
	});

	it('forwards additive ISRC request context and returns the generator id', async () => {
		const upcService = { getUpc: jest.fn() };
		const isrcService = {
			create: jest.fn().mockResolvedValue({
				data: { id: 'isrc-row-1', code: 'VNABC2600001' },
				message: 'Success',
			}),
		};
		const appConfig = {
			getValue: jest.fn().mockReturnValue('prefix-isrc'),
		};
		const adapter = new DistributionV2IdentifierProvisionerAdapter(
			upcService as any,
			isrcService as any,
			appConfig as any,
		);

		const result = await adapter.provisionIsrc({
			requestId: 'distribution-v2:isrc:track-1',
			consumer: 'distribution-v2',
			trackId: 'track-1',
			idempotencyKey: 'distribution-v2:isrc:track-1',
			registrantName: 'ANT GROUP',
			recordingArtist: 'Artist',
			recordingTitle: 'Song',
			versionTitle: null,
			assetType: 'AUDIO',
			yearOfProduction: 2026,
			duration: 180,
		});

		expect(isrcService.create).toHaveBeenCalledWith(
			expect.objectContaining({
				prefixIsrcId: 'prefix-isrc',
				requestId: 'distribution-v2:isrc:track-1',
				trackId: 'track-1',
				assetType: 'AUDIO',
			}),
		);
		expect(result).toMatchObject({
			kind: 'ISRC',
			value: 'VNABC2600001',
			externalId: 'isrc-row-1',
		});
	});
});
