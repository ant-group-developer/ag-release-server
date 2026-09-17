import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import { create } from 'xmlbuilder2';
import {
	BuildPackageInput,
	DISTRIBUTION_V2_PACKAGE_ASSET_READER,
	DISTRIBUTION_V2_PACKAGE_STORE,
	DistributionV2PackageChannel,
	DistributionV2PackageRelease,
	DistributionV2PackageTrack,
	PackageArtifact,
	PackageAssetReader,
	PackageFileEntry,
	PackageManifest,
	PackageStore,
} from '../../application/ports/package-builder.port';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';

interface ResourcePlan {
	readonly key: string;
	readonly sourceFileId: string;
	readonly relativePath: string;
	readonly kind: 'resource';
	readonly expectedSize: number | null;
}

interface RenderedMessage {
	readonly content: string;
	readonly resourcePaths: readonly string[];
}

/**
 * Builds a self-contained v2 package from the immutable snapshot only.
 *
 * The generated XML is intentionally a stable v2 envelope. Channel-specific
 * transport/schema adapters are implemented in later phases; this phase owns
 * deterministic materialization and shared storage boundaries.
 */
@Injectable()
export class DistributionV2PackageBuilder {
	constructor(
		@Inject(DISTRIBUTION_V2_PACKAGE_STORE)
		private readonly store: PackageStore,
		@Inject(DISTRIBUTION_V2_PACKAGE_ASSET_READER)
		private readonly assets: PackageAssetReader,
		private readonly config: DistributionV2ConfigService,
	) {}

	async build(input: BuildPackageInput): Promise<PackageArtifact> {
		this.assertInput(input);
		const workspace = await this.store.createWorkspace({
			distributionId: input.distributionId,
			attemptNo: input.attemptNo,
			leaseMs: this.config.getPackageLeaseMs(),
		});

		try {
			const existing = await this.tryReadExisting(input, workspace.id);
			if (existing) {
				await this.store.releaseLease(workspace.id, 'COMPLETED');
				return existing;
			}

			const release = readRelease(input.snapshot.payload);
			if (!release || release.id !== input.snapshot.releaseId) {
				throw new Error(
					`snapshot ${input.snapshot.id} has no matching release payload`,
				);
			}
			const upc = resolveUpc(input, release);
			const tracks = [...(release.tracks ?? [])].sort(
				(a, b) => a.order - b.order || a.id.localeCompare(b.id),
			);
			const resourcePlans = buildResourcePlans(input, release, tracks);
			const assetBuffers = new Map<
				string,
				Awaited<ReturnType<PackageAssetReader['read']>>
			>();
			const files: PackageFileEntry[] = [];
			const channelManifests: PackageManifest['channels'][number][] = [];
			const externalIds: Record<string, string> = {};

			const channels = [...input.channels].sort(
				(a, b) =>
					a.dspCode.localeCompare(b.dspCode) ||
					a.id.localeCompare(b.id),
			);
			if (channels.length === 0) {
				throw new Error('package build requires at least one channel');
			}

			for (const channel of channels) {
				const externalId = stableExternalId(
					channel,
					input.distributionId,
				);
				externalIds[channel.id] = externalId;
				const channelRoot = `${externalId}/${safeSegment(upc)}`;
				const resourcePaths: string[] = [];

				for (const plan of resourcePlans) {
					const targetPath = `${channelRoot}/${plan.relativePath}`;
					const source = await this.readAsset(plan, assetBuffers);
					await this.store.writeFile(
						workspace.id,
						targetPath,
						source.buffer,
					);
					files.push({
						path: targetPath,
						size: source.buffer.length,
						sha256: sha256(source.buffer),
						kind: 'resource',
						channelId: channel.id,
					});
					resourcePaths.push(targetPath);
				}

				const rendered = renderMessageXml({
					input,
					release,
					tracks,
					channel,
					externalId,
					upc,
					resourcePaths,
					resourcePlans,
				});
				const messagePath = `${channelRoot}/${safeSegment(upc)}.xml`;
				await this.store.writeFile(
					workspace.id,
					messagePath,
					rendered.content,
				);
				files.push({
					path: messagePath,
					size: Buffer.byteLength(rendered.content),
					sha256: sha256(Buffer.from(rendered.content)),
					kind: 'message',
					channelId: channel.id,
				});

				const markerPath = `${externalId}/BatchComplete.xml`;
				const marker = renderMarkerXml({
					input,
					channel,
					externalId,
					upc,
					messagePath,
				});
				await this.store.writeFile(workspace.id, markerPath, marker);
				files.push({
					path: markerPath,
					size: Buffer.byteLength(marker),
					sha256: sha256(Buffer.from(marker)),
					kind: 'marker',
					channelId: channel.id,
				});
				channelManifests.push({
					channelId: channel.id,
					dspCode: channel.dspCode,
					route: channel.route,
					aggregatorCode: channel.aggregatorCode ?? null,
					externalId,
					upc,
					messagePath,
					markerPath,
				});
			}

			const manifest: PackageManifest = {
				schemaVersion: 1,
				distributionId: input.distributionId,
				snapshotId: input.snapshot.id,
				releaseId: input.snapshot.releaseId,
				attemptNo: input.attemptNo,
				contentHash: input.snapshot.contentHash,
				trackOrderHash: input.snapshot.trackOrderHash,
				channels: channelManifests,
				files: files
					.slice()
					.sort((a, b) => a.path.localeCompare(b.path)),
			};
			const manifestContent = stableJson(manifest);
			await this.store.writeFile(
				workspace.id,
				'manifest.json',
				manifestContent,
			);
			const manifestEntry: PackageFileEntry = {
				path: 'manifest.json',
				size: Buffer.byteLength(manifestContent),
				sha256: sha256(Buffer.from(manifestContent)),
				kind: 'manifest',
			};
			const checksums = Object.fromEntries(
				[...manifest.files, manifestEntry]
					.sort((a, b) => a.path.localeCompare(b.path))
					.map((file) => [file.path, file.sha256]),
			);
			const checksumsContent = stableJson(checksums);
			await this.store.writeFile(
				workspace.id,
				'checksums.json',
				checksumsContent,
			);
			const checksum = sha256(Buffer.from(stableJson(checksums)));
			await this.store.releaseLease(workspace.id, 'COMPLETED');

			return {
				workspaceId: workspace.id,
				packageUri: workspace.packageUri,
				rootPath: workspace.rootPath,
				manifestPath: path.join(workspace.rootPath, 'manifest.json'),
				checksumsPath: path.join(workspace.rootPath, 'checksums.json'),
				checksum,
				attemptNo: input.attemptNo,
				externalIds,
				manifest,
			};
		} catch (error) {
			await this.store.releaseLease(workspace.id, 'FAILED').catch(() => {
				// Preserve the original build error.
			});
			throw error;
		}
	}

