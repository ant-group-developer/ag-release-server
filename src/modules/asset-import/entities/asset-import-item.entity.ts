import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
	AssetImportAction,
	AssetImportItemStatus,
	AssetImportMatchType,
} from '../enum/asset-import.enum';
import { AssetImportChange } from '../interfaces/asset-import.interface';
import { AssetImportBatch } from './asset-import-batch.entity';

@Index(['batchId', 'status'])
@Index(['batchId', 'action'])
@Index(['isrc'])
@Entity('asset_import_items', {
	comment: 'Mỗi bản ghi là một dòng trong file assets đã được đối chiếu',
})
export class AssetImportItem extends BaseUUIDEntity {
	@Column({ type: 'uuid', comment: 'Batch chứa item này' })
	batchId: string;

	@Column({
		type: 'int',
		comment: 'Số dòng trong file gốc, để người dùng đối chiếu',
	})
	rowNumber: number;

	@Column({
		type: 'jsonb',
		comment: 'Nguyên văn cả dòng Excel, giữ cả cột không nhận diện được',
	})
	rawData: Record<string, unknown>;

	@Column({
		type: 'varchar',
		length: 20,
		nullable: true,
		comment: 'ISRC đã chuẩn hoá (trim + uppercase)',
	})
	isrc: string | null;

	@Column({
		type: 'varchar',
		length: 20,
		nullable: true,
		comment: 'UPC đã chuẩn hoá',
	})
	upc: string | null;

	@Column({ type: 'varchar', length: 500, nullable: true })
	trackName: string | null;

	@Column({ type: 'varchar', length: 500, nullable: true })
	albumName: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	labelName: string | null;

	@Column({
		type: 'enum',
		enum: AssetImportMatchType,
		default: AssetImportMatchType.NONE,
		comment: 'Khớp bản ghi hệ thống bằng khoá nào',
	})
	matchType: AssetImportMatchType;

	@Column({
		type: 'enum',
		enum: AssetImportAction,
		default: AssetImportAction.NO_CHANGE,
		comment: 'Hành động sẽ thực hiện khi apply',
	})
	action: AssetImportAction;

	@Column({ type: 'uuid', nullable: true, comment: 'Release khớp được' })
	matchedReleaseId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Track khớp được (chỉ có khi match bằng ISRC)',
	})
	matchedTrackId: string | null;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'Workspace hiện tại của bản ghi trong hệ thống',
	})
	currentTenantId: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: 'Label hiện tại của bản ghi trong hệ thống',
	})
	currentLabelId: string | null;

	@Column({
		type: 'jsonb',
		default: () => "'[]'::jsonb",
		comment: 'Diff chi tiết từng cột sẽ thay đổi khi apply',
	})
	changes: AssetImportChange[];

	@Column({
		type: 'enum',
		enum: AssetImportItemStatus,
		default: AssetImportItemStatus.PENDING,
		comment: 'Trạng thái apply của item',
	})
	status: AssetImportItemStatus;

	@Column({ type: 'text', nullable: true })
	errorMessage: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	appliedAt: Date | null;

	@ManyToOne(() => AssetImportBatch, (batch) => batch.items, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'batch_id' })
	batch: AssetImportBatch;
}
