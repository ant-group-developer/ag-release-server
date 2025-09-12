import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('audio_files')
export class AudioFile extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
	})
	sampleRate: string;

	@Column({
		type: 'varchar',
		comment: 'Mbps' + ' & ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
		length: 10,
	})
	bitrate: string | null;

	@Column({
		type: 'smallint',
		comment: ' & ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	bitDepth: number | null;

	@Column({ type: 'int', comment: 'store in seconds' })
	duration: number;

	@Column({
		type: 'int',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	sampleLength: number | null;

	@Column({
		type: 'int',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	preview: number | null;

	@Column({ type: 'varchar' })
	trackId: string;

	@Column({ type: 'uuid' })
	fileId: string;

	@Column({ type: 'uuid' })
	peakId: string;

	// relation
	@OneToOne(() => Track, (track) => track.audioFile)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'peak_id' })
	peak: FileEntity;
}