	private async tryReadExisting(
		input: BuildPackageInput,
		workspaceId: string,
	): Promise<PackageArtifact | null> {
		if (
			!(await this.store.fileExists(workspaceId, 'manifest.json')) ||
			!(await this.store.fileExists(workspaceId, 'checksums.json'))
		) {
			return null;
		}
		try {
			const manifest = JSON.parse(
				(
					await this.store.readFile(workspaceId, 'manifest.json')
				).toString('utf8'),
			) as PackageManifest;
			if (
				manifest.schemaVersion !== 1 ||
				manifest.distributionId !== input.distributionId ||
				manifest.snapshotId !== input.snapshot.id ||
				manifest.contentHash !== input.snapshot.contentHash ||
				manifest.attemptNo !== input.attemptNo
			) {
				return null;
			}
			const checksums = JSON.parse(
				(
					await this.store.readFile(workspaceId, 'checksums.json')
				).toString('utf8'),
			) as Record<string, string>;
			const entries = [
				...manifest.files,
				{
					path: 'manifest.json',
					size: Buffer.byteLength(
						await this.store.readFile(workspaceId, 'manifest.json'),
					),
					sha256: checksums['manifest.json'],
					kind: 'manifest' as const,
				},
			];
			for (const entry of entries) {
				if (
					typeof checksums[entry.path] !== 'string' ||
					!(await this.store.fileExists(workspaceId, entry.path))
				) {
					return null;
				}
				const content = await this.store.readFile(
					workspaceId,
					entry.path,
				);
				if (
					content.length !== entry.size ||
					sha256(content) !== checksums[entry.path]
				) {
					return null;
				}
			}
			const externalIds = Object.fromEntries(
				manifest.channels.map((channel) => [
					channel.channelId,
					channel.externalId,
				]),
			);
			const rootPath = path.resolve(
				this.config.getPackageSharedRoot(),
				workspaceId,
			);
			return {
				workspaceId,
				packageUri: workspaceId,
				rootPath,
				manifestPath: path.join(rootPath, 'manifest.json'),
				checksumsPath: path.join(rootPath, 'checksums.json'),
				checksum: sha256(Buffer.from(stableJson(checksums))),
				attemptNo: input.attemptNo,
				externalIds,
				manifest,
			};
		} catch {
			return null;
		}
	}

