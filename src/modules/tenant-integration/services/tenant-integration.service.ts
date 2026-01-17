// tenant-integration.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DspAgreementType } from 'src/modules/distribution-channel/enums/distribution-channel.enum';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { newTransaction } from 'src/utils/utils.transaction';
import { In, Not, Repository } from 'typeorm';
import { TenantIntegrationException } from '../const/tenant-integration.const';
import {
	CreateTenantIntegrationDto,
	GetListTenantIntegrationsDto,
	UpdateTenantIntegrationDto,
} from '../dto/tenant-integration.dto';
import {
	ConnectionCredentials,
	TenantIntegration,
	TenantIntegrationConnection,
} from '../entites/tenant-integration.entity';
import { TenantIntegrationQueryService } from './tenant-integration-query.service';

@Injectable()
export class TenantIntegrationService {
	constructor(
		@InjectRepository(TenantIntegration)
		private readonly tenantIntegrationRepo: Repository<TenantIntegration>,

		@InjectRepository(TenantIntegrationConnection)
		private readonly tenantIntegrationConnectionRepo: Repository<TenantIntegrationConnection>,

		private readonly tenantIntegrationQueryService: TenantIntegrationQueryService,
	) {}

	async create({
		data,
		userId,
	}: {
		data: CreateTenantIntegrationDto;
		userId: string;
	}) {
		await this.validateUnique({
			tenantId: data.tenantId,
			dspId: data.dspId,
		});

		// Optional: check trùng agreementType trong request
		const types = (data.integrationConnections ?? []).map(
			(x) => x.agreementType,
		);
		if (new Set(types).size !== types.length) {
			throw new BadRequestException(
				'Không được truyền trùng agreementType',
			);
		}

		const tx = await newTransaction(this.tenantIntegrationRepo);

		try {
			const tiRepo = tx.manager.getRepository(TenantIntegration);
			const connRepo = tx.manager.getRepository(
				TenantIntegrationConnection,
			);

			// 1) Tạo TenantIntegration (cha)
			const entity = tiRepo.create({
				isActive: data.isActive ?? true,
				tenantId: data.tenantId,
				dspId: data.dspId,
				creatorId: userId,
				modifierId: userId,
			});

			const saved = await tiRepo.save(entity);

			// 2) Tạo connections (con)
			const connections = (data.integrationConnections ?? []).map((c) =>
				connRepo.create({
					// luôn override theo saved.id
					tenantIntegrationId: saved.id,
					agreementType: c.agreementType,
					// isActive: c.isActive ?? true,
					protocol: c.protocol ?? null,
					credentials: c.credentials ?? null,
					creatorId: userId,
					modifierId: userId,
				}),
			);

			if (connections.length) {
				await connRepo.save(connections);
			}

			await tx.commitTransaction();
			return this.findOne(saved.id);
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	// async autoCreateAllTenantIntegrations(userId: string) {
	// 	const tx = await newTransaction(this.tenantIntegrationRepo);

	// 	try {
	// 		const dspRepo = tx.manager.getRepository(Dsp);
	// 		const tenantRepo = tx.manager.getRepository(Tenant);
	// 		const tiRepo = tx.manager.getRepository(TenantIntegration);

	// 		// 1) Lấy toàn bộ DSP + Tenant (chỉ lấy id cho nhẹ)
	// 		const [dsps, tenants] = await Promise.all([
	// 			dspRepo.find({ select: { id: true } as any }),
	// 			tenantRepo.find({ select: { id: true } as any }),
	// 		]);

	// 		if (!dsps.length || !tenants.length) {
	// 			await tx.commitTransaction();
	// 			return { created: 0, skipped: 0 };
	// 		}

	// 		const dspIds = dsps.map((d) => d.id);
	// 		const tenantIds = tenants.map((t) => t.id);

	// 		// 2) Lấy các cặp đã tồn tại (lọc trong tập id để khỏi quét full bảng)
	// 		const existed = await tiRepo.find({
	// 			select: { dspId: true, tenantId: true } as any,
	// 			where: {
	// 				dspId: In(dspIds),
	// 				tenantId: In(tenantIds),
	// 			},
	// 		});

	// 		const existedSet = new Set(
	// 			existed.map((x) => `${x.tenantId}::${x.dspId}`),
	// 		);

	// 		// 3) Build danh sách cần insert
	// 		const toInsert: Partial<TenantIntegration>[] = [];
	// 		let skipped = 0;

	// 		for (const tenantId of tenantIds) {
	// 			for (const dspId of dspIds) {
	// 				const key = `${tenantId}::${dspId}`;
	// 				if (existedSet.has(key)) {
	// 					skipped++;
	// 					continue;
	// 				}

	// 				toInsert.push({
	// 					tenantId,
	// 					dspId,
	// 					isActive: true,
	// 					agreementType: DspAgreementType.ANT,
	// 					creatorId: userId,
	// 					modifierId: userId,
	// 				});
	// 			}
	// 		}

	// 		// 4) Bulk insert
	// 		if (toInsert.length) {
	// 			await tiRepo.insert(toInsert);
	// 		}

	// 		await tx.commitTransaction();
	// 		return {
	// 			created: toInsert.length,
	// 			skipped,
	// 			total: tenantIds.length * dspIds.length,
	// 		};
	// 	} catch (e) {
	// 		await tx.rollbackTransaction();
	// 		throw e;
	// 	} finally {
	// 		await tx.release();
	// 	}
	// }

	async autoCreateAllTenantIntegrations(userId: string) {
		const tx = await newTransaction(this.tenantIntegrationRepo);

		try {
			const dspRepo = tx.manager.getRepository(Dsp);
			const tenantRepo = tx.manager.getRepository(Tenant);
			const tiRepo = tx.manager.getRepository(TenantIntegration);
			const connRepo = tx.manager.getRepository(
				TenantIntegrationConnection,
			);

			// 1) Lấy toàn bộ DSP + Tenant (chỉ lấy id)
			const [dsps, tenants] = await Promise.all([
				dspRepo.find({ select: { id: true } }),
				tenantRepo.find({ select: { id: true } }),
			]);

			if (!dsps.length || !tenants.length) {
				await tx.commitTransaction();
				return {
					tenantIntegrationsCreated: 0,
					connectionsCreated: 0,
					totalPairs: 0,
				};
			}

			const dspIds = dsps.map((d) => d.id);
			const tenantIds = tenants.map((t) => t.id);

			// 2) Lấy các TenantIntegration đã tồn tại
			const existed = await tiRepo.find({
				select: { id: true, tenantId: true, dspId: true },
				where: {
					dspId: In(dspIds),
					tenantId: In(tenantIds),
				},
			});

			const existedSet = new Set(
				existed.map((x) => `${x.tenantId}::${x.dspId}`),
			);

			// 3) Build danh sách TenantIntegration cần insert (thiếu)
			const toInsertTI: Partial<TenantIntegration>[] = [];
			for (const tenantId of tenantIds) {
				for (const dspId of dspIds) {
					const key = `${tenantId}::${dspId}`;
					if (existedSet.has(key)) continue;

					toInsertTI.push({
						tenantId,
						dspId,
						isActive: true,
						creatorId: userId,
						modifierId: userId,
					});
				}
			}

			// 4) Insert TenantIntegration (bulk)
			if (toInsertTI.length) {
				await tiRepo.insert(toInsertTI);
			}

			// 5) Lấy lại toàn bộ TenantIntegration (cũ + mới) để tạo connections
			const allTI = await tiRepo.find({
				select: { id: true },
				where: {
					dspId: In(dspIds),
					tenantId: In(tenantIds),
				},
			});

			// ✅ credentials skeleton cho DIRECT/CI
			const emptyCredentials = {
				host: null,
				port: null,
				username: null,
				password: null,
			};

			// 6) Build 4 connections cho mỗi TI
			const connectionTemplates: Array<{
				agreementType: DspAgreementType;
				name: string;
				description: string | null;
				requiresCredentials: boolean;
				credentials: ConnectionCredentials | null;
			}> = [
				{
					agreementType: DspAgreementType.ANT,
					name: 'ANT Music',
					description: 'Không cần thông tin xác thực kết nối.',
					requiresCredentials: false,
					credentials: null,
				},
				{
					agreementType: DspAgreementType.MERLIN,
					name: 'Merlin',
					description:
						'Thông tin xác thực kết nối sẽ được nhập bằng Tài khoản Quản lý. Vui lòng đảm bảo bạn đã điền và gửi cho họ bằng tính "Client Distribution Deals".',
					requiresCredentials: false,
					credentials: null,
				},
				{
					agreementType: DspAgreementType.DIRECT,
					name: 'Thoả thuận trực tiếp',
					description: null,
					requiresCredentials: true,
					credentials: emptyCredentials,
				},
				{
					agreementType: DspAgreementType.CI,
					name: 'Thoả thuận trực tiếp', // nếu muốn hiển thị "CI" thì đổi lại
					description: null,
					requiresCredentials: true,
					credentials: emptyCredentials,
				},
			];

			const toInsertConn: Partial<TenantIntegrationConnection>[] = [];
			for (const ti of allTI) {
				for (const tpl of connectionTemplates) {
					toInsertConn.push({
						tenantIntegrationId: ti.id,
						agreementType: tpl.agreementType,
						name: tpl.name,
						description: tpl.description,
						requiresCredentials: tpl.requiresCredentials,
						protocol: null,
						credentials: tpl.credentials, // ✅ DIRECT/CI có object nulls
						creatorId: userId,
						modifierId: userId,
					});
				}
			}

			// 7) Insert connections: ON CONFLICT DO NOTHING (bỏ qua trùng)
			let connectionsCreated = 0;
			if (toInsertConn.length) {
				const res = await connRepo
					.createQueryBuilder()
					.insert()
					.into(TenantIntegrationConnection)
					.values(toInsertConn)
					.orIgnore()
					.execute();

				connectionsCreated = res.raw?.rowCount ?? 0;
			}

			await tx.commitTransaction();

			return {
				tenantIntegrationsCreated: toInsertTI.length,
				connectionsCreated,
				totalPairs: tenantIds.length * dspIds.length,
				totalTenantIntegrations: allTI.length,
				connectionsPerIntegration: 4,
			};
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async findOne(id: string) {
		const entity = await this.tenantIntegrationRepo.findOne({
			where: { id },
			relations: {
				dsp: true,
				tenant: true,
				connections: true,
			},
		});
		if (!entity) {
			throw TenantIntegrationException.NOT_FOUND();
		}
		return entity;
	}

	async getList(filter: GetListTenantIntegrationsDto) {
		return this.tenantIntegrationQueryService.getList(filter);
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateTenantIntegrationDto;
		userId: string;
	}) {
		const current = await this.tenantIntegrationRepo.findOne({
			where: { id },
			relations: { connections: true },
		});
		if (!current) throw TenantIntegrationException.NOT_FOUND();

		const { integrationConnections, ...updateData } = data;

		const tx = await newTransaction(this.tenantIntegrationRepo);

		try {
			const tiRepo = tx.manager.getRepository(TenantIntegration);
			const connRepo = tx.manager.getRepository(
				TenantIntegrationConnection,
			);

			// update cha (nếu có field)
			if (Object.keys(updateData).length) {
				await tiRepo.update(id, {
					...updateData,
					modifierId: userId,
				});
			}

			if (
				Array.isArray(integrationConnections) &&
				integrationConnections.length
			) {
				// check trùng id trong request
				const ids = integrationConnections.map((x) => x.id);
				if (new Set(ids).size !== ids.length) {
					throw new BadRequestException(
						'Không được truyền trùng connection id',
					);
				}

				// map connections hiện có theo id
				const currentById = new Map(
					(current.connections ?? []).map((c) => [c.id, c]),
				);

				const emptyCredentials = {
					host: null,
					port: null,
					username: null,
					password: null,
				};

				for (const reqConn of integrationConnections) {
					const existed = currentById.get(reqConn.id);
					if (!existed) {
						throw new BadRequestException(
							`Connection id=${reqConn.id} không thuộc TenantIntegration ${id}`,
						);
					}

					// Không cho update nếu không require credentials (tuỳ rule)
					if (!existed.requiresCredentials) {
						// ignore: FE gửi nhưng BE không update
						continue;
					}

					await connRepo.update(existed.id, {
						protocol: reqConn.protocol ?? existed.protocol ?? null,
						credentials: reqConn.credentials ?? emptyCredentials,
						// name: reqConn.name,
						modifierId: userId,
					});
				}
			}

			await tx.commitTransaction();
			return this.findOne(id);
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.tenantIntegrationRepo.delete(id);
	}

	private async validateUnique({
		tenantId,
		dspId,
		excludeId,
	}: {
		tenantId: string;
		dspId: string;
		excludeId?: string;
	}) {
		const existed = await this.tenantIntegrationRepo.findOne({
			where: {
				tenantId,
				dspId,
				...(excludeId ? { id: Not(excludeId) } : {}),
			},
		});

		if (existed) {
			throw TenantIntegrationException.DSP_ALREADY_ENABLED();
		}
	}
}
