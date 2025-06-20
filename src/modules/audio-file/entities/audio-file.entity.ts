import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('audio_files')
export class AudioFile extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	fileName: string;

	@Column({ type: 'varchar', length: 20 })
	sampleRate: string;

	// Mbps
	@Column({ type: 'varchar' })
	bitrate: string;

	@Column({ type: 'smallint' })
	bitDepth: number;

	@Column({ type: 'varchar', length: 100 })
	key: string;

	@Column({ type: 'varchar', length: 30 })
	contentType: string;

	@Column({ type: 'varchar' })
	extension: string;

	// store in bytes
	@Column({ type: 'bigint' })
	fileSize: number;

	@Column({ type: 'varchar', length: 30 })
	bucket: string;

	// store in seconds
	@Column({ type: 'int' })
	duration: number;

	// This is where the track will begin playing when listeners are previewing the sample
	@Column({ type: 'int' })
	hook: number;

	@Column({ type: 'varchar' })
	trackId: string;

	@OneToOne(() => Track, (track) => track.audioFile)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
