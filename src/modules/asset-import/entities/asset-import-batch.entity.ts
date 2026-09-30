import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { AssetImportBatchStatus } from '../enum/asset-import.enum';
import { AssetImportOptions } from '../interfaces/asset-import.interface';
import { AssetImportItem } from './asset-import-item.entity';

@Index(['targetTenantId', 'createdAt'])
@Index(['status'])
@Index(['fileHash'])
@Entity('asset_import_batches', {
	comment:
		'Mỗi bản ghi là một lần upload file assets + quét đối chiếu với hệ thống',
})
export class AssetImportBatch extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 500,
		comment: 'Tên file gốc người dùng upload',
	})
	fileName: string;

	@Column({
		type: 'varchar',
		length: 64,
		nullable: true,
		comment: 'SHA-256 của nội dung file, dùng phát hiện upload trùng',
	})
	fileHash: string | null;

	@Column({
		type: 'varchar',
		length: 1000,
		nullable: true,
		comment:
			'Object key của file Excel đã upload lên R2 và được dùng để scan',
	})
	fileKey: string | null;

	@Column({
		type: 'uuid',
		comment: 'Workspace (tenant) đích mà người dùng chọn để gán asset về',
	})
	targetTenantId: string;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment:
			'Label đích áp dụng cho toàn bộ file, nếu người dùng chọn cố định',
	})
	targetLabelId: string | null;

	@Column({
		type: 'date',
		comment: 'Ngày owner mới bắt đầu nhận trends/usage',
	})
	effectiveDate: string;

	@Column({ type: 'date', comment: 'Tháng owner mới bắt đầu nhận revenue' })
	revenueEffectiveFrom: string;

	@Column({
		type: 'jsonb',
		comment: 'Snapshot option lúc scan (updateOwnership, fillEmptyOnly...)',
	})
	options: AssetImportOptions;

	@Column({
		type: 'enum',
		enum: AssetImportBatchStatus,
		default: AssetImportBatchStatus.SCANNING,
		comment: 'Trạng thái vòng đời của batch',
	})
	status: AssetImportBatchStatus;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Tổng số dòng dữ liệu trong file',
	})
	totalRows: number;

	@Column({ type: 'int', default: 0, comment: 'Số dòng khớp bản ghi có sẵn' })
	matchedRows: number;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Số dòng chưa có trong hệ thống',
	})
	newRows: number;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Số dòng thiếu cả ISRC lẫn UPC nên không xử lý được',
	})
	invalidRows: number;

	@Column({ type: 'int', default: 0, comment: 'Số item đã apply thành công' })
	appliedRows: number;

	@Column({ type: 'int', default: 0, comment: 'Số item apply thất bại' })
	failedRows: number;

	@Column({
		type: 'varchar',
		length: 64,
		nullable: true,
		comment: 'ID job quét bên ClickHouse import_jobs',
	})
	scanJobId: string | null;

	@Column({
		type: 'varchar',
		length: 64,
		nullable: true,
		comment: 'ID job apply bên ClickHouse import_jobs',
	})
	applyJobId: string | null;

	@Column({ type: 'text', nullable: true, comment: 'Lỗi cấp batch nếu có' })
	errorMessage: string | null;

	@Column({
		type: 'uuid',
		comment: 'User yêu cầu upload và quét',
	})
	requestedBy: string;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'User bấm convert (apply)',
	})
	appliedBy: string | null;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm quét xong',
	})
	scannedAt: Date | null;

	@Column({
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm apply xong',
	})
	appliedAt: Date | null;

	@ManyToOne(() => Tenant)
	@JoinColumn({ name: 'target_tenant_id' })
	targetTenant: Tenant;

	@ManyToOne(() => Label)
	@JoinColumn({ name: 'target_label_id' })
	targetLabel: Label | null;

	@OneToMany(() => AssetImportItem, (item) => item.batch)
	items: AssetImportItem[];
}
