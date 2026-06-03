import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Column, Entity, OneToMany } from 'typeorm';

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

	@OneToMany(() => Video, (video) => video.channel)
	videos: Video[];
}
