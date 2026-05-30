import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from 'typeorm';
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { decryptSecretSafe } from 'src/utils/util.encrypt';
import { DspRoutingConfig } from 'src/modules/distribution/dsp-routing/entities/dsp-routing-config.entity';

@Injectable()
export class VevoResponseScanner {
	private readonly logger = new Logger(VevoResponseScanner.name);

	constructor(
		@InjectEntityManager()
		private readonly manager: EntityManager,
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async scanVevoResponses(): Promise<void> {
		try {
			this.logger.log('Starting Vevo response S3 scanner...');

			// 1. Get Vevo DSP
			const vevoDsp = await this.manager.findOne(Dsp, {
				where: { code: 'VEVO' },
			});
			if (!vevoDsp) {
				this.logger.debug('VEVO DSP not found in database. Skipping scan.');
				return;
			}

			// 2. Get active routing config for Vevo
			const routing = await this.manager.findOne(DspRoutingConfig, {
				where: { dspId: vevoDsp.id, isActive: true },
				relations: ['sftpConfig'],
			});
			if (!routing || !routing.sftpConfig || !routing.sftpConfig.metadata) {
				this.logger.debug('Active Vevo S3 config metadata not found. Skipping scan.');
				return;
			}

			const s3Metadata = routing.sftpConfig.metadata as any;
			const accessKeyId = s3Metadata.username || '';
			const decryptedSecret = s3Metadata.password ? decryptSecretSafe(s3Metadata.password) : '';
			const bucket = s3Metadata.bucket || '';
			const region = s3Metadata.region || 'us-east-1';
			const s3Prefix = s3Metadata.path || 'feed/sony/';

			if (!accessKeyId || !decryptedSecret || !bucket) {
				this.logger.error('Vevo S3 configuration is incomplete (missing username, password, or bucket).');
				return;
			}

			// 3. Initialize S3 client
			const s3Client = new S3Client({
				region,
				credentials: {
					accessKeyId,
					secretAccessKey: decryptedSecret,
				},
				endpoint: s3Metadata.host ? `https://${s3Metadata.host}` : undefined,
			});

			// 4. List objects under prefix
			const listResult = await s3Client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: s3Prefix,
				})
			);

			const contents = listResult.Contents || [];
			this.logger.debug(`Found ${contents.length} objects in Vevo S3 bucket.`);

			for (const obj of contents) {
				if (!obj.Key) continue;

				const key = obj.Key;
				const filename = key.substring(key.lastIndexOf('/') + 1);

				// Match success-*.json or failure-*.json
				const successMatch = filename.match(/^success-(.+)\.json$/);
				const failureMatch = filename.match(/^failure-(.+)\.json$/);

				if (!successMatch && !failureMatch) continue;

				const isSuccess = !!successMatch;
				const isrc = isSuccess ? successMatch[1] : failureMatch![1];

				this.logger.log(`Processing Vevo response file: ${filename} (ISRC: ${isrc}, Success: ${isSuccess})`);

				// Read file content
				let errorDetails = '';
				try {
					const fileObj = await s3Client.send(
						new GetObjectCommand({
							Bucket: bucket,
							Key: key,
						})
					);
					if (fileObj.Body) {
						const stream = fileObj.Body as Readable;
						const chunks: Buffer[] = [];
						const contentBuffer = await new Promise<Buffer>((resolve, reject) => {
							stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
							stream.on('end', () => resolve(Buffer.concat(chunks)));
							stream.on('error', reject);
						});
						const contentStr = contentBuffer.toString('utf-8');
						try {
							const parsed = JSON.parse(contentStr);
							errorDetails = parsed.errorMessage || parsed.error || JSON.stringify(parsed);
						} catch {
							errorDetails = contentStr;
						}
					}
				} catch (err: any) {
					this.logger.error(`Failed to read response file ${key}: ${err.message}`);
				}

				// Find video and release
				const video = await this.manager.findOne(Video, {
					where: { isrc },
				});

				if (!video) {
					this.logger.warn(`No video found in database matching ISRC ${isrc}. Skipping DB update.`);
					continue;
				}

				// Find delivery record
				const delivery = await this.manager.findOne(ReleaseDspDelivery, {
					where: { releaseId: video.releaseId, dspId: vevoDsp.id },
				});

				if (delivery) {
					delivery.status = isSuccess ? ReleaseDspStatus.DISTRIBUTED : ReleaseDspStatus.ISSUES;
					delivery.lastDeliveredAt = isSuccess ? new Date() : delivery.lastDeliveredAt;
					delivery.logs = isSuccess
						? 'VEVO: Video ingested and published successfully.'
						: `VEVO Error: ${errorDetails}`;
					await this.manager.save(ReleaseDspDelivery, delivery);
					this.logger.log(`Updated ReleaseDspDelivery status for release ${video.releaseId} to ${delivery.status}`);
				} else {
					this.logger.warn(`No ReleaseDspDelivery record found for release ${video.releaseId} and DSP VEVO.`);
				}

				// Delete processed response file from S3
				try {
					await s3Client.send(
						new DeleteObjectCommand({
							Bucket: bucket,
							Key: key,
						})
					);
					this.logger.log(`Deleted processed response file: ${key}`);
				} catch (err: any) {
					this.logger.error(`Failed to delete response file ${key}: ${err.message}`);
				}
			}

		} catch (error: any) {
			this.logger.error(`Error in Vevo response S3 scanner: ${error.message}`, error.stack);
		}
	}
}
