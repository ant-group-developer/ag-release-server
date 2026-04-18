import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Role } from '../role/entities/role.entity';
import { Tenant } from '../tenant/tenant.entity';

@Entity('tenant_roles', {
	comment: 'Bảng cấu hình role được kích hoạt cho từng tenant',
})
@Unique(['tenantId', 'roleId'])
export class TenantRole extends BaseUUIDEntity {
	@Column({
		type: 'boolean',
		default: true,
		comment: 'Trạng thái kích hoạt role cho tenant',
	})
	isActive: boolean;

	@Column({
		type: 'uuid',
		comment: 'ID của role',
	})
	roleId: string;

	@Column({
		type: 'uuid',
		comment: 'ID của tenant',
	})
	tenantId: string;

	@ManyToOne(() => Role, (role) => role.tenantRoles, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'role_id' })
	role: Role;

	@ManyToOne(() => Tenant, (tenant) => tenant.tenantRoles, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;
}
