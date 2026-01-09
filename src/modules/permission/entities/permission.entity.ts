import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { RolePermission } from 'src/modules/role/entities/role-permission.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('permissions', {
	comment: 'Danh mục quyền hạn (permission) dùng cho hệ thống phân quyền',
})
export class Permission extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên quyền hạn',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã quyền hạn duy nhất trong hệ thống',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NOTE,
		nullable: true,
		comment: 'Mô tả hoặc ghi chú cho quyền hạn',
	})
	note: string | null;

	@OneToMany(
		() => RolePermission,
		(rolePermission) => rolePermission.permission,
	)
	rolePermissions: RolePermission[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	userCount?: number;
	rolePermissionCount?: number;
}
