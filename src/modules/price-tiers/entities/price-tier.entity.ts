import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Currency } from 'src/modules/currency/entities/currency.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { PriceTierType } from '../enum/price-tier.enum';

@Entity('price_tiers', {
	comment:
		'Danh mục mức giá (price tier) dùng cho track theo từng loại tiền tệ',
})
export class PriceTier extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: 'Mã price tier (có thể null)',
	})
	code: string | null;

	@Column({
		type: 'numeric',
		precision: 10,
		scale: 2,
		comment: 'Giá tiền của price tier',
	})
	amount: number;

	@Column({
		type: 'uuid',
		comment: 'ID tiền tệ áp dụng cho price tier',
	})
	currencyId: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu price tier mặc định của tiền tệ',
	})
	isDefault: boolean;

	@Column({
		type: 'boolean',
		default: true,
		comment: 'Trạng thái kích hoạt của price tier',
	})
	isActive: boolean;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Thứ tự hiển thị',
	})
	order: number;

	@Column({
		name: 'ci_code',
		type: 'varchar',
		length: 200,
		default: 'mid',
		comment: 'Mã CI',
	})
	ciCode: string;

	@Column({
		type: 'enum',
		enum: PriceTierType,
		default: PriceTierType.TRACK,
		comment: 'Loại price tier (album/track)',
	})
	type: PriceTierType;

	@ManyToOne(() => Currency)
	@JoinColumn({ name: 'currency_id' })
	currency: Currency;

	@OneToMany(() => Track, (track) => track.priceTier)
	tracks: Track[];

	trackCount?: number;
}
