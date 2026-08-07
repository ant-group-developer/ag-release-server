import { DataSource } from 'typeorm';
import {
	AssetImportAction,
	AssetImportChangeType,
	AssetImportMatchType,
} from '../enum/asset-import.enum';
import {
	AssetImportOptions,
	ParsedAssetRow,
} from '../interfaces/asset-import.interface';
import { AssetImportScanService } from './asset-import-scan.service';

const TARGET_TENANT = '11111111-1111-4111-8111-111111111111';
const WRONG_TENANT = '7c2358a0-1a38-4a10-b806-a1531ef71b0c';

const DEFAULT_OPTIONS: AssetImportOptions = {
	updateOwnership: true,
	overwriteMetadata: false,
	createIfNotFound: false,
	fillEmptyOnly: false,
	createLabelIfMissing: false,
};

function row(partial: Partial<ParsedAssetRow>): ParsedAssetRow {
	return {
		rowNumber: 2,
		raw: {},
		isrc: null,
		upc: null,
		trackName: null,
		albumName: null,
		labelName: null,
		...partial,
	};
}

/**
 * Trả về DataSource giả, phát repository theo tên entity. Scan service chỉ
 * dùng find/exists nên fake ở mức này là đủ và tránh phải dựng DB thật.
 */
function fakeDataSource(data: {
	tracks?: any[];
	releases?: any[];
	labels?: any[];
	tenants?: any[];
}): DataSource {
	const repos: Record<string, any> = {
		Track: { find: jest.fn().mockResolvedValue(data.tracks ?? []) },
		Release: { find: jest.fn().mockResolvedValue(data.releases ?? []) },
		Label: { find: jest.fn().mockResolvedValue(data.labels ?? []) },
		Tenant: { find: jest.fn().mockResolvedValue(data.tenants ?? []) },
	};

	return {
		getRepository: (entity: { name: string }) => {
			const repo = repos[entity.name];
			if (!repo) throw new Error(`Chưa fake repository cho ${entity.name}`);
			// Release.find bị gọi 2 lần (theo UPC, rồi theo id của track);
			// trả cùng danh sách cho cả hai là đủ cho các case test.
			return { findOne: jest.fn().mockResolvedValue(null), ...repo };
		},
	} as unknown as DataSource;
}

