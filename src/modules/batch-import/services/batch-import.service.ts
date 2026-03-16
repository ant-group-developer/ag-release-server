import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	GetBatchImportLogsDto,
	UploadCompleteDto,
	ValidateReleaseDto,
} from '../dto/batch-import.dto';
import { BatchImportLog } from '../entities/batch-import-log.entity';
import { BatchImportStatus } from '../enum/batch-import.enum';

@Injectable()
export class BatchImportService {
	private readonly logger = new Logger(BatchImportService.name);

	constructor(
		@InjectRepository(BatchImportLog)
		private readonly logRepo: Repository<BatchImportLog>,
	) {}

	async getLogs(params: GetBatchImportLogsDto) {
		const { page = 1, pageSize = 20, batchId, status } = params;

		const qb = this.logRepo.createQueryBuilder('log');

		if (batchId) {
			qb.andWhere('log.batchId = :batchId', { batchId });
		}

		if (status) {
			qb.andWhere('log.status = :status', { status });
		}

		qb.orderBy('log.createdAt', 'DESC');
		qb.skip((page - 1) * pageSize).take(pageSize);

		const [data, total] = await qb.getManyAndCount();

		return { data, total };
	}

	async validateRelease(dto: ValidateReleaseDto) {
		const {
			batchId,
			releaseFolder,
			excelData,
			audioFileNames,
			thumbnailFileName,
		} = dto;

		const errors: string[] = [];

		// 1. Basic Excel data validation
		if (!excelData || excelData.length === 0) {
			errors.push('Excel file is empty or has no data rows');
		}

		// 2. Validate audio file names match ISRC from Excel
		if (audioFileNames && excelData && excelData.length > 0) {
			this.validateAudioFileNames(excelData, audioFileNames, errors);
		}

		// 3. Validate thumbnail
		this.validateThumbnail(releaseFolder, thumbnailFileName, errors);

		const isValid = errors.length === 0;

		// Create log record
		const log = this.logRepo.create({
			batchId,
			releaseFolder,
			status: isValid
				? BatchImportStatus.VALIDATED
				: BatchImportStatus.VALIDATION_FAILED,
			excelData,
			errors: errors.length > 0 ? errors : null,
		});

		const saved = await this.logRepo.save(log);

		this.logger.log(
			`Release "${releaseFolder}" in batch "${batchId}" — ${isValid ? 'VALID' : 'INVALID (' + errors.length + ' errors)'}`,
		);

		return {
			valid: isValid,
			logId: saved.id,
			errors: isValid ? null : errors,
		};
	}

	async uploadComplete(dto: UploadCompleteDto) {
		const { logId, storageKeys } = dto;

		const log = await this.logRepo.findOneBy({ id: logId });

		if (!log) {
			throw new Error(`Log record not found: ${logId}`);
		}

		log.status = BatchImportStatus.UPLOADED;
		log.storageKeys = storageKeys;

		await this.logRepo.save(log);

		this.logger.log(
			`Upload complete for log "${logId}" — ${storageKeys.length} file(s)`,
		);

		return { success: true };
	}

	/**
	 * Validate that audio file names match ISRC codes from Excel data.
	 * Expected: each audio file should be named {isrc}.{extension}
	 */
	private validateAudioFileNames(
		excelData: Record<string, unknown>[],
		audioFileNames: string[],
		errors: string[],
	): void {
		// Extract ISRC values from Excel (look for common ISRC column names)
		const isrcColumnNames = ['isrc', 'ISRC', 'Isrc'];
		let isrcColumn: string | null = null;

		for (const colName of isrcColumnNames) {
			if (excelData[0] && colName in excelData[0]) {
				isrcColumn = colName;
				break;
			}
		}

		if (!isrcColumn) {
			errors.push(
				'No ISRC column found in Excel data. Expected column named "ISRC".',
			);
			return;
		}

		const isrcValues = excelData
			.map((row) => {
				const val = row[isrcColumn];
				return typeof val === 'string' ? val.trim() : '';
			})
			.filter((v) => v.length > 0);

		// Check each audio file name matches an ISRC
		for (const fileName of audioFileNames) {
			const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

			if (!isrcValues.includes(nameWithoutExt)) {
				errors.push(
					`Audio file "${fileName}" does not match any ISRC. Expected file name to be {ISRC}.{extension}`,
				);
			}
		}

		// Check for missing audio files (ISRC in Excel but no matching audio)
		for (const isrc of isrcValues) {
			const hasAudio = audioFileNames.some(
				(f) => f.replace(/\.[^.]+$/, '') === isrc,
			);

			if (!hasAudio) {
				errors.push(`Missing audio file for ISRC "${isrc}"`);
			}
		}
	}

	/**
	 * Validate that a thumbnail image exists and matches {releaseFolder}.{png|jpg|jpeg}.
	 */
	private validateThumbnail(
		releaseFolder: string,
		thumbnailFileName: string | undefined,
		errors: string[],
	): void {
		const allowedExtensions = ['.png', '.jpg', '.jpeg'];

		if (!thumbnailFileName) {
			errors.push(
				`Missing thumbnail. Expected file named "${releaseFolder}.png" (or .jpg, .jpeg)`,
			);
			return;
		}

		const ext = thumbnailFileName
			.substring(thumbnailFileName.lastIndexOf('.'))
			.toLowerCase();
		const nameWithoutExt = thumbnailFileName.replace(/\.[^.]+$/, '');

		if (!allowedExtensions.includes(ext)) {
			errors.push(
				`Thumbnail "${thumbnailFileName}" has invalid format. Allowed: ${allowedExtensions.join(', ')}`,
			);
			return;
		}

		if (nameWithoutExt !== releaseFolder) {
			errors.push(
				`Thumbnail "${thumbnailFileName}" must be named "${releaseFolder}${ext}"`,
			);
		}
	}
}
