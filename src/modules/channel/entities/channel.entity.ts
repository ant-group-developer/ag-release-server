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
		type: 'uuid',
		nullable: true,
		comment: 'ID tenant so huu channel',
	})
	tenantId: string | null;

	@ManyToOne(() => Tenant, { nullable: true })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant | null;

	@OneToMany(() => Video, (video) => video.channel)
	videos: Video[];
}
