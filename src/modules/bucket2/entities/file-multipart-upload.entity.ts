import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { MultipartUploadStatus } from '../enum/bucket.enum';
import { FileEntity } from './bucket.file.entity';

@Entity('file_multipart_uploads')
export class FileMultipartUploadEntity extends BaseUUIDEntity {
	@Column({ type: 'uuid', unique: true })
	fileId: string;

	@OneToOne(() => FileEntity, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'file_id' })
	file: FileEntity;

	@Column({ type: 'text' })
	uploadId: string;

	@Column({ type: 'uuid' })
	tenantId: string;

	@Column({ type: 'uuid' })
	creatorId: string;

	@Column({ type: 'bigint' })
	partSize: string;

	@Column({ type: 'integer' })
	partCount: number;

	@Column({
		type: 'enum',
		enum: MultipartUploadStatus,
		enumName: 'file_multipart_upload_status_enum',
		default: MultipartUploadStatus.INITIATED,
	})
	status: MultipartUploadStatus;

	@Column({ type: 'timestamptz' })
	expiresAt: Date;

	@Column({ type: 'timestamptz', nullable: true })
	completedAt: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	abortedAt: Date | null;

	@Column({ type: 'text', nullable: true })
	failureReason: string | null;
}
