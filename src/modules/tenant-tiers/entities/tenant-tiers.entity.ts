import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_COLOR,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('tenant_tiers', {
	comment:
		'Bảng định nghĩa các gói / cấp độ (tier) của tenant dựa trên điểm số',
})
export class TenantTier extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên tier (tiếng Việt)',
	})
	nameVi: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên tier (tiếng Anh)',
	})
	nameEn: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã tier',
	})
	code: string;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Điểm tối thiểu để đạt tier này',
	})
	minScore: number;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Điểm tối đa của tier này',
	})
	maxScore: number;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Mô tả tier',
	})
	description: string | null;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Ghi chú nội bộ cho tier',
	})
	note: string | null;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_COLOR,
		comment: 'Màu đại diện cho tier',
	})
	color: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@OneToMany(() => Tenant, (tenant) => tenant.tenantTier)
	tenants: Tenant[];
}
