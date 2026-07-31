import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Channel } from './channel.entity';

@Entity('user_channels', {
	comment:
		'Bảng trung gian liên kết N-N giữa User và Channel trong Workspace',
})
@Unique(['userId', 'channelId'])
@Index('IDX_user_channels_user_tenant', ['userId', 'tenantId'])
@Index('IDX_user_channels_channel', ['channelId'])
export class UserChannel extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'uuid', name: 'user_id' })
	userId: string;

	@ManyToOne(() => User, (user) => user.userChannels, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ type: 'uuid', name: 'channel_id' })
	channelId: string;

	@ManyToOne(() => Channel, (channel) => channel.userChannels, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'channel_id' })
	channel: Channel;

	@Column({ type: 'uuid', name: 'tenant_id' })
	tenantId: string;

	@ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ type: 'uuid', nullable: true, name: 'creator_id' })
	creatorId: string | null;

	@Column({ type: 'uuid', nullable: true, name: 'modifier_id' })
	modifierId: string | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;
}
