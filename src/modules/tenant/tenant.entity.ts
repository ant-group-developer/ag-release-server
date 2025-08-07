import { Expose, Type } from 'class-transformer';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	Tree,
	TreeChildren,
	TreeParent,
} from 'typeorm';
import { LENGTH_PICTURE } from '../database/constants/database.constants';
import { User } from '../user/entities/user.entity';
import { TenantType } from './tenant.enum';

@Entity({ name: 'tenants' })
@Tree('closure-table')
export class Tenant extends BaseUUIDEntity {
	@Column({ type: 'uuid', nullable: true })
	creatorId: string;

	@Column({ type: 'uuid', nullable: true })
	modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment:
			'Example: https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	logo: string;

	@Column({
		length: LENGTH_PICTURE,
		nullable: true,
		comment:
			'Example: https://storage.googleapis.com/public-ant/logo/ag.png',
	})
	icon: string;

	@Column({
		length: 100,
		nullable: true,
		comment:
			'Example: ANT Music - Distribution Unlimited Music All Platform',
	})
	title: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'ANT Music',
	})
	name: string;

	@Column({
		length: 50,
		nullable: true,
		comment: 'The domain must be without http:// or https://',
	})
	domain: string;

	@Column({
		length: 50,
		comment: 'This email will be used to send notifications',
	})
	email: string;

	@Column({
		length: 10,
		comment: 'Example: #4540BF',
		nullable: true,
	})
	primaryColor: string;

	@Column({ type: 'uuid' })
	ownerId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'owner_id' })
	owner: User;

	@Column({ type: 'boolean', default: true })
	isActive: boolean;

	@Column({ type: 'enum', enum: TenantType, default: TenantType.LABEL })
	type: TenantType;

	@TreeParent({ onDelete: 'CASCADE' })
	@JoinColumn({ name: 'parent_id' })
	@Expose()
	@Type(() => Tenant)
	parent: Tenant | null;

	@TreeChildren({ cascade: true })
	@Expose()
	@Type(() => Tenant)
	children: Tenant[];
}
