import { Expose, Type } from 'class-transformer';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	Tree,
	TreeChildren,
	TreeParent,
} from 'typeorm';
import { LENGTH_PICTURE } from '../database/constants/database.constants';
import { TenantDsp } from '../tenant-dsp/tenant-dsp.entity';
import { TenantIssue } from '../tenant-issue/entities/tenant-issue.entity';
import { TenantTier } from '../tenant-tiers/entities/tenant-tiers.entity';
import { TenantUser } from '../user/entities/tenant-user.entity';
import { User } from '../user/entities/user.entity';
import { TenantType } from './tenant.enum';

@Entity('tenants', {
	comment:
		'Bảng tenant đại diện cho tổ chức / label / đối tác trong hệ thống',
})
@Tree('closure-table')
export class Tenant extends BaseUserTrackedUUIDEntity {
	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Logo của tenant (URL ảnh)',
	})
	logo: string;

	@Column({
		type: 'smallint',
		name: 'max_labels',
		comment: 'Số lượng label tối đa tenant được phép tạo',
	})
	maxLabels: number;

	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Icon đại diện của tenant (URL ảnh)',
	})
	icon: string;

	@Column({
		length: 100,
		nullable: true,
		comment: 'Tiêu đề hiển thị của tenant',
	})
	title: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'Tên tenant',
	})
	name: string;

	@Column({
		length: 50,
		nullable: true,
		unique: true,
		comment:
			'Mã slug của tenant (VD: ant-music). Dùng làm tên thư mục SFTP watch.',
	})
	code: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'Domain của tenant (không bao gồm http/https)',
	})
	domain: string;

	@Column({
		length: 50,
		comment: 'Email dùng để nhận thông báo hệ thống',
	})
	email: string;

	@Column({
		length: 10,
		nullable: true,
		comment: 'Màu chủ đạo của tenant (ví dụ: #4540BF)',
	})
	primaryColor: string;

	@Column({
		type: 'boolean',
		default: true,
		comment: 'Trạng thái kích hoạt của tenant',
	})
	isActive: boolean;

	@Column({
		type: 'enum',
		enum: TenantType,
		default: TenantType.LABEL,
		comment: 'Loại tenant (label, distributor, partner...)',
	})
	type: TenantType;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'ID gói dịch vụ (tenant tier) đang áp dụng',
	})
	tenantTierId: string | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'owner_id' })
	owner: User;

	@TreeParent({ onDelete: 'CASCADE' })
	@JoinColumn({ name: 'parent_id' })
	@Expose()
	@Type(() => Tenant)
	parent: Tenant | null;

	@TreeChildren({ cascade: true })
	@Expose()
	@Type(() => Tenant)
	children: Tenant[];

	@OneToMany(() => TenantUser, (tenantUser) => tenantUser.tenant)
	tenantUser: TenantUser[];

	@OneToMany(() => TenantDsp, (tenantDsp) => tenantDsp.tenant)
	tenantDsp: TenantDsp[];

	@OneToMany(() => TenantIssue, (tenantIssue) => tenantIssue.tenant)
	tenantIssues: TenantIssue[];

	@ManyToOne(() => TenantTier, (tenantTier) => tenantTier.tenants, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'tenant_tier_id' })
	tenantTier: TenantTier | null;
}
