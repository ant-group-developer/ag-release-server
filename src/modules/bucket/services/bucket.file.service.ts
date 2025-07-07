import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { CreateFileDto } from '../dto/bucket.file.dto';
import { FileEntity } from '../entities/bucket.file.entity';

@Injectable()
export class BucketFileService {
	constructor(
		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,
	) {}

	async create(data: CreateFileDto) {
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

	async submitFile(id: string) {
		await this.fileRepo.update(id, { isSubmitted: true });
		return this.findOne(id);
	}

	async delete(id: string) {
		await this.fileRepo.delete(id);
	}
}
