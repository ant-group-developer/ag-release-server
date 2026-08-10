import { DataSource } from 'typeorm';
import { AssetImportBatch } from '../entities/asset-import-batch.entity';
import { AssetImportItem } from '../entities/asset-import-item.entity';
import {
	AssetImportAction,
	AssetImportChangeType,
	AssetImportItemStatus,
} from '../enum/asset-import.enum';
import { AssetImportApplyService } from './asset-import-apply.service';

const TARGET_TENANT = '11111111-1111-4111-8111-111111111111';
const WRONG_TENANT = '7c2358a0-1a38-4a10-b806-a1531ef71b0c';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeBatch(partial: Partial<AssetImportBatch> = {}): AssetImportBatch {
	return {
		id: 'batch-1',
		fileName: 'assets.xlsx',
		targetTenantId: TARGET_TENANT,
		targetLabelId: null,
		applyJobId: 'job-1',
		options: {
			updateOwnership: true,
			overwriteMetadata: false,
			createIfNotFound: false,
			fillEmptyOnly: false,
			createLabelIfMissing: false,
		},
		...partial,
	} as AssetImportBatch;
}

function makeItem(partial: Partial<AssetImportItem> = {}): AssetImportItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		rowNumber: 2,
		isrc: 'VNA682200001',
		upc: '8809633000011',
		trackName: 'Em Của Ngày Hôm Qua',
		albumName: 'Album A',
		labelName: null,
		action: AssetImportAction.UPDATE,
		matchedReleaseId: 'rel1',
		matchedTrackId: 'trk1',
		changes: [],
		...partial,
	} as AssetImportItem;
}