describe('AssetImportScanService', () => {
	const context = {
		targetTenantId: TARGET_TENANT,
		options: DEFAULT_OPTIONS,
	};

	it('đánh dấu INVALID khi dòng thiếu cả ISRC lẫn UPC', async () => {
		const service = new AssetImportScanService(fakeDataSource({}));

		const { items, summary } = await service.scan(
			[row({ trackName: 'Bài không mã' })],
			context,
		);

		expect(items[0].action).toBe(AssetImportAction.INVALID);
		expect(items[0].errorMessage).toContain('thiếu cả ISRC lẫn UPC');
		expect(summary.invalid).toBe(1);
	});

	it('khớp bằng ISRC và sinh diff đổi workspace khi tenant đang sai', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{
						id: 'trk1',
						isrc: 'VNA682200001',
						releaseId: 'rel1',
						title: 'Em Của Ngày Hôm Qua',
					},
				],
				releases: [
					{
						id: 'rel1',
						tenantId: WRONG_TENANT,
						labelId: 'G4_9DtvlmL',
						title: 'Album A',
						upc: '8809633000011',
					},
				],
				tenants: [
					{ id: WRONG_TENANT, name: 'ANT MUSIC LLC' },
					{ id: TARGET_TENANT, name: 'Universal VN' },
				],
				labels: [{ id: 'G4_9DtvlmL', name: 'AMG' }],
			}),
		);

		const { items, summary } = await service.scan(
			[row({ isrc: 'VNA682200001' })],
			context,
		);

		const item = items[0];
		expect(item.matchType).toBe(AssetImportMatchType.ISRC);
		expect(item.action).toBe(AssetImportAction.UPDATE);
		expect(item.matchedReleaseId).toBe('rel1');
		expect(item.matchedTrackId).toBe('trk1');

		const tenantChange = item.changes.find((c) => c.field === 'tenantId');
		expect(tenantChange).toMatchObject({
			oldValue: WRONG_TENANT,
			oldDisplay: 'ANT MUSIC LLC',
			newValue: TARGET_TENANT,
			newDisplay: 'Universal VN',
			changeType: AssetImportChangeType.OVERWRITE,
		});
		expect(summary.willUpdate).toBe(1);
	});

	it('fallback sang UPC khi ISRC không khớp, chỉ có release không có track', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [],
				releases: [
					{
						id: 'rel2',
						tenantId: WRONG_TENANT,
						labelId: null,
						title: 'Album B',
						upc: '8809633000028',
					},
				],
				tenants: [
					{ id: WRONG_TENANT, name: 'ANT MUSIC LLC' },
					{ id: TARGET_TENANT, name: 'Universal VN' },
				],
			}),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200099', upc: '8809633000028' })],
			context,
		);

		expect(items[0].matchType).toBe(AssetImportMatchType.UPC);
		expect(items[0].matchedReleaseId).toBe('rel2');
		expect(items[0].matchedTrackId).toBeNull();
	});

	it('đánh dấu CONFLICT khi một ISRC thuộc nhiều release', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{ id: 'trkA', isrc: 'VNA682200002', releaseId: 'relA' },
					{ id: 'trkB', isrc: 'VNA682200002', releaseId: 'relB' },
				],
				releases: [
					{ id: 'relA', tenantId: WRONG_TENANT, labelId: null },
					{ id: 'relB', tenantId: WRONG_TENANT, labelId: null },
				],
			}),
		);

		const { items, summary } = await service.scan(
			[row({ isrc: 'VNA682200002' })],
			context,
		);

		expect(items[0].action).toBe(AssetImportAction.CONFLICT);
		expect(summary.conflict).toBe(1);
	});

	it('NO_CHANGE khi tenant và label đã đúng', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{ id: 'trk3', isrc: 'VNA682200003', releaseId: 'rel3' },
				],
				releases: [
					{ id: 'rel3', tenantId: TARGET_TENANT, labelId: null },
				],
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
			}),
		);

		const { items, summary } = await service.scan(
			[row({ isrc: 'VNA682200003' })],
			context,
		);

		expect(items[0].action).toBe(AssetImportAction.NO_CHANGE);
		expect(items[0].changes).toHaveLength(0);
		expect(summary.noChange).toBe(1);
	});

	it('fillEmptyOnly không đè giá trị đã có, chỉ điền ô trống', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{
						id: 'trk4',
						isrc: 'VNA682200004',
						releaseId: 'rel4',
						title: 'Tên track đã có',
					},
				],
				releases: [
					{
						id: 'rel4',
						tenantId: TARGET_TENANT,
						labelId: null,
						title: null,
						upc: null,
					},
				],
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
			}),
		);

		const { items } = await service.scan(
			[
				row({
					isrc: 'VNA682200004',
					trackName: 'Tên track mới',
					albumName: 'Album mới',
				}),
			],
			{
				...context,
				options: {
					...DEFAULT_OPTIONS,
					overwriteMetadata: true,
					fillEmptyOnly: true,
				},
			},
		);

		const fields = items[0].changes.map((c) => c.field);
		expect(fields).not.toContain('title');
		expect(fields).toContain('albumTitle');
		expect(
			items[0].changes.find((c) => c.field === 'albumTitle')?.changeType,
		).toBe(AssetImportChangeType.FILL_EMPTY);
	});

	it('overwriteMetadata đè giá trị đã có khi fillEmptyOnly tắt', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{
						id: 'trk5',
						isrc: 'VNA682200005',
						releaseId: 'rel5',
						title: 'Tên cũ',
					},
				],
				releases: [
					{ id: 'rel5', tenantId: TARGET_TENANT, labelId: null },
				],
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
			}),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200005', trackName: 'Tên mới' })],
			{
				...context,
				options: { ...DEFAULT_OPTIONS, overwriteMetadata: true },
			},
		);

		expect(items[0].changes.find((c) => c.field === 'title')).toMatchObject({
			oldValue: 'Tên cũ',
			newValue: 'Tên mới',
			changeType: AssetImportChangeType.OVERWRITE,
		});
	});

	it('CREATE khi không khớp và bật createIfNotFound', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
			}),
		);

		const { items, summary } = await service.scan(
			[
				row({
					isrc: 'VNA682200006',
					upc: '8809633000035',
					trackName: 'Bài mới',
				}),
			],
			{
				...context,
				options: { ...DEFAULT_OPTIONS, createIfNotFound: true },
			},
		);

		expect(items[0].action).toBe(AssetImportAction.CREATE);
		expect(summary.new).toBe(1);
	});

	it('không khớp và tắt createIfNotFound thì để NO_CHANGE', async () => {
		const service = new AssetImportScanService(fakeDataSource({}));

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200007' })],
			context,
		);

		expect(items[0].action).toBe(AssetImportAction.NO_CHANGE);
		expect(items[0].errorMessage).toContain('option tạo mới đang tắt');
	});

	it('trả về đủ số dòng của file, kể cả dòng không đổi gì', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{ id: 'trk6', isrc: 'VNA682200008', releaseId: 'rel6' },
				],
				releases: [
					{ id: 'rel6', tenantId: TARGET_TENANT, labelId: null },
				],
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
			}),
		);

		const rows = [
			row({ rowNumber: 2, isrc: 'VNA682200008' }),
			row({ rowNumber: 3, trackName: 'Thiếu mã' }),
			row({ rowNumber: 4, isrc: 'VNA682200009' }),
		];

		const { items, summary } = await service.scan(rows, context);

		expect(items).toHaveLength(3);
		expect(summary.totalRows).toBe(3);
		expect(items.map((i) => i.rowNumber)).toEqual([2, 3, 4]);
	});

	// ── Label ─────────────────────────────────────────────────────────

	/** Tenant đích có sẵn 2 label; label cũ nhất là mục tiêu auto-select. */
	function dataSourceWithLabels(release: Record<string, unknown>) {
		return fakeDataSource({
			tracks: [
				{ id: 'trkL', isrc: 'VNA682200010', releaseId: 'relL' },
			],
			releases: [release],
			tenants: [
				{ id: WRONG_TENANT, name: 'ANT MUSIC LLC' },
				{ id: TARGET_TENANT, name: 'Universal VN' },
			],
			labels: [
				{ id: 'lbl_old', name: 'Universal Music VN' },
				{ id: 'lbl_new', name: 'Warner VN' },
			],
		});
	}

	const RELEASE_WRONG_TENANT = {
		id: 'relL',
		tenantId: WRONG_TENANT,
		labelId: 'G4_9DtvlmL',
	};

	it('dùng label khớp tên trong file thay vì label mặc định', async () => {
		const service = new AssetImportScanService(
			dataSourceWithLabels(RELEASE_WRONG_TENANT),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010', labelName: 'Warner VN' })],
			context,
		);

		expect(items[0].changes.find((c) => c.field === 'labelId')).toMatchObject({
			newValue: 'lbl_new',
			newDisplay: 'Warner VN',
			changeType: AssetImportChangeType.OVERWRITE,
		});
	});

	it('auto-select label cũ nhất của workspace khi dòng không có Label Name', async () => {
		const service = new AssetImportScanService(
			dataSourceWithLabels(RELEASE_WRONG_TENANT),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010' })],
			context,
		);

		const change = items[0].changes.find((c) => c.field === 'labelId');
		expect(change).toMatchObject({
			newValue: 'lbl_old',
			newDisplay: 'Universal Music VN',
			changeType: AssetImportChangeType.AUTO_SELECT,
		});
		expect(change?.note).toContain('không có Label Name');
	});

	it('auto-select kèm ghi chú khi label trong file chưa có và option tạo mới tắt', async () => {
		const service = new AssetImportScanService(
			dataSourceWithLabels(RELEASE_WRONG_TENANT),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010', labelName: 'Sony Music' })],
			context,
		);

		const change = items[0].changes.find((c) => c.field === 'labelId');
		expect(change).toMatchObject({
			newValue: 'lbl_old',
			changeType: AssetImportChangeType.AUTO_SELECT,
		});
		expect(change?.note).toContain('Sony Music');
		expect(change?.note).toContain('đang tắt');
	});

	it('báo tạo label mới khi bật createLabelIfMissing, không auto-select', async () => {
		const service = new AssetImportScanService(
			dataSourceWithLabels(RELEASE_WRONG_TENANT),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010', labelName: 'Sony Music' })],
			{
				...context,
				options: { ...DEFAULT_OPTIONS, createLabelIfMissing: true },
			},
		);

		expect(items[0].changes.find((c) => c.field === 'labelId')).toMatchObject({
			newValue: null,
			newDisplay: 'Sony Music',
			changeType: AssetImportChangeType.CREATE,
		});
	});

	it('không auto-select khi bản ghi đã ở đúng workspace', async () => {
		const service = new AssetImportScanService(
			dataSourceWithLabels({
				id: 'relL',
				tenantId: TARGET_TENANT,
				labelId: 'G4_9DtvlmL',
			}),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010' })],
			context,
		);

		expect(items[0].changes.find((c) => c.field === 'labelId')).toBeUndefined();
		expect(items[0].action).toBe(AssetImportAction.NO_CHANGE);
		expect(items[0].errorMessage).toBeNull();
	});

	it('cảnh báo khi workspace đích chưa có label nào để auto-select', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tracks: [
					{ id: 'trkL', isrc: 'VNA682200010', releaseId: 'relL' },
				],
				releases: [RELEASE_WRONG_TENANT],
				tenants: [
					{ id: WRONG_TENANT, name: 'ANT MUSIC LLC' },
					{ id: TARGET_TENANT, name: 'Universal VN' },
				],
				labels: [],
			}),
		);

		const { items } = await service.scan(
			[row({ isrc: 'VNA682200010' })],
			context,
		);

		expect(items[0].changes.find((c) => c.field === 'labelId')).toBeUndefined();
		// Vẫn đổi được workspace, chỉ riêng label là giữ nguyên.
		expect(items[0].changes.find((c) => c.field === 'tenantId')).toBeDefined();
		expect(items[0].errorMessage).toContain('chưa có label nào');
	});

	it('CREATE không tạo label mới khi createLabelIfMissing tắt, dùng label mặc định', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
				labels: [{ id: 'lbl_old', name: 'Universal Music VN' }],
			}),
		);

		const { items } = await service.scan(
			[
				row({
					isrc: 'VNA682200011',
					upc: '8809633000042',
					trackName: 'Bài mới',
					labelName: 'Sony Music',
				}),
			],
			{
				...context,
				options: { ...DEFAULT_OPTIONS, createIfNotFound: true },
			},
		);

		expect(items[0].action).toBe(AssetImportAction.CREATE);
		expect(items[0].changes.find((c) => c.field === 'labelId')).toMatchObject({
			newValue: 'lbl_old',
			changeType: AssetImportChangeType.AUTO_SELECT,
		});
	});

	it('CREATE để label chờ tạo mới khi bật createLabelIfMissing', async () => {
		const service = new AssetImportScanService(
			fakeDataSource({
				tenants: [{ id: TARGET_TENANT, name: 'Universal VN' }],
				labels: [{ id: 'lbl_old', name: 'Universal Music VN' }],
			}),
		);

		const { items } = await service.scan(
			[
				row({
					isrc: 'VNA682200011',
					upc: '8809633000042',
					trackName: 'Bài mới',
					labelName: 'Sony Music',
				}),
			],
			{
				...context,
				options: {
					...DEFAULT_OPTIONS,
					createIfNotFound: true,
					createLabelIfMissing: true,
				},
			},
		);

		expect(items[0].changes.find((c) => c.field === 'labelId')).toMatchObject({
			newValue: null,
			newDisplay: 'Sony Music',
			changeType: AssetImportChangeType.CREATE,
		});
	});
});