	private async readAsset(
		plan: ResourcePlan,
		cache: Map<string, Awaited<ReturnType<PackageAssetReader['read']>>>,
	): Promise<Awaited<ReturnType<PackageAssetReader['read']>>> {
		const cached = cache.get(plan.sourceFileId);
		if (cached) return cached;
		const source = await this.assets.read(plan.sourceFileId);
		if (
			plan.expectedSize !== null &&
			plan.expectedSize !== source.buffer.length
		) {
			throw new Error(
				`asset ${plan.sourceFileId} size mismatch: snapshot=${plan.expectedSize}, actual=${source.buffer.length}`,
			);
		}
		cache.set(plan.sourceFileId, source);
		return source;
	}

	private assertInput(input: BuildPackageInput): void {
		if (!input.distributionId?.trim()) {
			throw new Error('distributionId is required');
		}
		if (!input.snapshotId?.trim()) {
			throw new Error('snapshotId is required');
		}
		if (input.snapshot.id !== input.snapshotId) {
			throw new Error('snapshotId does not match snapshot.id');
		}
		if (!Number.isSafeInteger(input.attemptNo) || input.attemptNo < 1) {
			throw new Error('attemptNo must be a positive safe integer');
		}
	}
}

function readRelease(
	payload: Readonly<Record<string, unknown>>,
): DistributionV2PackageRelease | null {
	const release = payload.release;
	if (!release || typeof release !== 'object') return null;
	const candidate = release as DistributionV2PackageRelease;
	return typeof candidate.id === 'string' ? candidate : null;
}

function resolveUpc(
	input: BuildPackageInput,
	release: DistributionV2PackageRelease,
): string {
	const value =
		input.identifiers[`release:${input.snapshot.releaseId}:upc`] ??
		release.upc;
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`snapshot ${input.snapshot.id} has no UPC assignment`);
	}
	return safeIdentifier(value);
}

function buildResourcePlans(
	input: BuildPackageInput,
	release: DistributionV2PackageRelease,
	tracks: readonly DistributionV2PackageTrack[],
): ResourcePlan[] {
	const plans: ResourcePlan[] = [];
	for (const track of tracks) {
		if (!track.audio) continue;
		const fileId = track.audio.fileId;
		if (!fileId) {
			throw new Error(
				`track ${track.id} has an audio asset without fileId`,
			);
		}
		plans.push({
			key: `track:${track.id}`,
			sourceFileId: fileId,
			relativePath: `resources/audio-${String(track.order).padStart(3, '0')}-${safeFileName(track.audio.fileName, track.audio.extension, track.id)}`,
			kind: 'resource',
			expectedSize: nullableNumber(track.audio.fileSize),
		});
	}
	for (const [index, cover] of (release.coverArts ?? []).entries()) {
		if (!cover.fileId) {
			throw new Error(`cover art ${index + 1} has no fileId`);
		}
		plans.push({
			key: `cover:${index}`,
			sourceFileId: cover.fileId,
			relativePath: `resources/cover-${String(index + 1).padStart(2, '0')}-${safeFileName(cover.fileName, cover.extension, `cover-${index + 1}`)}`,
			kind: 'resource',
			expectedSize: nullableNumber(cover.fileSize),
		});
	}
	if (release.video?.fileId) {
		plans.push({
			key: 'video',
			sourceFileId: release.video.fileId,
			relativePath: `resources/video-${safeFileName(release.video.fileName, release.video.extension, release.video.id ?? input.snapshot.releaseId)}`,
			kind: 'resource',
			expectedSize: null,
		});
	}
	return plans;
}

