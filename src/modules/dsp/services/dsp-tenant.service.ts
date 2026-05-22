// dsp-tenant.service.ts

import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { SftpConfigsService } from 'src/modules/distribution/sftp-configs/services/sftp-config.service';
import {
	PartialTestConnectionDto,
	SftpMetadata,
} from 'src/modules/distribution/sftp-configs/type/sftp-config.type';
import { Repository } from 'typeorm';
import { UpdateTenantDspAgreementDto } from '../dto/dsp.dto';
import {
	DspAgreementModeEnum,
	TenantDspAgreement,
} from '../entities/dsp-tenant.entity';
import { Dsp } from '../entities/dsp.entity';

@Injectable()
export class TenantDspAgreementService {
	constructor(
		@InjectRepository(TenantDspAgreement)
		private readonly agreementRepo: Repository<TenantDspAgreement>,
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly sftpConfigsService: SftpConfigsService,
	) {}

	// ADMIN: lấy list dsp + trạng thái agreement cho tenant
	async adminGetDspsForTenant(tenantId: string) {
		const [dsps, agreements] = await Promise.all([
			this.dspRepo.find({
				where: { isActive: true },
				order: { name: 'ASC' },
			}),
			this.agreementRepo.find({ where: { tenantId } }),
		]);

		const agreementMap = new Map(agreements.map((a) => [a.dspId, a]));

		return dsps.map((dsp) => {
			const agreement = agreementMap.get(dsp.id) ?? null;
			return {
				agreementId: agreement?.id ?? null,
				dsp,
				isActive: agreement?.isActive ?? dsp.isDefault ?? false,
				mode: agreement?.mode ?? null,
			};
		});
	}

	// ADMIN: bật tắt quyền dsp cho tenant
	async adminToggleDsp(
		tenantId: string,
		items: {
			dspId: string;
			isActive: boolean;
		}[],
	) {
		await this.agreementRepo.upsert(
			items.map((item) => ({
				tenantId,
				dspId: item.dspId,
				isActive: item.isActive,
			})),
			{
				conflictPaths: ['tenantId', 'dspId'],
			},
		);
	}

	// TENANT: lấy list dsp đã được cấp quyền
	async tenantGetDsps(tenantId?: string): Promise<TenantDspAgreement[]> {
		if (tenantId === 'system-tenant') {
			throw new ResponseError({
				message: 'system-tenant không có agreement',
				messageCode: 'SYSTEM_TENANT_NO_AGREEMENT',
			});
		}

		// system-tenant sẽ dùng danh sách DSP mặc định của hệ thống,
		// không lấy agreement riêng theo tenant
		// if (tenantId === 'system-tenant') {
		// 	tenantId = undefined;
		// }

		// Lấy song song:
		// 1. Các DSP tenant đã được config riêng
		// 2. Các DSP mặc định của hệ thống
		const [agreements, defaultDsps] = await Promise.all([
			this.agreementRepo.find({
				where: { tenantId, isActive: true },
				relations: ['dsp', 'sftpConfig'],
			}),
			this.dspRepo.find({
				where: { isDefault: true, isActive: true },
				relations: ['dspRoutingConfig'],
			}),
		]);

		// Danh sách DSP đã tồn tại agreement
		// để tránh bị duplicate khi merge với DSP mặc định
		const agreementDspIds = new Set(agreements.map((a) => a.dspId));

		// Convert DSP mặc định thành object TenantDspAgreement giả lập
		// để thống nhất schema trả ra cho frontend
		const fromDefaults: TenantDspAgreement[] = defaultDsps
			.filter((dsp) => !agreementDspIds.has(dsp.id))
			.map((dsp) => {
				const entity = new TenantDspAgreement();

				entity.tenantId = tenantId as string;
				entity.dspId = dsp.id;
				entity.dsp = dsp;

				// DSP mặc định luôn active
				entity.isActive = true;

				// Đánh dấu đây là config hệ thống
				entity.mode = DspAgreementModeEnum.SYSTEM;

				// Mapping routing config mặc định từ DSP
				entity.sftpConfigId =
					dsp.dspRoutingConfig?.sftpConfigId ?? null;

				entity.sftpConfig = dsp.dspRoutingConfig?.sftpConfig ?? null;

				return entity;
			});

		// Merge agreement tenant + DSP mặc định
		// sau đó sort theo tên DSP
		return [...agreements, ...fromDefaults].sort((a, b) =>
			(a.dsp?.name ?? '').localeCompare(b.dsp?.name ?? ''),
		);
	}

	async updateAgreement(
		tenantId: string | undefined,
		dspId: string,
		dto: UpdateTenantDspAgreementDto,
	) {
		if (tenantId === 'system-tenant') {
			throw new BadRequestException(
				'system-tenant không thể update agreement',
			);
		}

		let agreement = await this.agreementRepo.findOne({
			where: { tenantId, dspId },
		});

		// Nếu chưa có agreement (DSP mặc định) → tạo mới
		if (!agreement) {
			agreement = await this.agreementRepo.save(
				this.agreementRepo.create({
					tenantId,
					dspId,
					isActive: true,
					mode: DspAgreementModeEnum.SYSTEM,
				}),
			);
		}

		let sftpConfigId = agreement.sftpConfigId;

		if (dto.sftpConfig) {
			const created = await this.sftpConfigsService.upsert({
				data: {
					id: dto.sftpConfig.id,
					ernVersion: dto.sftpConfig.ernVersion as any,
					metadata: dto.sftpConfig.metadata,
				},
			});
			sftpConfigId = created.id;
		}

		await this.agreementRepo.update(agreement.id, {
			...(dto.mode !== undefined && { mode: dto.mode }),
			sftpConfigId,
		});
	}

	async testConnectByAgreement({
		tenantId,
		dspId,
		data,
	}: {
		tenantId: string;
		dspId: string;
		data: PartialTestConnectionDto;
	}) {
		const agreement = await this.agreementRepo.findOne({
			where: { tenantId, dspId },
			relations: ['sftpConfig'],
		});

		if (!agreement) throw new NotFoundException('Agreement không tồn tại');

		const metadata = agreement.sftpConfig?.metadata;

		const testConfig: SftpMetadata = {
			host: data.host ?? metadata?.host ?? '',
			port: data.port ?? metadata?.port ?? 22,
			username: data.username ?? metadata?.username ?? '',
			password: data.password ?? metadata?.password,
			privateKey: data.privateKey ?? metadata?.privateKey,
			path: data.path ?? metadata?.path,
		};

		return this.sftpConfigsService.testConnect(testConfig);
	}
}
