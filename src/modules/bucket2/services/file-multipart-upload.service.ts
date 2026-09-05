import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BucketException } from '../constants/bucket.response';
import { FileMultipartUploadEntity } from '../entities/file-multipart-upload.entity';
import { MultipartUploadStatus } from '../enum/bucket.enum';

@Injectable()
export class FileMultipartUploadService {
	constructor(
		@InjectRepository(FileMultipartUploadEntity)
		private readonly repo: Repository<FileMultipartUploadEntity>,
	) {}

	create(data: {
		fileId: string;
		uploadId: string;
		tenantId: string;
		creatorId: string;
		partSize: number;
		partCount: number;
		expiresAt: Date;
	}) {
		return this.repo.save(
			this.repo.create({
				...data,
				partSize: String(data.partSize),
				status: MultipartUploadStatus.INITIATED,
				completedAt: null,
				abortedAt: null,
				failureReason: null,
			}),
		);
	}

	async findByFileIdOrFail(fileId: string) {
		const session = await this.repo.findOne({ where: { fileId } });
		if (!session) throw BucketException.MULTIPART_SESSION_NOT_FOUND();
		return session;
	}

	async findActiveByFileIdOrFail(fileId: string) {
		const session = await this.findByFileIdOrFail(fileId);
		if (session.status !== MultipartUploadStatus.INITIATED) {
			throw BucketException.MULTIPART_INVALID_STATE(session.status);
		}
		return session;
	}

	async findByFileIdForUpdate(manager: EntityManager, fileId: string) {
		const session = await manager
			.getRepository(FileMultipartUploadEntity)
			.createQueryBuilder('session')
			.setLock('pessimistic_write')
			.where('session.fileId = :fileId', { fileId })
			.getOne();
		if (!session) throw BucketException.MULTIPART_SESSION_NOT_FOUND();
		return session;
	}

	markStatus(
		id: string,
		status: MultipartUploadStatus,
		extra: Partial<
			Pick<
				FileMultipartUploadEntity,
				'completedAt' | 'abortedAt' | 'failureReason'
			>
		> = {},
	) {
		return this.repo.update(id, { status, ...extra });
	}
}
