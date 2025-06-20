import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('track_localize')
export class TrackLocalize extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	languageId: string;

	@ManyToOne(() => Language, (language) => language.trackLocalizes)
	language: Language;

	@Column({ type: 'varchar' })
	trackId: string;

	@ManyToOne(() => Track, (track) => track.trackLocalizes)
	track: Track;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;
}