describe('AssetImportApplyService', () => {
	let manager: {
		update: jest.Mock;
		save: jest.Mock;
		create: jest.Mock;
		exists: jest.Mock;
		createQueryBuilder: jest.Mock;
	};
	let dataSource: DataSource;
	let releaseImport: { importRelease: jest.Mock };
	let clickHouse: { insert: jest.Mock };
	let service: AssetImportApplyService;

	beforeEach(() => {
		manager = {
			update: jest.fn().mockResolvedValue(undefined),
			save: jest
				.fn()
				.mockImplementation((_e, v) => ({ id: 'new-label', ...v })),
			create: jest.fn().mockImplementation((_e, v) => v),
			exists: jest.fn().mockResolvedValue(false),
			createQueryBuilder: jest.fn().mockReturnValue({
				where: jest.fn().mockReturnThis(),
				andWhere: jest.fn().mockReturnThis(),
				getOne: jest.fn().mockResolvedValue(null),
			}),
		};

		dataSource = {
			transaction: jest.fn((cb: any) => cb(manager)),
		} as unknown as DataSource;

		releaseImport = {
			importRelease: jest.fn().mockResolvedValue({ id: 'rel-new' }),
		};
		clickHouse = { insert: jest.fn().mockResolvedValue(undefined) };

		service = new AssetImportApplyService(
			dataSource,
			releaseImport as any,
			clickHouse as any,
		);
	});

	it('bỏ qua item INVALID / CONFLICT / NO_CHANGE mà không đụng DB', async () => {
		for (const action of [
			AssetImportAction.INVALID,
			AssetImportAction.CONFLICT,
			AssetImportAction.NO_CHANGE,
		]) {
			const result = await service.applyItem(
				makeItem({ action }),
				makeBatch(),
				USER_ID,
			);

			expect(result.status).toBe(AssetImportItemStatus.SKIPPED);
		}

		expect(manager.update).not.toHaveBeenCalled();
		expect(releaseImport.importRelease).not.toHaveBeenCalled();
	});

	it('UPDATE đổi tenant của release và ghi modifierId', async () => {
		const item = makeItem({
			changes: [
				{
					field: 'tenantId',
					label: 'Workspace',
					oldValue: WRONG_TENANT,
					newValue: TARGET_TENANT,
					changeType: AssetImportChangeType.OVERWRITE,
				},
			],
		});

		const result = await service.applyItem(item, makeBatch(), USER_ID);

		expect(result.status).toBe(AssetImportItemStatus.APPLIED);
		expect(manager.update).toHaveBeenCalledWith(
			expect.anything(),
			'rel1',
			expect.objectContaining({
				tenantId: TARGET_TENANT,
				modifierId: USER_ID,
			}),
		);
	});

	it('chỉ cập nhật đúng field có trong changes, không đụng cột khác', async () => {
		const item = makeItem({
			changes: [
				{
					field: 'albumTitle',
					label: 'Album name',
					oldValue: null,
					newValue: 'Album mới',
					changeType: AssetImportChangeType.FILL_EMPTY,
				},
			],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		const patch = manager.update.mock.calls[0][2];
		expect(patch).toHaveProperty('title', 'Album mới');
		expect(patch).not.toHaveProperty('tenantId');
		expect(patch).not.toHaveProperty('upc');
	});

	it('không đổi title track khi item không khớp tới track cụ thể', async () => {
		const item = makeItem({
			matchedTrackId: null,
			changes: [
				{
					field: 'title',
					label: 'Track name',
					oldValue: null,
					newValue: 'Tên mới',
					changeType: AssetImportChangeType.FILL_EMPTY,
				},
			],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		expect(manager.update).not.toHaveBeenCalled();
	});

	it('CREATE truyền tenantId tường minh nên không rơi vào fallback', async () => {
		const item = makeItem({
			action: AssetImportAction.CREATE,
			matchedReleaseId: null,
			matchedTrackId: null,
			changes: [],
		});

		const result = await service.applyItem(item, makeBatch(), USER_ID);

		expect(result.status).toBe(AssetImportItemStatus.APPLIED);
		expect(releaseImport.importRelease).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: TARGET_TENANT,
				upc: '8809633000011',
				importSourceType: 'ASSET_IMPORT',
			}),
		);
	});

	it('CREATE chạy ngoài transaction để không lồng với transaction của importRelease', async () => {
		const item = makeItem({
			action: AssetImportAction.CREATE,
			changes: [],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		expect(dataSource.transaction).not.toHaveBeenCalled();
	});

	it('CREATE dùng ISRC- làm UPC thay thế khi file không có UPC', async () => {
		const item = makeItem({
			action: AssetImportAction.CREATE,
			upc: null,
			changes: [],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		expect(releaseImport.importRelease).toHaveBeenCalledWith(
			expect.objectContaining({ upc: 'ISRC-VNA682200001' }),
		);
	});

	it('trả FAILED kèm lỗi thay vì ném ra ngoài, để lô vẫn chạy tiếp', async () => {
		releaseImport.importRelease.mockRejectedValueOnce(
			new Error('Tenant không tồn tại'),
		);

		const result = await service.applyItem(
			makeItem({ action: AssetImportAction.CREATE, changes: [] }),
			makeBatch(),
			USER_ID,
		);

		expect(result.status).toBe(AssetImportItemStatus.FAILED);
		expect(result.errorMessage).toBe('Tenant không tồn tại');
	});

	it('tạo label mới trong workspace đích khi diff là create', async () => {
		const item = makeItem({
			labelName: 'Warner VN',
			changes: [
				{
					field: 'labelId',
					label: 'Label',
					oldValue: 'G4_9DtvlmL',
					newValue: null,
					newDisplay: 'Warner VN',
					changeType: AssetImportChangeType.CREATE,
				},
			],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		expect(manager.save).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				name: 'Warner VN',
				tenantId: TARGET_TENANT,
				isImportedFromReport: false,
			}),
		);
		expect(manager.update).toHaveBeenCalledWith(
			expect.anything(),
			'rel1',
			expect.objectContaining({ labelId: 'new-label' }),
		);
	});

	it('lỗi ghi audit log không làm hỏng thay đổi đã commit', async () => {
		clickHouse.insert.mockRejectedValueOnce(new Error('ClickHouse down'));

		const item = makeItem({
			changes: [
				{
					field: 'tenantId',
					label: 'Workspace',
					oldValue: WRONG_TENANT,
					newValue: TARGET_TENANT,
					changeType: AssetImportChangeType.OVERWRITE,
				},
			],
		});

		const result = await service.applyItem(item, makeBatch(), USER_ID);

		expect(result.status).toBe(AssetImportItemStatus.APPLIED);
	});

	it('ghi audit log với scan_id là batch id và created_by là user', async () => {
		const item = makeItem({
			changes: [
				{
					field: 'tenantId',
					label: 'Workspace',
					oldValue: WRONG_TENANT,
					newValue: TARGET_TENANT,
					changeType: AssetImportChangeType.OVERWRITE,
				},
			],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		const [, rows] = clickHouse.insert.mock.calls[0];
		expect(rows[0]).toMatchObject({
			scan_id: 'batch-1',
			field_name: 'tenantId',
			old_value: WRONG_TENANT,
			new_value: TARGET_TENANT,
			enrichment_source: 'asset_import',
			created_by: USER_ID,
		});
	});

	// ── Label ─────────────────────────────────────────────────────────

	const CREATE_LABEL_CHANGE = {
		field: 'labelId',
		label: 'Label',
		oldValue: 'G4_9DtvlmL',
		newValue: null,
		newDisplay: 'Warner VN',
		changeType: AssetImportChangeType.CREATE,
	};

	it('UPDATE ghi dòng audit riêng cho label vừa tạo', async () => {
		const item = makeItem({
			labelName: 'Warner VN',
			changes: [CREATE_LABEL_CHANGE],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		const [, rows] = clickHouse.insert.mock.calls[0];

		// Dòng của field labelId phải mang id thật, không còn rỗng.
		expect(rows.find((r: any) => r.field_name === 'labelId')).toMatchObject(
			{
				entity_type: 'release',
				new_value: 'new-label',
			},
		);

		expect(rows.find((r: any) => r.entity_type === 'label')).toMatchObject({
			entity_id: 'new-label',
			field_name: 'name',
			new_value: 'Warner VN',
			change_type: 'create',
		});
	});

	it('không ghi dòng label khi dùng lại label đã có sẵn', async () => {
		manager.createQueryBuilder.mockReturnValue({
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getOne: jest.fn().mockResolvedValue({ id: 'lbl_existing' }),
		});

		const item = makeItem({
			labelName: 'Warner VN',
			changes: [CREATE_LABEL_CHANGE],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		const [, rows] = clickHouse.insert.mock.calls[0];
		expect(manager.save).not.toHaveBeenCalled();
		expect(
			rows.find((r: any) => r.entity_type === 'label'),
		).toBeUndefined();
		expect(rows.find((r: any) => r.field_name === 'labelId')).toMatchObject(
			{
				new_value: 'lbl_existing',
			},
		);
	});

	it('CREATE không cho importRelease tự tạo label khi option tắt', async () => {
		const item = makeItem({
			action: AssetImportAction.CREATE,
			labelName: 'Sony Music',
			changes: [
				{
					field: 'labelId',
					label: 'Label',
					oldValue: null,
					newValue: 'lbl_default',
					newDisplay: 'Universal Music VN',
					changeType: AssetImportChangeType.AUTO_SELECT,
				},
			],
		});

		await service.applyItem(item, makeBatch(), USER_ID);

		expect(releaseImport.importRelease).toHaveBeenCalledWith(
			expect.objectContaining({
				labelId: 'lbl_default',
				labelName: undefined,
			}),
		);
	});

	it('CREATE truyền labelName để importRelease tạo label khi option bật', async () => {
		releaseImport.importRelease.mockResolvedValueOnce({
			id: 'rel-new',
			labelId: 'lbl_created',
		});

		const item = makeItem({
			action: AssetImportAction.CREATE,
			labelName: 'Sony Music',
			changes: [
				{
					field: 'labelId',
					label: 'Label',
					oldValue: null,
					newValue: null,
					newDisplay: 'Sony Music',
					changeType: AssetImportChangeType.CREATE,
				},
			],
		});

		await service.applyItem(
			item,
			makeBatch({
				options: {
					updateOwnership: true,
					overwriteMetadata: false,
					createIfNotFound: true,
					fillEmptyOnly: false,
					createLabelIfMissing: true,
				},
			}),
			USER_ID,
		);

		expect(releaseImport.importRelease).toHaveBeenCalledWith(
			expect.objectContaining({
				labelName: 'Sony Music',
				labelId: undefined,
			}),
		);
	});

	it('CREATE đọc lại labelId từ release vừa tạo thay vì ghi log rỗng', async () => {
		releaseImport.importRelease.mockResolvedValueOnce({
			id: 'rel-new',
			labelId: 'lbl_created',
		});

		const item = makeItem({
			action: AssetImportAction.CREATE,
			labelName: 'Sony Music',
			changes: [
				{
					field: 'labelId',
					label: 'Label',
					oldValue: null,
					newValue: null,
					newDisplay: 'Sony Music',
					changeType: AssetImportChangeType.CREATE,
				},
			],
		});

		await service.applyItem(
			item,
			makeBatch({
				options: {
					updateOwnership: true,
					overwriteMetadata: false,
					createIfNotFound: true,
					fillEmptyOnly: false,
					createLabelIfMissing: true,
				},
			}),
			USER_ID,
		);

		const [, rows] = clickHouse.insert.mock.calls[0];
		expect(rows.find((r: any) => r.field_name === 'labelId')).toMatchObject(
			{
				new_value: 'lbl_created',
			},
		);
		expect(rows.find((r: any) => r.entity_type === 'label')).toMatchObject({
			entity_id: 'lbl_created',
			new_value: 'Sony Music',
		});
	});
});
