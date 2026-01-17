import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';

import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { DspAgreementType } from 'src/modules/distribution-channel/enums/distribution-channel.enum';
import { TenantIntegrationOrderBy } from '../enum/enum';

import { Type } from 'class-transformer';
import { IsObject, MaxLength } from 'class-validator';
import { ConnectionCredentials } from '../entites/tenant-integration.entity';

export class CreateTenantIntegrationConnectionDto {
	// @IsUUID()
	// @IsNotEmpty()
	// tenantIntegrationId: string;

	@IsUUID()
	id: string;

	@IsEnum(DspAgreementType)
	agreementType: DspAgreementType;

	/**
	 * ANT / Merlin: có thể null
	 * Direct: bắt buộc
	 */
	@IsOptional()
	@IsString()
	@MaxLength(20)
	protocol?: string;

	/**
	 * ANT / Merlin: null
	 * Direct: { host, port, username, password, ... }
	 */
	@IsOptional()
	@IsObject()
	credentials?: ConnectionCredentials;
}

export class CreateTenantIntegrationDto {
	@IsBoolean()
	@IsOptional()
	isActive?: boolean;

	@IsString()
	dspId: string;

	@IsUUID()
	tenantId: string;

	@IsEnum(DspAgreementType)
	agreementType: DspAgreementType;

	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateTenantIntegrationConnectionDto)
	integrationConnections: CreateTenantIntegrationConnectionDto[];
}

export class UpdateTenantIntegrationConnectionDto {
	@IsUUID()
	id: string;

	@IsOptional()
	@IsString()
	@MaxLength(20)
	protocol?: string;

	// @IsOptional()
	// name: string;

	@IsOptional()
	@IsObject()
	credentials?: Record<string, any>;
}

export class UpdateTenantIntegrationDto {
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateTenantIntegrationConnectionDto)
	integrationConnections?: UpdateTenantIntegrationConnectionDto[];
}

export class GetListTenantIntegrationsDto extends BaseQueryDto2 {
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@IsOptional()
	@IsString()
	dspId?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@IsEnum(TenantIntegrationOrderBy)
	@IsOptional()
	fieldOrder: TenantIntegrationOrderBy = TenantIntegrationOrderBy.CREATED_AT;
}
