import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { ChannelStatus } from '../enum/channel.enum';

@Entity('channels', {
	comment: 'Danh muc channel dung cho video distribution',
})
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

	@OneToMany(() => Video, (video) => video.channel)
	videos: Video[];
}
