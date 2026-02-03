import { BaseEntity } from 'src/common/entities/base.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Track } from '../../track/entities/track.entity';

@Entity('track_revenue', {
	comment:
		'Bảng lưu doanh thu của track theo từng DSP, quốc gia và ngày báo cáo',
})
export class TrackRevenue extends BaseEntity {
	@Column({
		type: 'date',
		comment: 'Ngày phát sinh doanh thu (report date)',
	})
	reportDate: Date;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID DSP nguồn doanh thu',
	})
	dspId: string;

	@Column({
		type: 'varchar',
		length: 2,
		comment: 'Mã quốc gia (ISO-2) phát sinh doanh thu',
	})
	countryCode: string;

	@Column({
		type: 'varchar',
		length: 3,
		comment: 'Mã tiền tệ (ISO-4217)',
	})
	currencyCode: string;

	@Column({
		type: 'numeric',
		precision: 30,
		scale: 21,
		comment: 'Số tiền doanh thu ròng',
	})
	amount: number;

	@Column({
		type: 'varchar',
		comment: 'Cấu hình phân phối / loại giao dịch từ DSP',
	})
	configuration: string;

	@Column({
		type: 'varchar',
		comment: 'ID track phát sinh doanh thu',
		length: 10,
	})
	trackId: string;

	@ManyToOne(() => Track, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@ManyToOne(() => Dsp)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;
}