function renderMessageXml(input: {
	readonly input: BuildPackageInput;
	readonly release: DistributionV2PackageRelease;
	readonly tracks: readonly DistributionV2PackageTrack[];
	readonly channel: DistributionV2PackageChannel;
	readonly externalId: string;
	readonly upc: string;
	readonly resourcePaths: readonly string[];
	readonly resourcePlans: readonly ResourcePlan[];
}): RenderedMessage {
	const doc = create({ version: '1.0', encoding: 'UTF-8' });
	const root = doc.ele('ReleasePackage', {
		SchemaVersion: 'distribution-v2/1',
		DistributionId: input.input.distributionId,
		SnapshotId: input.input.snapshot.id,
		ExternalId: input.externalId,
		DspCode: input.channel.dspCode,
		AggregatorCode: input.channel.aggregatorCode ?? '',
	});
	root.ele('ReleaseId').txt(input.release.id);
	root.ele('UPC').txt(input.upc);
	root.ele('Title').txt(input.release.title ?? '');
	root.ele('Version').txt(input.release.version ?? '');
	root.ele('ContentHash').txt(input.input.snapshot.contentHash);

	const resources = root.ele('Resources');
	for (const [index, plan] of input.resourcePlans.entries()) {
		resources.ele('Resource', {
			Reference: plan.key,
			Path: input.resourcePaths[index] ?? '',
		});
	}
	const trackList = root.ele('Tracks');
	for (const track of input.tracks) {
		const isrc =
			input.input.identifiers[`track:${track.id}:isrc`] ??
			track.isrc ??
			'';
		if (!isrc.trim()) {
			throw new Error(`track ${track.id} has no ISRC assignment`);
		}
		const trackNode = trackList.ele('Track', {
			Id: track.id,
			Sequence: String(track.order),
		});
		trackNode.ele('Title').txt(track.title ?? '');
		trackNode.ele('ISRC').txt(isrc);
	}
	if (input.release.video) {
		const videoIsrc =
			input.input.identifiers[`video:${input.release.video.id}:isrc`] ??
			input.release.video.isrc ??
			'';
		if (!videoIsrc.trim()) {
			throw new Error(
				`video ${input.release.video.id ?? '<unknown>'} has no ISRC assignment`,
			);
		}
		root.ele('VideoISRC').txt(videoIsrc);
	}
	return {
		content: doc.end({ prettyPrint: true, indent: '  ' }),
		resourcePaths: input.resourcePaths,
	};
}

function renderMarkerXml(input: {
	readonly input: BuildPackageInput;
	readonly channel: DistributionV2PackageChannel;
	readonly externalId: string;
	readonly upc: string;
	readonly messagePath: string;
}): string {
	const doc = create({ version: '1.0', encoding: 'UTF-8' });
	const root = doc.ele('BatchComplete', {
		SchemaVersion: 'distribution-v2/1',
		DistributionId: input.input.distributionId,
		SnapshotId: input.input.snapshot.id,
		ExternalId: input.externalId,
		DspCode: input.channel.dspCode,
	});
	root.ele('UPC').txt(input.upc);
	root.ele('Message').txt(input.messagePath);
	return doc.end({ prettyPrint: true, indent: '  ' });
}

function stableExternalId(
	channel: DistributionV2PackageChannel,
	distributionId: string,
): string {
	return `${safeSegment(channel.dspCode.toLowerCase())}-${distributionId}`;
}

function safeIdentifier(value: string): string {
	const normalized = value.trim();
	if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
		throw new Error(`identifier contains unsafe characters: ${value}`);
	}
	return normalized;
}

function safeSegment(value: string): string {
	const normalized = value.trim();
	if (!normalized || normalized === '.' || normalized === '..') {
		throw new Error(`invalid package path segment: ${value}`);
	}
	if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
		throw new Error(`unsafe package path segment: ${value}`);
	}
	return normalized;
}

function safeFileName(
	fileName: string | null | undefined,
	extension: string | null | undefined,
	fallback: string,
): string {
	const original =
		fileName?.trim() || `${fallback}.${extension?.trim() || 'bin'}`;
	const basename = path.posix.basename(original.replace(/\\/g, '/'));
	const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
	return sanitized || `${fallback}.bin`;
}

function nullableNumber(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stableJson(value: unknown): string {
	return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, sortObject(item)]),
		);
	}
	return value;
}

function sha256(value: Buffer): string {
	return createHash('sha256').update(value).digest('hex');
}
