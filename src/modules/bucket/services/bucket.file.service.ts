import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Like, Repository } from 'typeorm';

import { FileEntity } from '../entities/bucket.file.entity';
import { ICreateFile } from '../interfaces/bucket.interface';

@Injectable()
export class BucketFileService {
	constructor(
		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,
	) {}

	async create(data: ICreateFile) {
		const file = this.fileRepo.create(data);
		return await this.fileRepo.save(file);
	}

	async findOne(id: string) {
		const file = await this.fileRepo.findOne({ where: { id } });

		if (!file) {
			throw new ResponseError({ message: 'File not found' });
		}

		return file;
	}

	async getFilesByPrefix({ prefix }: { prefix: string; isPublic?: boolean }) {
		return this.fileRepo.find({
			where: {
				key: Like(`${prefix}%`),
			},
			order: {
				key: 'ASC',
			},
		});
	}

	async update(id: string, { fileName }: { fileName: string }) {
		const file = await this.fileRepo.findOne({ where: { id } });

		if (!file) {
			throw new ResponseError({ message: 'File not found' });
		}

		await this.fileRepo.update(id, { fileName });

		// return this.findOne(id);
	}

	async submit(id: string) {
		await this.fileRepo.update(id, { isSubmitted: true });
		return this.findOne(id);
	}

	async delete(id: string) {
		await this.fileRepo.delete(id);
	}
}
