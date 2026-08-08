import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import {
	ASSET_IMPORT_TEMPLATE_R2_KEY,
} from '../constants/asset-import.constant';
import { AssetImportTemplateService } from './asset-import-template.service';

describe('AssetImportTemplateService', () => {
	let originalAppRole: string | undefined;
	const r2Service = {
		getBucketName: jest.fn().mockReturnValue('protected-bucket'),
		findOne: jest.fn(),
		uploadBuffer: jest.fn(),
	};

	beforeEach(() => {
		originalAppRole = process.env.APP_ROLE;
		process.env.APP_ROLE = 'worker';
		jest.clearAllMocks();
		r2Service.getBucketName.mockReturnValue('protected-bucket');
	});

	afterEach(() => {
		if (originalAppRole === undefined) delete process.env.APP_ROLE;
		else process.env.APP_ROLE = originalAppRole;
	});

	it('skips upload when the existing template version is current', async () => {
		r2Service.findOne.mockResolvedValue({
			bucketName: 'protected-bucket',
			key: ASSET_IMPORT_TEMPLATE_R2_KEY,
			metadata: { 'asset-import-template-version': '2' },
		});
		const service = new AssetImportTemplateService(
			r2Service as unknown as BucketR2Service,
		);

		await service.ensureTemplateUploaded();

		expect(r2Service.uploadBuffer).not.toHaveBeenCalled();
	});

	it('generates the seeded Excel template', async () => {
		r2Service.findOne.mockRejectedValue(new Error('not found'));
		r2Service.uploadBuffer.mockResolvedValue({
			bucketName: 'protected-bucket',
			key: ASSET_IMPORT_TEMPLATE_R2_KEY,
		});
		const service = new AssetImportTemplateService(
			r2Service as unknown as BucketR2Service,
		);

		await service.ensureTemplateUploaded();

		expect(r2Service.uploadBuffer).toHaveBeenCalledWith(
			expect.objectContaining({
				key: ASSET_IMPORT_TEMPLATE_R2_KEY,
				isPublic: false,
				contentType:
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				metadata: { 'asset-import-template-version': '2' },
				buffer: expect.any(Buffer),
			}),
		);
	});

	it('does not initialize the template from an API process', async () => {
		process.env.APP_ROLE = 'api';
		const service = new AssetImportTemplateService(
			r2Service as unknown as BucketR2Service,
		);

		await service.onApplicationBootstrap();

		expect(r2Service.getBucketName).not.toHaveBeenCalled();
	});
});
