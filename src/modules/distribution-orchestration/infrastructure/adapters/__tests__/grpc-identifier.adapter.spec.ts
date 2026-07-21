import { AppConfigService } from '../../../../app-config/app-config.service';
import { IsrcService } from '../../../../external/isrc/isrc.service';
import { UpcService } from '../../../../external/upc/upc.service';
import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { Isrc } from '../../../domain/value-objects/isrc.vo';
import { Upc } from '../../../domain/value-objects/upc.vo';
import { GrpcIdentifierAdapter } from '../grpc-identifier.adapter';

const MOCK_PREFIX_UPC_ID = '087b9cd8-21ae-430b-9ea6-562be852826a';
const MOCK_PREFIX_ISRC_ID = '3aac625d-1d2f-4201-b103-72e1f0444389';

const mockAppConfig = {
	cache: {
		config: {
			generator: {
				prefixUpcDefaultId: MOCK_PREFIX_UPC_ID,
				prefixIsrcDefaultId: MOCK_PREFIX_ISRC_ID,
			},
		},
	},
} as unknown as AppConfigService;

const mockSnapshot = {
	payload: {
		id: 'rel-001',
		label: { name: 'ANT MUSIC LLC' },
		tracks: [
			{
				id: 'track-001',
				title: 'Song One',
				version: 'Radio Edit',
				order: 1,
				trackSensitive: { code: 'EXPLICIT' },
				pLineYear: 2026,
				audioFile: { duration: 210 },
				trackArtists: [{ artist: { name: 'Test Artist' } }],
			},
			{
				id: 'track-002',
				title: 'Song Two',
				order: 2,
				trackSensitive: { code: 'NOT_EXPLICIT' },
				audioFile: { duration: 180 },
				trackArtists: [{ artist: { name: 'Test Artist' } }],
			},
		],
	},
};

describe('GrpcIdentifierAdapter', () => {
	let adapter: GrpcIdentifierAdapter;
	let upcService: jest.Mocked<UpcService>;
	let isrcService: jest.Mocked<IsrcService>;
	let snapshotRepo: { findOne: jest.Mock };

	beforeEach(() => {
		upcService = {
			getUpc: jest.fn(),
		} as any;

		isrcService = {
			create: jest.fn(),
		} as any;

		snapshotRepo = {
			findOne: jest.fn(),
		};

		adapter = new GrpcIdentifierAdapter(
			upcService,
			isrcService,
			mockAppConfig,
			snapshotRepo as any,
		);
	});

	describe('provisionUpc', () => {
		it('calls UpcService.getUpc with prefixUpcDefaultId and returns Upc VO', async () => {
			upcService.getUpc.mockResolvedValue({
				upc: '0850080651804',
				message: 'ok',
			});

			const result = await adapter.provisionUpc({
				releaseId: 'rel-001',
				key: IdempotencyKey.create('test-key'),
			});

			expect(upcService.getUpc).toHaveBeenCalledWith({
				prefixUpcId: MOCK_PREFIX_UPC_ID,
			});
			expect(result).toBeInstanceOf(Upc);
			expect(result.value).toBe('0850080651804');
		});

		it('throws when UPC service returns empty', async () => {
			upcService.getUpc.mockResolvedValue({
				upc: '',
				message: 'empty',
			});

			await expect(
				adapter.provisionUpc({
					releaseId: 'rel-001',
					key: IdempotencyKey.create('test-key'),
				}),
			).rejects.toThrow(/empty GTIN/);
		});

		it('throws when prefixUpcDefaultId is not configured', async () => {
			const noConfig = new GrpcIdentifierAdapter(
				upcService,
				isrcService,
				{
					cache: {
						config: { generator: { prefixUpcDefaultId: '' } },
					},
				} as any,
				snapshotRepo as any,
			);

			await expect(
				noConfig.provisionUpc({
					releaseId: 'rel-001',
					key: IdempotencyKey.create('test-key'),
				}),
			).rejects.toThrow(/prefixUpcDefaultId not configured/);
		});
	});

	describe('provisionIsrcs', () => {
		beforeEach(() => {
			snapshotRepo.findOne.mockResolvedValue(mockSnapshot);
		});

		it('provisions ISRCs for multiple tracks', async () => {
			isrcService.create
				.mockResolvedValueOnce({
					data: { code: 'QT6KL2600001' },
					message: 'ok',
				} as any)
				.mockResolvedValueOnce({
					data: { code: 'QT6KL2600002' },
					message: 'ok',
				} as any);

			const result = await adapter.provisionIsrcs({
				trackIds: ['track-001', 'track-002'],
				releaseId: 'rel-001',
				key: IdempotencyKey.create('test-key'),
			});

			expect(result.size).toBe(2);
			expect(result.get('track-001')).toBeInstanceOf(Isrc);
			expect(result.get('track-001')!.value).toBe('QT6KL2600001');
			expect(result.get('track-002')!.value).toBe('QT6KL2600002');
		});

		it('maps track metadata correctly to ISRC payload', async () => {
			isrcService.create.mockResolvedValue({
				data: { code: 'QT6KL2600001' },
				message: 'ok',
			} as any);

			await adapter.provisionIsrcs({
				trackIds: ['track-001'],
				releaseId: 'rel-001',
				key: IdempotencyKey.create('test-key'),
			});

			expect(isrcService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					registrantName: 'ANT MUSIC LLC',
					recordingArtist: 'Test Artist',
					recordingTitle: 'Song One',
					versionTitle: 'Radio Edit',
					assetType: 'AUDIO',
					immersive: false,
					explicit: true, // trackSensitive.code = 'EXPLICIT'
					yearOfProduction: 2026,
					duration: 210,
					isAdded: false,
					prefixIsrcId: MOCK_PREFIX_ISRC_ID,
				}),
			);
		});

		it('defaults versionTitle to "Original Version" when empty', async () => {
			isrcService.create.mockResolvedValue({
				data: { code: 'QT6KL2600002' },
				message: 'ok',
			} as any);

			await adapter.provisionIsrcs({
				trackIds: ['track-002'],
				releaseId: 'rel-001',
				key: IdempotencyKey.create('test-key'),
			});

			expect(isrcService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					versionTitle: 'Original Version',
					explicit: false,
				}),
			);
		});

		it('throws when snapshot not found', async () => {
			snapshotRepo.findOne.mockResolvedValue(null);

			await expect(
				adapter.provisionIsrcs({
					trackIds: ['track-001'],
					releaseId: 'rel-missing',
					key: IdempotencyKey.create('test-key'),
				}),
			).rejects.toThrow(/snapshot not found/);
		});

		it('throws when ISRC service returns empty code', async () => {
			isrcService.create.mockResolvedValue({
				data: { code: '' },
				message: 'ok',
			} as any);

			await expect(
				adapter.provisionIsrcs({
					trackIds: ['track-001'],
					releaseId: 'rel-001',
					key: IdempotencyKey.create('test-key'),
				}),
			).rejects.toThrow(/empty code/);
		});
	});
});
