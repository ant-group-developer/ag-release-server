import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ReleaseDspStatus } from '../enum/release-dsp.enum';

@Entity('release_dsp_delivery', {
	comment: 'Bảng liên kết release với các DSP được phân phối',
})
@Unique('uq_release_dsp_delivery_release_dsp', ['releaseId', 'dspId'])
export class ReleaseDspDelivery extends BaseUUIDEntity {
	@Column({ type: 'boolean', default: true })
	isSelected: boolean;

	isActive: boolean;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId: string;

	@Column({ name: 'dsp_id', type: 'varchar', length: 10 })
	dspId: string;

	@Column({
		type: 'enum',
		enum: ReleaseDspStatus,
		default: ReleaseDspStatus.DRAFT,
		comment: `
			Trạng thái phân phối release lên DSP:
			- draft: chưa phát hành
			- processing: đang xử lý phân phối
			- issues: có lỗi khi phân phối
			- never_distributed: chưa từng phân phối lần nào
			- distributed: đã phân phối thành công
			- taken_down: đã gỡ xuống khỏi DSP
		`,
	})
	status: ReleaseDspStatus;

	@Column({
		type: 'timestamp with time zone',
		nullable: true,
		comment: `
			Thời điểm gần nhất release được đưa vào hàng đợi (queue) để phân phối lên DSP.
			Không đảm bảo là đã gửi thành công.
		`,
	})
	lastEnqueuedAt: Date | null;

	@Column({
		type: 'timestamp with time zone',
		nullable: true,
		comment: `
			Thời điểm gần nhất release được phân phối thành công lên DSP.
			Chỉ cập nhật khi DSP trả về kết quả thành công.
		`,
	})
	lastDeliveredAt: Date | null;

	// Nội dung chi tiết lỗi
	@Column({
		type: 'text',
		nullable: true,
		comment: 'Nội dung chi tiết của lỗi hoặc thông tin log',
	})
	logs: string | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Danh sách issues (QA flags, validation errors, v.v.)',
	})
	issues: any | null;

	@Column({
		type: 'text',
		nullable: true,
		comment: 'Đường dẫn folder metadata trên server cho lần delivery này',
	})
	metadataPath: string | null;

	@Column({
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'Batch ID của lần delivery này',
	})
	batchId: string | null;

	@ManyToOne(() => Release, (release) => release.releaseDspDeliveries, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@ManyToOne(() => Dsp, (dsp) => dsp.releaseDsps)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
