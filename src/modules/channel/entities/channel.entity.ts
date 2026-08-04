import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { ChannelStatus } from '../enum/channel.enum';
import { ChannelHistory } from './channel-history.entity';
import { UserChannel } from './user-channel.entity';

@Entity('channels', {
	comment: 'Danh muc channel dung cho video distribution',
})
@Index('IDX_channels_tenant_id', ['tenantId'])
export class Channel extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Ten channel',
	})
	name: string;

	@Column({
		type: 'enum',
		enum: ChannelStatus,
		default: ChannelStatus.PROCESSING,
		comment: 'Vevo channel creation status',
	})
	status: ChannelStatus;

	@Column({
		type: 'text',
		nullable: true,
		comment: 'Vevo channel creation error',
	})
	error: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
		comment: 'YouTube channel ID returned by Vevo',
	})
	youtubeChannelId: string | null;

	@Column({
		type: 'varchar',
		length: 500,
		nullable: true,
		comment: 'Public thumbnail URL cua channel',
	})
	thumbUrl: string | null;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'ID tenant so huu channel',
	})
	tenantId: string | null;

	@ManyToOne(() => Tenant, { nullable: true })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant | null;

	@Column({
		type: 'boolean',
		default: true,
		name: 'is_active',
		comment: 'Trạng thái hoạt động của kênh',
	})
	isActive: boolean;

	@OneToMany(() => Video, (video) => video.channel)
	videos: Video[];

	@OneToMany(() => ChannelHistory, (history) => history.channelEntity)
	histories: ChannelHistory[];

	@OneToMany(() => UserChannel, (userChannel) => userChannel.channel)
	userChannels: UserChannel[];
}
