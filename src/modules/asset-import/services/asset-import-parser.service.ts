import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { normalizeStandardUpcOrEmpty } from 'src/utils/upc.util';
import * as XLSX from 'xlsx';
import { buildHeaderMap } from '../constants/asset-import.constant';
import { ParsedAssetRow } from '../interfaces/asset-import.interface';

/**
 * Đọc file assets (.xlsx/.xls/.csv) từ buffer và chuẩn hoá thành ParsedAssetRow.
 *
 * Header nhận diện qua alias (không phân biệt hoa thường, dấu cách, gạch dưới).
 * Cột không nhận diện được vẫn giữ nguyên trong `raw` để không mất dữ liệu.
 */
@Injectable()
export class AssetImportParserService {
	private readonly logger = new Logger(AssetImportParserService.name);

	parse(buffer: Buffer): ParsedAssetRow[] {
		let sheet: XLSX.WorkSheet;
		try {
			const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
			const sheetName = workbook.SheetNames[0];
			if (!sheetName) {
				throw new BadRequestException('File không có sheet nào');
			}
			sheet = workbook.Sheets[sheetName];
		} catch (err: any) {
			if (err instanceof BadRequestException) throw err;
			throw new BadRequestException(
				`Không đọc được file: ${err.message}`,
			);
		}

		const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
			defval: null,
			raw: false,
		});

		if (!rows.length) {
			throw new BadRequestException('File không có dòng dữ liệu nào');
		}

		const headers = Object.keys(rows[0]);
		const headerMap = buildHeaderMap(headers);

		if (!headerMap.size) {
			throw new BadRequestException(
				`Không nhận diện được cột nào. Header trong file: ${headers.join(', ')}`,
			);
		}

		this.logger.log(
			`Parsed ${rows.length} rows; mapped columns: ${[
				...headerMap.entries(),
			]
				.map(([h, f]) => `${h}→${f}`)
				.join(', ')}`,
		);

		// rowNumber bắt đầu từ 2: dòng 1 là header trong file Excel gốc.
		return rows.map((raw, index) => {
			const picked: Record<string, string | null> = {};
			for (const [header, field] of headerMap.entries()) {
				picked[field] = this.cleanCell(raw[header]);
			}

			return {
				rowNumber: index + 2,
				raw,
				isrc: this.normalizeIsrc(picked.isrc),
				upc: normalizeStandardUpcOrEmpty(picked.upc) || null,
				trackName: picked.trackName ?? null,
				albumName: picked.albumName ?? null,
				labelName: picked.labelName ?? null,
			};
		});
	}

	/**
	 * Chuẩn hoá 1 ô: bỏ khoảng trắng thừa và gỡ format Excel-quoted `="0085..."`
	 * mà một số nguồn dùng để giữ số 0 đứng đầu.
	 */
	private cleanCell(value: unknown): string | null {
		if (value === null || value === undefined) return null;
		let text = String(value).trim();
		if (!text) return null;

		if (text.startsWith('=')) text = text.slice(1).trim();
		if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
			text = text.slice(1, -1).trim();
		}

		return text || null;
	}

	private normalizeIsrc(value: string | null | undefined): string | null {
		if (!value) return null;
		const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
		if (!cleaned || cleaned === 'N/A') return null;
		// ISRC chuẩn: 2 chữ cái quốc gia + 3 ký tự đăng ký + 2 số năm + 5 số
		return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleaned) ? cleaned : null;
	}
}
