import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

@Entity('audio_files', {
	comment: 'Thông tin kỹ thuật của file audio gắn với track',
})
export class AudioFile extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		comment: 'Tần số lấy mẫu (ví dụ: 44100Hz, 48000Hz)',
	})
	sampleRate: string;

	@Column({
		type: 'int',
		comment: 'Bitrate (Mbps) ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	bitrate: number | null;

	@Column({
		type: 'smallint',
		comment: 'Độ sâu bit (bit depth) ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	bitDepth: number | null;

	@Column({
		type: 'int',
		comment: 'Thời lượng track, tính bằng giây',
	})
	duration: number;

	@Column({
		type: 'int',
		comment: 'Số mẫu âm thanh ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	sampleLength: number | null;

	@Column({
		type: 'int',
		comment:
			'Thời lượng preview, tính bằng giây ' + COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	preview: number | null;

	@Column({
		type: 'varchar',
		comment: 'ID track liên kết',
	})
	trackId: string;

	@Column({
		type: 'uuid',
		comment: 'ID file audio gốc',
	})
	fileId: string;

	@Column({
		type: 'uuid',
		comment: 'ID file peak waveform',
		nullable: true,
	})
	peakId: string | null;

	@OneToOne(() => Track, (track) => track.audioFile)
	@JoinColumn({ name: 'track_id' })
	track: Track;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'peak_id' })
	peak: FileEntity | null;
}
