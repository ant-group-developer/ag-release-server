import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('audio_files')
export class AudioFile extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	fileName: string;

	@Column({ type: 'varchar', length: 20 })
	sampleRate: string;

	@Column({ type: 'varchar', comment: 'Mbps' })
	bitrate: string;

	@Column({ type: 'smallint' })
	bitDepth: number;

	@Column({ type: 'varchar', length: 100 })
	key: string;

	@Column({ type: 'varchar', length: 30 })
	contentType: string;

	@Column({ type: 'varchar' })
	extension: string;

	@Column({ type: 'bigint', comment: 'store in bytes' })
	fileSize: number;

	@Column({ type: 'varchar', length: 30 })
	bucket: string;

	@Column({ type: 'int', comment: 'store in seconds' })
	duration: number;

	@Column({
		type: 'int',
		comment:
			'This is where the track will begin playing when listeners are previewing the sample',
	})
	hook: number;

	@Column({ type: 'varchar' })
	trackId: string;

	@OneToOne(() => Track, (track) => track.audioFile)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
