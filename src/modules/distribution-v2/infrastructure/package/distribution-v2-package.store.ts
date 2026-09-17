import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
	PackageStore,
	PackageWorkspace,
	WorkspaceInput,
} from '../../application/ports/package-builder.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';

interface WorkspaceLease {
	readonly workspaceId: string;
	readonly distributionId: string;
	readonly attemptNo: number;
	readonly ownerId: string;
	readonly createdAt: string;
	readonly status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
	readonly leaseUntil: string | null;
}

/**
 * Filesystem implementation backed exclusively by the configured shared root.
 *
 * Workspace ids are relative to the root and never accepted from user input.
 * Every path is resolved and checked before it is touched so a malformed
 * snapshot cannot escape the shared package directory.
 */
@Injectable()
export class DistributionV2PackageStore implements PackageStore {
	private readonly logger = new Logger(DistributionV2PackageStore.name);
	private readonly ownerId = randomUUID();

	constructor(private readonly config: DistributionV2ConfigService) {}

	async createWorkspace(input: WorkspaceInput): Promise<PackageWorkspace> {
		this.assertDistributionId(input.distributionId);
		if (!Number.isSafeInteger(input.attemptNo) || input.attemptNo < 1) {
			throw new Error('attemptNo must be a positive safe integer');
		}
		if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs <= 0) {
			throw new Error('leaseMs must be a positive safe integer');
		}

		const workspaceId = `${input.distributionId}/${input.attemptNo}`;
		const rootPath = this.workspacePath(workspaceId);
		await fs.promises.mkdir(rootPath, { recursive: true });

		const now = new Date();
		const leaseUntil = new Date(now.getTime() + input.leaseMs);
		const existing = await this.readLease(workspaceId);
		const lease: WorkspaceLease = {
			workspaceId,
			distributionId: input.distributionId,
			attemptNo: input.attemptNo,
			ownerId: existing?.ownerId ?? this.ownerId,
			createdAt: existing?.createdAt ?? now.toISOString(),
			status: 'ACTIVE',
			leaseUntil: leaseUntil.toISOString(),
		};
		await this.writeJsonAtomic(rootPath, '.lease.json', lease);

