import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import {
	ASSET_IMPORT_TEMPLATE_FILE_NAME,
	ASSET_IMPORT_TEMPLATE_R2_KEY,
} from '../constants/asset-import.constant';

const TEMPLATE_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEMPLATE_VERSION = '2';
const TEMPLATE_VERSION_METADATA_KEY = 'asset-import-template-version';

@Injectable()
export class AssetImportTemplateService implements OnApplicationBootstrap {
	private readonly logger = new Logger(AssetImportTemplateService.name);

	constructor(private readonly r2Service: BucketR2Service) {}

	async onApplicationBootstrap(): Promise<void> {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug(
				'Skipping Asset Import template upload (not worker role)',
			);
			return;
		}

		await this.ensureTemplateUploaded();
	}

	async ensureTemplateUploaded(): Promise<void> {
		const bucketName = this.r2Service.getBucketName({ isPublic: false });
		try {
			const existingTemplate = await this.r2Service.findOne({
				bucketName,
				key: ASSET_IMPORT_TEMPLATE_R2_KEY,
			});
			if (
				existingTemplate.metadata[TEMPLATE_VERSION_METADATA_KEY] ===
				TEMPLATE_VERSION
			) {
				this.logger.log(
					`Asset Import template is already version ${TEMPLATE_VERSION}; skipping upload.`,
				);
				return;
			}
		} catch {
			// Object chưa tồn tại, tạo mới bên dưới. uploadBuffer sẽ ném lỗi nếu R2 không khả dụng.
		}

		const buffer = await this.createTemplateBuffer();
		await this.r2Service.uploadBuffer({
			key: ASSET_IMPORT_TEMPLATE_R2_KEY,
			buffer,
			contentType: TEMPLATE_CONTENT_TYPE,
			isPublic: false,
			metadata: { [TEMPLATE_VERSION_METADATA_KEY]: TEMPLATE_VERSION },
		});
		this.logger.log(
			`Uploaded Asset Import template version ${TEMPLATE_VERSION} to ${ASSET_IMPORT_TEMPLATE_R2_KEY}.`,
		);
	}

	private async createTemplateBuffer(): Promise<Buffer> {
		const workbook = new ExcelJS.Workbook();
		workbook.creator = 'AG Release Server';

		const assets = workbook.addWorksheet('Assets', {
			views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
		});
		assets.columns = [
			{ header: 'ISRC', key: 'isrc', width: 18 },
			{ header: 'Track Name', key: 'trackName', width: 32 },
			{ header: 'Album Name', key: 'albumName', width: 32 },
			{ header: 'UPC', key: 'upc', width: 18 },
			{ header: 'Label Name', key: 'labelName', width: 28 },
		];
		assets.getRow(1).height = 24;
		assets.getRow(1).eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FF1F4E78' },
			};
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
			cell.border = {
				bottom: { style: 'medium', color: { argb: 'FF17365D' } },
			};
		});
		assets.autoFilter = 'A1:E1';
		assets.getColumn('isrc').numFmt = '@';
		assets.getColumn('upc').numFmt = '@';
		assets.addRow({
			isrc: 'USRC17607839',
			trackName: 'Example Song',
			albumName: 'Example Album',
			upc: '012345678901',
			labelName: 'Example Label',
		});
		assets.getRow(2).eachCell((cell) => {
			cell.font = { italic: true, color: { argb: 'FF666666' } };
		});

		const instructions = workbook.addWorksheet('Instructions', {
			views: [{ showGridLines: false }],
		});
		instructions.mergeCells('A1:E1');
		instructions.getCell('A1').value = 'Asset Import Excel Template';
		instructions.getCell('A1').font = {
			bold: true,
			size: 16,
			color: { argb: 'FFFFFFFF' },
		};
		instructions.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FF1F4E78' },
		};
		instructions.getCell('A1').alignment = {
			vertical: 'middle',
			horizontal: 'center',
		};
		instructions.getRow(1).height = 30;
		instructions.getColumn('A').width = 18;
		instructions.getColumn('B').width = 32;
		instructions.getColumn('C').width = 28;
		instructions.getColumn('D').width = 48;
		instructions.getColumn('E').width = 18;
		instructions.addRows([
			[],
			['Column', 'Purpose', 'Required', 'Example', 'Notes'],
			[
				'ISRC',
				'Identify a track',
				'ISRC or UPC',
				'USRC17607839',
				'Spaces and hyphens are accepted.',
			],
			[
				'Track Name',
				'Track title',
				'No',
				'Example Song',
				'Used when metadata overwrite is enabled.',
			],
			[
				'Album Name',
				'Release / album title',
				'No',
				'Example Album',
				'Used when metadata overwrite is enabled.',
			],
			[
				'UPC',
				'Identify a release',
				'ISRC or UPC',
				'012345678901',
				'Enter as text to preserve leading zeroes.',
			],
			[
				'Label Name',
				'Target label name',
				'No',
				'Example Label',
				'Matched in the target workspace.',
			],
			[],
			[
				'How to use',
				'Fill rows in the Assets sheet only. Each row must include at least one valid ISRC or UPC.',
				'',
				'',
				'',
			],
		]);
		instructions.getRow(3).eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FF5B9BD5' },
			};
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
		});
		for (let row = 4; row <= 8; row += 1) {
			instructions.getRow(row).alignment = {
				vertical: 'middle',
				wrapText: true,
			};
		}
		instructions.getCell('A10').font = { bold: true };
		instructions.getCell('B10').alignment = {
			wrapText: true,
			vertical: 'middle',
		};
		instructions.getRow(10).height = 36;

		return Buffer.from(await workbook.xlsx.writeBuffer());
	}
}
