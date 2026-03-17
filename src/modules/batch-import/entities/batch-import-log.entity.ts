import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { BatchImportStatus } from '../enum/batch-import.enum';

@Entity('batch_import_logs', {
	comment: 'Log table tracking each release import from SFTP batch',
})
export class BatchImportLog extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 50,
		comment: 'Batch folder name (e.g., 20251211111052955)',
	})
	batchId: string;

	@Column({
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'Tenant code from folder name (e.g., antmusic)',
	})
	tenantCode: string | null;

	@Column({
		type: 'varchar',
		length: 50,
		comment: 'Release folder name / UPC (e.g., 850080651003)',
	})
	releaseFolder: string;

	@Column({
		type: 'enum',
		enum: BatchImportStatus,
		default: BatchImportStatus.VALIDATING,
		comment: 'Current processing status',
	})
	status: BatchImportStatus;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Raw Excel data rows for auditing',
	})
	excelData: Record<string, unknown>[] | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Array of uploaded storage file keys',
	})
	storageKeys: string[] | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Validation errors if any',
	})
	errors: string[] | null;
}
