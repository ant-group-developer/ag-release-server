import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUUID } from 'src/database/entities/database.entity';
import { Track } from 'src/track/entities/track.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('audio_files')
export class AudioFile extends BaseEntityUUID {
	@Column({ type: 'varchar', length: 100 })
	fileName: string;

	@Column({ type: 'varchar', length: 20 })
	sampleRate: string;

	// Mbps
	@Column({ type: 'varchar', length: 10 })
	bitrate: string;

	@Column({ type: 'smallint' })
	bitDepth: number;

	@Column({ type: 'varchar', length: 100 })
	key: string;

	@Column({ type: 'varchar', length: 30 })
	contentType: string;

	@Column({ type: 'varchar', length: 10 })
	extension: string;

	// store in bytes
	@Column({ type: 'bigint' })
	fileSize: number;

	@Column({ type: 'varchar', length: 30 })
	bucket: string;

	@Column({ type: 'varchar', length: LENGTH_ID.TRACK })
	trackId: string;

	@OneToOne(() => Track, (track) => track.audioFile)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	// store in seconds
	@Column({ type: 'int' })
	duration: number;

	// This is where the track will begin playing when listeners are previewing the sample
	@Column({ type: 'int' })
	hook: number;
}
