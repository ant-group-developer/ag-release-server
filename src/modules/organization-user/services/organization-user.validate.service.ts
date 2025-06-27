import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class OrganizationUserValidateService {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepo: Repository<Organization>,

		@InjectRepository(User)
		private readonly userRepo: Repository<User>,
	) {}

	async validate({
		userId,
		organizationId,
	}: {
		userId: string;
		organizationId: string;
	}) {
		const user = await this.userRepo.findOne({ where: { id: userId } });
		const organization = await this.organizationRepo.findOne({
			where: { id: organizationId },
		});

		if (!user || !organization) {
			throw new NotFoundException('User or Organization not found');
		}

		return true;
	}
}
