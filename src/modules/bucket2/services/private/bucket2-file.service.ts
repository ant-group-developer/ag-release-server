import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bucket2Exception } from '../../const/bucket2.response';
import { FileEntity2 } from '../../entities/bucket2.entity';

@Injectable()
export class BucketFileService2 {
	constructor(
		@InjectRepository(FileEntity2)
		private readonly fileRepo: Repository<FileEntity2>,
	) {}

	async create(data: any) {
		const file = this.fileRepo.create(data);
		return await this.fileRepo.save(file);
	}

	async findOne(id: string) {
		const file = await this.fileRepo.findOne({ where: { id } });

		if (!file) {
			throw Bucket2Exception.NOT_FOUND();
		}

		return file;
	}

	async update(id: string, { fileName }: { fileName: string }) {
		const file = await this.fileRepo.findOne({ where: { id } });

		if (!file) {
			throw Bucket2Exception.NOT_FOUND();
		}

		await this.fileRepo.update(id, { fileName });
	}

	async submit(id: string) {
		await this.fileRepo.update(id, { isSubmitted: true });
		return this.findOne(id);
	}

	async delete(id: string) {
		await this.fileRepo.delete(id);
	}
}
