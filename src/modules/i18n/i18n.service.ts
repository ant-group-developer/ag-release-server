import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nEntity } from './entities/i18n.entity';
import { CreateI18nDto } from './i18n.dto';

@Injectable()
export class I18nService {
	constructor(
		@InjectRepository(I18nEntity)
		private readonly repo: Repository<I18nEntity>,
	) {}

	async create(dto: CreateI18nDto) {
		const entity = this.repo.create(dto);

		try {
			return await this.repo.save(entity);
		} catch (e: any) {
			if (String(e?.code) === '23505') {
				throw new BadRequestException(
					'i18n key + locale already exists',
				);
			}
			throw e;
		}
	}

	async findOne(input: { locale: string; key: string }) {
		const { locale, key } = input;

		const found = await this.repo.findOne({
			where: { locale, key },
		});

		if (!found) {
			throw new NotFoundException('i18n not found');
		}

		return {
			key: found.key,
			locale: found.locale,
			value: found.value,
			description: found.description,
		};
	}

	// async update(locale: string, key: string, value: string) {
	// 	const found = await this.findOne({ locale, key });
	// 	found.value = value;
	// 	return this.repo.save(found);
	// }

	async remove(locale: string, key: string) {
		await this.repo.delete({ locale, key });
		return { deleted: true };
	}
}
