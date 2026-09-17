import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DspRoutingConfig } from 'src/modules/distribution/dsp-routing/entities/dsp-routing-config.entity';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { SftpMetadata } from 'src/modules/distribution/sftp-configs/type/sftp-config.type';
import { decryptSecretSafe } from 'src/utils/util.encrypt';
import { Repository } from 'typeorm';
import {
	DistributionV2SftpConfigResolver,
	DistributionV2SftpConnection,
} from '../../application/ports/sftp-delivery.port';

@Injectable()
export class DistributionV2SftpConfigResolverImpl implements DistributionV2SftpConfigResolver {
	constructor(
		@InjectRepository(DspRoutingConfig)
		private readonly routingRepository: Repository<DspRoutingConfig>,
	) {}

	async resolve(dspCode: string): Promise<DistributionV2SftpConnection> {
		const normalizedCode = dspCode.trim().toUpperCase();
		if (!normalizedCode) throw new Error('dspCode is required');

		const routing = await this.routingRepository
			.createQueryBuilder('routing')
			.leftJoinAndSelect('routing.dsp', 'dsp')
			.leftJoinAndSelect('routing.sftpConfig', 'sftpConfig')
			.where('UPPER(dsp.code) = :code', { code: normalizedCode })
			.andWhere('routing.isActive = true')
			.getOne();

		if (!routing) {
			throw new Error(
				`active SFTP routing for DSP ${normalizedCode} not found`,
			);
		}
		if (routing.mode !== RoutingModeEnum.DIRECT) {
			throw new Error(
				`DSP ${normalizedCode} is not configured for direct SFTP delivery`,
			);
		}

		const metadata = routing.sftpConfig?.metadata;
		if (!metadata) {
			throw new Error(
				`SFTP metadata for DSP ${normalizedCode} not found`,
			);
		}
		return normalizeConnection(metadata);
	}
}

function normalizeConnection(
	metadata: SftpMetadata,
): DistributionV2SftpConnection {
	const host = metadata.host?.trim();
	const username = metadata.username?.trim();
	if (!host) throw new Error('SFTP host is required');
	if (!username) throw new Error('SFTP username is required');

	const port = metadata.port ?? 22;
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`invalid SFTP port: ${port}`);
	}
	if (!metadata.password && !metadata.privateKey) {
		throw new Error('SFTP password or privateKey is required');
	}

	return {
		host,
		port,
		username,
		password: metadata.password
			? decryptSecretSafe(metadata.password)
			: undefined,
		privateKey: metadata.privateKey
			? decryptSecretSafe(metadata.privateKey)
			: undefined,
		basePath: normalizeRemoteBasePath(metadata.path),
	};
}

function normalizeRemoteBasePath(value?: string): string {
	const candidate = value?.trim();
	if (!candidate) return '/';
	const normalized = `/${candidate.replace(/\\/g, '/').replace(/^\/+/, '')}`;
	const segments = normalized.split('/');
	if (segments.some((segment) => segment === '..')) {
		throw new Error('SFTP base path cannot contain parent traversal');
	}
	return normalized.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}