		return {
			id: workspaceId,
			distributionId: input.distributionId,
			attemptNo: input.attemptNo,
			rootPath,
			packageUri: workspaceId,
			leaseUntil,
		};
	}

	async writeFile(
		workspaceId: string,
		relativePath: string,
		content: string | Buffer,
	): Promise<void> {
		const filePath = this.resolveWorkspaceFile(workspaceId, relativePath);
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		const temporaryPath = `${filePath}.${this.ownerId}.tmp`;
		await fs.promises.writeFile(temporaryPath, content);
		await fs.promises.rename(temporaryPath, filePath);
		await this.touchLease(workspaceId);
	}

	async readFile(workspaceId: string, relativePath: string): Promise<Buffer> {
		return fs.promises.readFile(
			this.resolveWorkspaceFile(workspaceId, relativePath),
		);
	}

	async fileExists(
		workspaceId: string,
		relativePath: string,
	): Promise<boolean> {
		try {
			await fs.promises.access(
				this.resolveWorkspaceFile(workspaceId, relativePath),
			);
			return true;
		} catch {
			return false;
		}
	}

	async releaseLease(
		workspaceId: string,
		status: 'ACTIVE' | 'COMPLETED' | 'FAILED' = 'COMPLETED',
	): Promise<void> {
		const rootPath = this.workspacePath(workspaceId);
		const existing = await this.readLease(workspaceId);
		if (!existing) return;
		await this.writeJsonAtomic(rootPath, '.lease.json', {
			...existing,
			status,
			leaseUntil: null,
		} satisfies WorkspaceLease);
	}

	async cleanup(workspaceId: string): Promise<void> {
		const rootPath = this.workspacePath(workspaceId);
		const lease = await this.readLease(workspaceId);
		if (this.isActiveLease(lease)) {
			throw new Error(`workspace ${workspaceId} is still leased`);
		}
		await fs.promises.rm(rootPath, { recursive: true, force: true });
	}

	async cleanupOrphans(maxAgeMs: number): Promise<string[]> {
		if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) {
			throw new Error('maxAgeMs must be a non-negative safe integer');
		}
		const rootPath = this.rootPath();
		const removed: string[] = [];
		let distributionEntries: fs.Dirent[];
		try {
			distributionEntries = await fs.promises.readdir(rootPath, {
				withFileTypes: true,
			});
		} catch (error) {
			if (isNotFound(error)) return removed;
			throw error;
		}

		const cutoff = Date.now() - maxAgeMs;
		for (const distributionEntry of distributionEntries) {
			if (!distributionEntry.isDirectory()) continue;
			this.assertDistributionId(distributionEntry.name);
			const distributionPath = this.resolveInsideRoot(
				distributionEntry.name,
			);
			const attemptEntries = await fs.promises.readdir(distributionPath, {
				withFileTypes: true,
			});
			for (const attemptEntry of attemptEntries) {
				if (
					!attemptEntry.isDirectory() ||
					!/^[1-9]\d*$/.test(attemptEntry.name)
				) {
					continue;
				}
				const workspaceId = `${distributionEntry.name}/${attemptEntry.name}`;
				const workspacePath = this.workspacePath(workspaceId);
				const stats = await fs.promises.stat(workspacePath);
				const lease = await this.readLease(workspaceId);
				if (this.isActiveLease(lease) || stats.mtimeMs > cutoff) {
					continue;
				}
				await fs.promises.rm(workspacePath, {
					recursive: true,
					force: true,
				});
				removed.push(workspaceId);
			}
			const remaining = await fs.promises.readdir(distributionPath);
			if (remaining.length === 0) {
				await fs.promises.rm(distributionPath, {
					recursive: true,
					force: true,
				});
			}
		}
		if (removed.length > 0) {
			this.logger.log(
				`Removed ${removed.length} orphan package workspace(s)`,
			);
		}
		return removed;
	}

	private async touchLease(workspaceId: string): Promise<void> {
		const lease = await this.readLease(workspaceId);
		if (!lease || lease.status !== 'ACTIVE') return;
		const leaseUntil = new Date(
			Date.now() + this.config.getPackageLeaseMs(),
		).toISOString();
		await this.writeJsonAtomic(
			this.workspacePath(workspaceId),
			'.lease.json',
			{
				...lease,
				leaseUntil,
			} satisfies WorkspaceLease,
		);
	}

	private async readLease(
		workspaceId: string,
	): Promise<WorkspaceLease | null> {
		try {
			const content = await fs.promises.readFile(
				this.resolveWorkspaceFile(workspaceId, '.lease.json'),
				'utf8',
			);
			return JSON.parse(content) as WorkspaceLease;
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
	}

	private isActiveLease(lease: WorkspaceLease | null): boolean {
		return Boolean(
			lease?.status === 'ACTIVE' &&
			lease.leaseUntil &&
			Date.parse(lease.leaseUntil) > Date.now(),
		);
	}

	private async writeJsonAtomic(
		rootPath: string,
		relativePath: string,
		value: unknown,
	): Promise<void> {
		const filePath = this.resolveWorkspaceFile(
			path.relative(this.rootPath(), rootPath),
			relativePath,
		);
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		const temporaryPath = `${filePath}.${this.ownerId}.tmp`;
		await fs.promises.writeFile(
			temporaryPath,
			`${JSON.stringify(value, null, 2)}\n`,
			'utf8',
		);
		await fs.promises.rename(temporaryPath, filePath);
	}

	private rootPath(): string {
		return path.resolve(this.config.getPackageSharedRoot());
	}

	private workspacePath(workspaceId: string): string {
		const normalized = workspaceId.replace(/\\/g, '/');
		const segments = normalized.split('/');
		if (
			segments.length !== 2 ||
			!segments[0] ||
			!/^[1-9]\d*$/.test(segments[1])
		) {
			throw new Error(`invalid package workspace id: ${workspaceId}`);
		}
		this.assertDistributionId(segments[0]);
		return this.resolveInsideRoot(...segments);
	}

	private resolveWorkspaceFile(
		workspaceId: string,
		relativePath: string,
	): string {
		const workspacePath = this.workspacePath(workspaceId);
		const normalized = relativePath.replace(/\\/g, '/');
		if (
			!normalized ||
			path.posix.isAbsolute(normalized) ||
			normalized
				.split('/')
				.some((segment) => !segment || segment === '..')
		) {
			throw new Error(`invalid package relative path: ${relativePath}`);
		}
		const resolved = path.resolve(workspacePath, ...normalized.split('/'));
		if (
			resolved !== workspacePath &&
			!resolved.startsWith(`${workspacePath}${path.sep}`)
		) {
			throw new Error(`package path escapes workspace: ${relativePath}`);
		}
		return resolved;
	}

	private resolveInsideRoot(...segments: string[]): string {
		const root = this.rootPath();
		const resolved = path.resolve(root, ...segments);
		if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
			throw new Error('package path escapes shared root');
		}
		return resolved;
	}

	private assertDistributionId(value: string): void {
		if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) {
			throw new Error(`invalid distribution id: ${value}`);
		}
	}
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: string }).code === 'ENOENT'
	);
}
