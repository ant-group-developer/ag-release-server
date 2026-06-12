import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';
import { Channel } from './channel.entity';

@Entity('channel_histories', {
	comment: 'Lich su thay doi cac truong quan trong cua channel',
})
@Index('IDX_channel_histories_channel_id', ['channelId'])
export class ChannelHistory extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID nguoi thuc hien thay doi',
	})
	userId: string;

	@Column({
		type: 'uuid',
		comment: 'ID channel duoc thay doi',
	})
	channelId: string;

	@Column({
		type: 'jsonb',
		comment: 'Snapshot channel truoc khi thay doi',
	})
	channel: Channel;
}
