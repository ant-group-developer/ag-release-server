import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('track_localize')
export class TrackLocalize extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	languageId: string;

	@ManyToOne(() => Language, (language) => language.trackLocalizes)
	language: Language;

	@Column({ type: 'varchar', length: 10 })
	trackId: string;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;

	// relation
	@ManyToOne(() => Track, (track) => track.trackLocalizes)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
