import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../organization/entities/organization.entity';
import { User } from '../user/entities/user.entity';
import { OrganizationUser } from './entities/organization-user.entity';
import { OrganizationUserController } from './organization-user.controller';
import { OrganizationUserService } from './services/organization-user.service';
import { OrganizationUserValidateService } from './services/organization-user.validate.service';

@Module({
	imports: [TypeOrmModule.forFeature([OrganizationUser, User, Organization])],
	controllers: [OrganizationUserController],
	providers: [OrganizationUserService, OrganizationUserValidateService],
})
export class OrganizationUserModule {}
