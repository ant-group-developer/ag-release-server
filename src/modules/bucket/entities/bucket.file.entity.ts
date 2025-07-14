import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('files')
export class FileEntity extends BaseUUIDEntity {
	@Column({ type: 'boolean', default: false })
	isSubmitted: boolean;

	@Column({ type: 'varchar', length: 100 + 'YYYYMMDDHHmmss_'.length })
	fileName: string;

	@Column({ type: 'varchar', length: 200 })
	key: string;

	@Column({ type: 'varchar', length: 30 })
	contentType: string;

	@Column({ type: 'varchar', length: 10 })
	extension: string;

	@Column({ type: 'bigint', comment: 'store in bytes' })
	fileSize: number;

	@Column({ type: 'varchar', length: 30 })
	bucket: string;

	// @OneToMany(() => ReleaseCoverArt, (releaseCoverArt) => releaseCoverArt.file)
	// releaseCoverArts: ReleaseCoverArt[];

	// @OneToOne(() => ReleaseCoverArt, (releaseCoverArt) => releaseCoverArt.file)
	// releaseCoverArt: ReleaseCoverArt;

	// @OneToOne(() => AudioFile, (audioFile) => audioFile.file)
	// audioFile: AudioFile;
}
