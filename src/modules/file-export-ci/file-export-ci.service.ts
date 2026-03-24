import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AppConfigService } from '../app-config/app-config.service';
import { BucketService2 } from '../bucket2/services/bucket2.service';

type ExportCiRecord = {
	upc: string | null;
	listCodeDspCi: string[];
};

@Injectable()
export class FileExportCiService {
	constructor(
		private readonly bucketSv: BucketService2,
		private readonly appConfigSv: AppConfigService,
	) {}

	async getFileTemplateBuffer(fileId: string): Promise<Buffer> {
		const { fileBuffer } = await this.bucketSv.getFileBuffer(fileId);
		return fileBuffer;
	}

	async createFileExportCi({
		fileTemplateId,
		data,
	}: {
		fileTemplateId?: string;
		data: ExportCiRecord[];
	}): Promise<Buffer> {
		const buffer = await this.getFileTemplateBuffer(
			fileTemplateId ??
				this.appConfigSv.cache.config.other.fileCiTemplateId ??
				'',
		);

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(buffer as any);

		const worksheet = workbook.worksheets[0];
		const startRow =
			this.appConfigSv.cache.config.other.excelDataStartRow ?? 16;

		data.forEach((item, index) => {
			const rowIndex = startRow + index;

			const codes = [...new Set(item.listCodeDspCi ?? [])]
				.filter((x): x is string => Boolean(x?.trim()))
				.join('|');

			const row = worksheet.getRow(rowIndex);
			row.getCell(1).value = item.upc;
			row.getCell(2).value = codes;
			row.commit();
		});

		const output = await workbook.xlsx.writeBuffer();
		return Buffer.from(output as any);
	}
}
