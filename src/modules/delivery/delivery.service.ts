// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import dayjs from 'dayjs';
// import { promises as fs } from 'fs';
// import * as path from 'path';
// import { Repository } from 'typeorm';
// import { OrmService } from '../orm/orm.service';
// import { Release } from '../release/entities/release.entity';
// import { ReleaseStatus } from '../release/enum/release.enum';
// import {
// 	DdexMessage,
// 	MessageHeader,
// 	Party,
// 	ReleaseDeal,
// 	SoundRecording,
// } from './interface/delivery.interface';

// @Injectable()
// export class DeliveryService {
// 	constructor(
// 		private readonly ormService: OrmService,
// 		@InjectRepository(Release)
// 		private readonly releaseRepo: Repository<Release>,
// 	) {}

// 	async createDdexBatchFolder({ releaseId }: { releaseId: string }) {
// 		const release = await this.ormService
// 			.createReleaseQb()
// 			.leftJoinAndSelect('release.tracks', 'track')
// 			.leftJoinAndSelect('track.audioFile', 'audioFile')
// 			.leftJoinAndSelect('audioFile.file', 'file')
// 			.leftJoinAndSelect('release.label', 'label')
// 			.where('release.id = :id', { id: releaseId })
// 			.getOne();

// 		if (!release || release.status === ReleaseStatus.DRAFT || !release.upc)
// 			throw new Error('Invalid release');

// 		const timestamp = dayjs().format('YYYYMMDDHHmmssSSS');
// 		const baseDir = path.join(process.cwd(), 'ddex_batches', timestamp);
// 		const ackDir = path.join(baseDir, 'acknowledgements');
// 		const resourcesDir = path.join(baseDir, 'resources');

// 		await fs.mkdir(baseDir, { recursive: true });
// 		await fs.mkdir(ackDir, { recursive: true });
// 		await fs.mkdir(resourcesDir, { recursive: true });

// 		const xmlContent = await this.buildMetadataXml(releaseId);

// 		const releaseXmlName = `${release.upc}.xml`;
// 		const releaseXmlPath = path.join(baseDir, releaseXmlName);
// 		await fs.writeFile(releaseXmlPath, xmlContent, 'utf8');

// 		for (const [index, track] of (release.tracks ?? []).entries()) {
// 			const ext = track.audioFile?.file?.extension || 'flac';
// 			const resourceName = `${release.upc}_${index + 1}_1.${ext}`;
// 			const resourcePath = path.join(resourcesDir, resourceName);

// 			await fs.writeFile(resourcePath, '', 'utf8');
// 		}

// 		const manifestFile = `BatchComplete_${timestamp}.xml`;
// 		const manifestPath = path.join(baseDir, manifestFile);
// 		await fs.writeFile(
// 			manifestPath,
// 			`<BatchComplete><Timestamp>${timestamp}</Timestamp></BatchComplete>`,
// 			'utf8',
// 		);

// 		const ackFilePath = path.join(
// 			ackDir,
// 			`ACK_${timestamp}_${release.upc}.xml`,
// 		);
// 		await fs.writeFile(
// 			ackFilePath,
// 			`<Acknowledgement><Release>${release.upc}</Release></Acknowledgement>`,
// 			'utf8',
// 		);

// 		return {
// 			releaseId,
// 			timestamp,
// 			baseDir,
// 			files: {
// 				manifest: manifestPath,
// 				releaseXml: releaseXmlPath,
// 				resourcesDir,
// 				ack: ackFilePath,
// 			},
// 		};
// 	}

// 	async buildMetadataXml(releaseId: string): Promise<string> {
// 		const ddexObj = await this.getDdexObj(releaseId);
// 		return this.ddexObjToXLM(ddexObj);
// 	}

// 	async getDdexObj(releaseId: string): Promise<DdexMessage> {
// 		const release = await this.releaseRepo.findOne({
// 			where: { id: releaseId },
// 			relations: ['tracks', 'label', 'releaseArtists'],
// 		});

// 		if (!release) throw new Error('Release not found');

// 		const header: MessageHeader = {
// 			messageId: `ANT-${release.id}`,
// 			senderId: 'PADPIDA123456789',
// 			recipientId: 'PADPID_SPOTIFY',
// 			createdAt: new Date().toISOString(),
// 			controlType: 'Live',
// 		};

// 		const partyList: Party[] = release.releaseArtists.map((artist, i) => ({
// 			partyRef: `P${i + 1}`,
// 			name: artist.artist.name,
// 			roles: ['MainArtist'],
// 		}));

// 		if (release.label)
// 			partyList.push({
// 				partyRef: `P${partyList.length + 1}`,
// 				name: release.label.name,
// 				roles: ['Label'],
// 			});

// 		const resourceList: SoundRecording[] = release.tracks.map(
// 			(track, i) => ({
// 				resourceRef: `A${i + 1}`,
// 				isrc: track.isrc ?? '',
// 				title: track.title,
// 				durationSec: track.audioFile?.duration,
// 				contributors: [
// 					{ partyRef: partyList[0].partyRef, roles: ['MainArtist'] },
// 				],
// 				tech: { codec: 'FLAC', filePath: 'track.audioFilePath' },
// 			}),
// 		);

// 		const releaseList = [
// 			{
// 				releaseRef: 'R1',
// 				upc: release.upc ?? '',
// 				title: release.title,
// 				type: release.tracks.length > 1 ? 'Album' : 'Single',
// 				label: release.label?.name,
// 				originalReleaseDate: release.releaseDate
// 					?.toISOString()
// 					.split('T')[0],
// 				resourceRefs: resourceList.map((r) => r.resourceRef),
// 			},
// 		];

// 		const dealList: ReleaseDeal[] = [
// 			{
// 				releaseRef: 'R1',
// 				deals: [
// 					{
// 						territories: ['WORLD'],
// 						usage: ['STREAM'],
// 						commercialModel: ['SUBSCRIPTION'],
// 						startDate:
// 							release.releaseDate?.toISOString().split('T')[0] ??
// 							new Date().toISOString(),
// 						dspId: 'SPOTIFY',
// 					},
// 				],
// 			},
// 		];

// 		return { header, partyList, resourceList, releaseList, dealList };
// 	}

// 	private ddexObjToXLM(input: DdexMessage): string {
// 		return `
//             <?xml version="1.0" encoding="UTF-8"?>
//             <ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/38">
//                 ${this.getMessageHeaderXml(input.header)}
//                 <ern:PartyList>
//                     ${input.partyList.map((p) => this.getPartyXml(p)).join('')}
//                 </ern:PartyList>
//                 <ern:ResourceList>
//                     ${input.resourceList.map((r) => this.getResourceXml(r)).join('')}
//                 </ern:ResourceList>
//                 <ern:ReleaseList>
//                     ${input.releaseList.map((rel) => this.getReleaseXml(rel)).join('')}
//                 </ern:ReleaseList>
//                 <ern:DealList>
//                     ${input.dealList.map((d) => this.getDealXml(d)).join('')}
//                 </ern:DealList>
//             </ern:NewReleaseMessage>
//         `.trim();
// 	}

// 	private getMessageHeaderXml(input: MessageHeader): string {
// 		return `
//             <ern:MessageHeader>
//                 <ern:MessageId>${input.messageId}</ern:MessageId>
//                 <ern:MessageSender><ern:PartyId>${input.senderId}</ern:PartyId></ern:MessageSender>
//                 <ern:MessageRecipient><ern:PartyId>${input.recipientId}</ern:PartyId></ern:MessageRecipient>
//                 <ern:MessageCreatedDateTime>${input.createdAt}</ern:MessageCreatedDateTime>
//                 <ern:MessageControlType>${input.controlType}</ern:MessageControlType>
//             </ern:MessageHeader>
//         `.trim();
// 	}

// 	private getPartyXml(input: Party): string {
// 		const roles =
// 			input.roles
// 				?.map((r) => `<ern:PartyRole>${r}</ern:PartyRole>`)
// 				.join('') ?? '';
// 		return `
//             <ern:Party>
//                 <ern:PartyReference>${input.partyRef}</ern:PartyReference>
//                 <ern:PartyName><ern:FullName>${input.name}</ern:FullName></ern:PartyName>
//                 ${input.isni ? `<ern:PartyId><ern:ISNI>${input.isni}</ern:ISNI></ern:PartyId>` : ''}
//                 ${roles}
//             </ern:Party>
//         `.trim();
// 	}

// 	private getResourceXml(input: SoundRecording): string {
// 		const contributors = input.contributors
// 			.map(
// 				(c) => `
//                         <ern:Contributor>
//                             <ern:ContributorPartyReference>${c.partyRef}</ern:ContributorPartyReference>
//                             ${c.roles.map((r) => `<ern:ContributorRole>${r}</ern:ContributorRole>`).join('')}
//                         </ern:Contributor>
//                     `,
// 			)
// 			.join('');

// 		return `
//                 <ern:SoundRecording>
//                     <ern:ResourceReference>${input.resourceRef}</ern:ResourceReference>
//                     <ern:SoundRecordingId><ern:ISRC>${input.isrc}</ern:ISRC></ern:SoundRecordingId>
//                     <ern:ReferenceTitle><ern:TitleText>${input.title}</ern:TitleText></ern:ReferenceTitle>
//                     ${contributors}
//                     ${input.tech?.filePath ? `<ern:FilePath>${input.tech.filePath}</ern:FilePath>` : ''}
//                 </ern:SoundRecording>
//             `.trim();
// 	}

// 	private getReleaseXml(input: DdexMessage['releaseList'][0]): string {
// 		const refs = input.resourceRefs
// 			.map(
// 				(r) =>
// 					`<ern:ReleaseResourceReference>${r}</ern:ReleaseResourceReference>`,
// 			)
// 			.join('');
// 		return `
//             <ern:Release>
//                 <ern:ReleaseId><ern:ICPN>${input.upc}</ern:ICPN></ern:ReleaseId>
//                 <ern:ReferenceTitle><ern:TitleText>${input.title}</ern:TitleText></ern:ReferenceTitle>
//                 <ern:ReleaseType>${input.type}</ern:ReleaseType>
//                 ${input.label ? `<ern:LabelName>${input.label}</ern:LabelName>` : ''}
//                 ${input.originalReleaseDate ? `<ern:OriginalReleaseDate>${input.originalReleaseDate}</ern:OriginalReleaseDate>` : ''}
//                 <ern:ReleaseResourceReferenceList>${refs}</ern:ReleaseResourceReferenceList>
//             </ern:Release>
//         `.trim();
// 	}

// 	private getDealXml(input: ReleaseDeal): string {
// 		return input.deals
// 			.map(
// 				(d) => `
//                     <ern:Deal>
//                         <ern:DealReleaseReference>${input.releaseRef}</ern:DealReleaseReference>
//                         <ern:DealTerms>
//                             ${d.usage.map((u) => `<ern:UseType>${u}</ern:UseType>`).join('')}
//                             ${d.territories.map((t) => `<ern:TerritoryCode>${t}</ern:TerritoryCode>`).join('')}
//                             ${d.commercialModel.map((c) => `<ern:CommercialModelType>${c}</ern:CommercialModelType>`).join('')}
//                             <ern:StartDate>${d.startDate}</ern:StartDate>
//                         </ern:DealTerms>
//                     </ern:Deal>
//                 `,
// 			)
// 			.join('');
// 	}
// }

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { OrmService } from '../orm/orm.service';
import { Release } from '../release/entities/release.entity';
import {
	DdexMessage,
	DealItem,
	MessageHeader,
	Party,
	ReleaseItem,
	Resource,
} from './interface/delivery.interface';

@Injectable()
export class DeliveryService {
	constructor(
		private readonly ormService: OrmService,
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	async createDdexBatchFolder({ releaseId }: { releaseId: string }) {
		const release = await this.ormService
			.createReleaseQb()
			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('release.label', 'label')
			.where('release.id = :id', { id: releaseId })
			.getOne();

		// if (!release || release.status === ReleaseStatus.DRAFT || !release.upc)
		// 	throw new Error('Invalid release');

		if (!release || !release.upc) throw new Error('Invalid release');

		const timestamp = dayjs().format('YYYYMMDDHHmmssSSS');
		const baseDir = path.join(process.cwd(), 'ddex_batches', timestamp);
		const ackDir = path.join(baseDir, 'acknowledgements');
		const resourcesDir = path.join(baseDir, 'resources');

		await fs.mkdir(baseDir, { recursive: true });
		await fs.mkdir(ackDir, { recursive: true });
		await fs.mkdir(resourcesDir, { recursive: true });

		const xmlContent = await this.buildMetadataXml(releaseId);

		const releaseXmlName = `${release.upc}.xml`;
		const releaseXmlPath = path.join(baseDir, releaseXmlName);
		await fs.writeFile(releaseXmlPath, xmlContent, 'utf8');

		for (const [index, track] of (release.tracks ?? []).entries()) {
			const ext = track.audioFile?.file?.extension || 'wav';
			const resourceName = `${track.isrc || `${release.upc}_${index + 1}`}_T${index + 1}S.${ext}`;
			const resourcePath = path.join(resourcesDir, resourceName);
			await fs.writeFile(resourcePath, '', 'utf8');
		}

		const manifestFile = `BatchComplete_${timestamp}.xml`;
		const manifestPath = path.join(baseDir, manifestFile);
		await fs.writeFile(
			manifestPath,
			`<BatchComplete><Timestamp>${timestamp}</Timestamp></BatchComplete>`,
			'utf8',
		);

		const ackFilePath = path.join(
			ackDir,
			`ACK_${timestamp}_${release.upc}.xml`,
		);
		await fs.writeFile(
			ackFilePath,
			`<Acknowledgement><Release>${release.upc}</Release></Acknowledgement>`,
			'utf8',
		);

		return {
			releaseId,
			timestamp,
			baseDir,
			files: {
				manifest: manifestPath,
				releaseXml: releaseXmlPath,
				resourcesDir,
				ack: ackFilePath,
			},
		};
	}

	async buildMetadataXml(releaseId: string): Promise<string> {
		const ddexObj = await this.getDdexObj(releaseId);
		return this.ddexObjToXML(ddexObj);
	}

	async getDdexObj(releaseId: string): Promise<DdexMessage> {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			relations: [
				'tracks',
				'label',
				'releaseArtists',
				'releaseArtists.artist',
			],
		});

		if (!release) throw new Error('Release not found');

		const header: MessageHeader = {
			messageThreadId: 'Baseline',
			messageId: `MSG-${release.id}`,
			senderPartyId: 'YOUR DPID',
			senderPartyName: 'YOUR COMPANY NAME',
			recipientPartyId: 'PADPIDA1011072101T',
			recipientPartyName: 'Spotify',
			messageCreatedDateTime: new Date().toISOString(),
			releaseProfileVersionId: 'Audio',
			languageAndScriptCode: 'en',
		};

		const partyList: Party[] = release.releaseArtists.map((ra, i) => ({
			partyReference: `P${i + 1}`,
			partyName: ra.artist.name,
			partyId: [
				{
					proprietaryId: {
						namespace: 'YOUR DPID',
						value: ra.artist.id.toString(),
					},
				},
			],
		}));

		if (release.label) {
			partyList.push({
				partyReference: `P${partyList.length + 1}`,
				partyName: release.label.name,
			});
		}

		const resourceList: Resource[] = release.tracks.map((track, i) => {
			const ext = track.audioFile?.file?.extension || 'wav';
			const fileName = `${track.isrc || `${release.upc}_${i + 1}`}_T${i + 1}S.${ext}`;

			return {
				resourceReference: `A${i + 1}`,
				type: 'SoundRecording',
				resourceId: {
					isrc: track.isrc ?? '',
				},
				displayTitleText: track.title,
				displayTitle: {
					titleText: track.title,
					applicableTerritoryCode: 'Worldwide',
					isDefault: true,
				},
				displayArtistName: partyList[0]?.partyName,
				displayArtist: [
					{
						sequenceNumber: 1,
						artistPartyReference: partyList[0]?.partyReference,
						displayArtistRole: 'MainArtist',
					},
				],
				duration: track.audioFile?.duration
					? this.secondsToISO8601Duration(track.audioFile.duration)
					: undefined,
				parentalWarningType: 'NotExplicit',
				soundRecordingEdition: {
					type: 'NonImmersiveEdition',
					recordingMode: 'Stereo',
					pLine: {
						year: release.releaseDate
							? new Date(release.releaseDate).getFullYear()
							: new Date().getFullYear(),
						pLineText: release.label?.name || 'Independent',
					},
					technicalDetails: {
						technicalResourceDetailsReference: `T${i + 1}S`,
						deliveryFile: {
							type: 'AudioFile',
							uri: fileName,
							isProvidedInDelivery: true,
						},
					},
				},
			};
		});

		const mainRelease: ReleaseItem = {
			releaseReference: 'R0',
			releaseType: release.tracks.length > 1 ? 'Album' : 'Single',
			releaseId: {
				icpn: release.upc ?? '',
			},
			displayTitleText: release.title,
			displayTitle: {
				titleText: release.title,
				applicableTerritoryCode: 'Worldwide',
				isDefault: true,
			},
			displayArtistName: partyList[0]?.partyName,
			displayArtist: [
				{
					sequenceNumber: 1,
					artistPartyReference: partyList[0]?.partyReference,
					displayArtistRole: 'MainArtist',
				},
			],
			releaseLabelReference: release.label
				? partyList[partyList.length - 1].partyReference
				: undefined,
			pLine: {
				year: release.releaseDate
					? new Date(release.releaseDate).getFullYear()
					: new Date().getFullYear(),
				pLineText: release.label?.name || 'Independent',
			},
			cLine: {
				year: release.releaseDate
					? new Date(release.releaseDate).getFullYear()
					: new Date().getFullYear(),
				cLineText: release.label?.name || 'Independent',
			},
			originalReleaseDate: release.releaseDate
				? dayjs(release.releaseDate).format('YYYY-MM-DD')
				: undefined,
			releaseVisibilityReference: 'V0',
			parentalWarningType: 'NotExplicit',
			resourceGroup: {
				sequenceNumber: 1,
				resourceGroupContentItem: resourceList.map((r, i) => ({
					sequenceNumber: i + 1,
					releaseResourceReference: r.resourceReference,
				})),
			},
		};

		const trackReleases: ReleaseItem[] = resourceList.map((r, i) => ({
			releaseReference: `R${i + 1}`,
			releaseType: 'TrackRelease',
			releaseId: {
				proprietaryId: {
					namespace: 'PADPIDA2011072101T',
					value: `${release.upc}_R${i + 1}`,
				},
			},
			releaseResourceReference: r.resourceReference,
			releaseLabelReference: release.label
				? partyList[partyList.length - 1].partyReference
				: undefined,
			releaseVisibilityReference: `V${i + 1}`,
		}));

		const releaseList: ReleaseItem[] = [mainRelease, ...trackReleases];

		const dealList: DealItem[] = [
			...trackReleases.map((tr, i) => ({
				dealReleaseReference: tr.releaseReference,
				deal: [
					{
						dealTerms: {
							territoryCode: 'Worldwide',
							validityPeriod: {
								startDateTime: release.releaseDate
									? dayjs(release.releaseDate).format(
											'YYYY-MM-DDTHH:mm:ss',
										)
									: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
							},
							commercialModelType: [
								'SubscriptionModel' as const,
								'AdvertisementSupportedModel' as const,
							],
							useType: [
								'ConditionalDownload' as const,
								'Stream' as const,
							],
						},
						dealTechnicalResourceDetailsReferenceList: [
							`T${i + 1}S`,
						],
					},
				],
			})),
			{
				dealReleaseReference: 'R0',
				releaseVisibility: {
					visibilityReference: 'V0',
					territoryCode: 'Worldwide',
					releaseDisplayStartDateTime: release.releaseDate
						? dayjs(release.releaseDate).format(
								'YYYY-MM-DDTHH:mm:ss',
							)
						: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
					coverArtPreviewStartDateTime: release.releaseDate
						? dayjs(release.releaseDate).format(
								'YYYY-MM-DDTHH:mm:ss',
							)
						: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
					fullTrackListingPreviewStartDateTime: release.releaseDate
						? dayjs(release.releaseDate).format(
								'YYYY-MM-DDTHH:mm:ss',
							)
						: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
				},
			},
			...trackReleases.map((tr, i) => ({
				dealReleaseReference: tr.releaseReference,
				trackReleaseVisibility: {
					visibilityReference: `V${i + 1}`,
					territoryCode: 'Worldwide',
					trackListingPreviewStartDateTime: release.releaseDate
						? dayjs(release.releaseDate).format(
								'YYYY-MM-DDTHH:mm:ss',
							)
						: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
				},
			})),
		];

		return { header, partyList, resourceList, releaseList, dealList };
	}

	private secondsToISO8601Duration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		return `PT${hours}H${minutes}M${secs}S`;
	}

	private ddexObjToXML(input: DdexMessage): string {
		return `<?xml version="1.0" encoding="UTF-8"?>
					<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43"
						xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
						xsi:schemaLocation="http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd"
						ReleaseProfileVersionId="${input.header.releaseProfileVersionId || 'Audio'}" 
						LanguageAndScriptCode="${input.header.languageAndScriptCode || 'en'}" 
						AvsVersionId="3">
						${this.getMessageHeaderXml(input.header)}
						<PartyList>
							${input.partyList.map((p) => this.getPartyXml(p)).join('\n        ')}
						</PartyList>
						<ResourceList>
							${input.resourceList.map((r) => this.getResourceXml(r)).join('\n        ')}
						</ResourceList>
						<ReleaseList>
							${input.releaseList.map((rel) => this.getReleaseXml(rel)).join('\n        ')}
						</ReleaseList>
						<DealList>
							${input.dealList.map((d) => this.getDealXml(d)).join('\n        ')}
						</DealList>
					</ern:NewReleaseMessage>`;
	}

	private getMessageHeaderXml(input: MessageHeader): string {
		return `<MessageHeader>
					${input.messageThreadId ? `<MessageThreadId>${input.messageThreadId}</MessageThreadId>` : ''}
					<MessageId>${input.messageId}</MessageId>
					<MessageSender>
						<PartyId>${input.senderPartyId}</PartyId>
						<PartyName>
							<FullName>${input.senderPartyName}</FullName>
						</PartyName>
					</MessageSender>
					<MessageRecipient>
						<PartyId>${input.recipientPartyId}</PartyId>
						<PartyName>
							<FullName>${input.recipientPartyName}</FullName>
						</PartyName>
					</MessageRecipient>
					<MessageCreatedDateTime>${input.messageCreatedDateTime}</MessageCreatedDateTime>
				</MessageHeader>`;
	}

	private getPartyXml(input: Party): string {
		const partyIds =
			input.partyId
				?.map((pid) => {
					if (pid.isni) {
						return `<PartyId><ISNI>${pid.isni}</ISNI></PartyId>`;
					}
					if (pid.proprietaryId) {
						return `<PartyId><ProprietaryId Namespace="${pid.proprietaryId.namespace}">${pid.proprietaryId.value}</ProprietaryId></PartyId>`;
					}
					if (pid.dpid) {
						return `<PartyId>${pid.dpid}</PartyId>`;
					}
					return '';
				})
				.join('\n            ') || '';

		return `<Party>
					<PartyReference>${input.partyReference}</PartyReference>
					<PartyName>
						<FullName>${input.partyName}</FullName>
					</PartyName>
					${partyIds}
				</Party>`;
	}

	private getResourceXml(input: Resource): string {
		if (input.type === 'SoundRecording') {
			return `<SoundRecording>
						<ResourceReference>${input.resourceReference}</ResourceReference>
						<Type>MusicalWorkSoundRecording</Type>
						<SoundRecordingEdition>
							<Type>${input.soundRecordingEdition?.type || 'NonImmersiveEdition'}</Type>
							<ResourceId>
								<ISRC>${input.resourceId.isrc}</ISRC>
							</ResourceId>
							${
								input.soundRecordingEdition?.pLine
									? `<PLine>
								<Year>${input.soundRecordingEdition.pLine.year}</Year>
								<PLineText>${input.soundRecordingEdition.pLine.pLineText}</PLineText>
							</PLine>`
									: ''
							}
							${input.soundRecordingEdition?.recordingMode ? `<RecordingMode>${input.soundRecordingEdition.recordingMode}</RecordingMode>` : ''}
							${
								input.soundRecordingEdition?.technicalDetails
									? `<TechnicalDetails>
								<TechnicalResourceDetailsReference>${input.soundRecordingEdition.technicalDetails.technicalResourceDetailsReference}</TechnicalResourceDetailsReference>
								${
									input.soundRecordingEdition.technicalDetails
										.deliveryFile
										? `<DeliveryFile>
									<Type>${input.soundRecordingEdition.technicalDetails.deliveryFile.type}</Type>
									<File>
										<URI>${input.soundRecordingEdition.technicalDetails.deliveryFile.uri}</URI>
									</File>
									<IsProvidedInDelivery>${input.soundRecordingEdition.technicalDetails.deliveryFile.isProvidedInDelivery}</IsProvidedInDelivery>
								</DeliveryFile>`
										: ''
								}
							</TechnicalDetails>`
									: ''
							}
						</SoundRecordingEdition>
						${input.workId?.iswc ? `<WorkId><ISWC>${input.workId.iswc}</ISWC></WorkId>` : ''}
						<DisplayTitleText>${input.displayTitleText}</DisplayTitleText>
						<DisplayTitle ApplicableTerritoryCode="${input.displayTitle.applicableTerritoryCode || 'Worldwide'}" IsDefault="${input.displayTitle.isDefault !== false}">
							<TitleText>${input.displayTitle.titleText}</TitleText>
						</DisplayTitle>
						${input.displayArtistName ? `<DisplayArtistName ApplicableTerritoryCode="Worldwide" IsDefault="true">${input.displayArtistName}</DisplayArtistName>` : ''}
						${
							input.displayArtist
								?.map(
									(
										da,
									) => `<DisplayArtist SequenceNumber="${da.sequenceNumber}">
							<ArtistPartyReference>${da.artistPartyReference}</ArtistPartyReference>
							<DisplayArtistRole>${da.displayArtistRole}</DisplayArtistRole>
							${da.artisticRole ? `<ArtisticRole>${da.artisticRole}</ArtisticRole>` : ''}
						</DisplayArtist>`,
								)
								.join('\n            ') || ''
						}
						${
							input.contributor
								?.map(
									(
										c,
									) => `<Contributor SequenceNumber="${c.sequenceNumber}">
							<ContributorPartyReference>${c.contributorPartyReference}</ContributorPartyReference>
							<Role${c.namespace ? ` Namespace="${c.namespace}"` : ''}${c.userDefinedValue ? ` UserDefinedValue="${c.userDefinedValue}"` : ''}>${c.role}</Role>
						</Contributor>`,
								)
								.join('\n            ') || ''
						}
						${input.duration ? `<Duration>${input.duration}</Duration>` : ''}
						${input.parentalWarningType ? `<ParentalWarningType>${input.parentalWarningType}</ParentalWarningType>` : ''}
					</SoundRecording>`;
		}
		return '';
	}

	private getReleaseXml(input: ReleaseItem): string {
		if (input.releaseType === 'TrackRelease') {
			return `<TrackRelease>
						<ReleaseReference>${input.releaseReference}</ReleaseReference>
						${
							input.releaseId.proprietaryId
								? `<ReleaseId>
							<ProprietaryId Namespace="${input.releaseId.proprietaryId.namespace}">${input.releaseId.proprietaryId.value}</ProprietaryId>
						</ReleaseId>`
								: ''
						}
						<ReleaseResourceReference>${input.releaseResourceReference}</ReleaseResourceReference>
						${input.releaseLabelReference ? `<ReleaseLabelReference ApplicableTerritoryCode="Worldwide">${input.releaseLabelReference}</ReleaseLabelReference>` : ''}
						${
							input.genre
								? `<Genre ApplicableTerritoryCode="${input.genre.applicableTerritoryCode || 'Worldwide'}">
							<GenreText>${input.genre.genreText}</GenreText>
						</Genre>`
								: ''
						}
						<ReleaseVisibilityReference>${input.releaseVisibilityReference}</ReleaseVisibilityReference>
					</TrackRelease>`;
		}

		return `<Release>
            <ReleaseReference>${input.releaseReference}</ReleaseReference>
            <ReleaseType>${input.releaseType}</ReleaseType>
            ${
				input.releaseId.icpn
					? `<ReleaseId>
                <ICPN>${input.releaseId.icpn}</ICPN>
            </ReleaseId>`
					: ''
			}
            ${input.displayTitleText ? `<DisplayTitleText>${input.displayTitleText}</DisplayTitleText>` : ''}
            ${
				input.displayTitle
					? `<DisplayTitle ApplicableTerritoryCode="${input.displayTitle.applicableTerritoryCode || 'Worldwide'}" IsDefault="${input.displayTitle.isDefault !== false}">
                <TitleText>${input.displayTitle.titleText}</TitleText>
            </DisplayTitle>`
					: ''
			}
            ${input.displayArtistName ? `<DisplayArtistName ApplicableTerritoryCode="Worldwide" IsDefault="true">${input.displayArtistName}</DisplayArtistName>` : ''}
            ${
				input.displayArtist
					?.map(
						(
							da,
						) => `<DisplayArtist SequenceNumber="${da.sequenceNumber}">
                <ArtistPartyReference>${da.artistPartyReference}</ArtistPartyReference>
                <DisplayArtistRole>${da.displayArtistRole}</DisplayArtistRole>
            </DisplayArtist>`,
					)
					.join('\n            ') || ''
			}
            ${input.releaseLabelReference ? `<ReleaseLabelReference ApplicableTerritoryCode="Worldwide">${input.releaseLabelReference}</ReleaseLabelReference>` : ''}
            ${
				input.pLine
					? `<PLine>
                <Year>${input.pLine.year}</Year>
                <PLineText>${input.pLine.pLineText}</PLineText>
            </PLine>`
					: ''
			}
            ${
				input.cLine
					? `<CLine>
                <Year>${input.cLine.year}</Year>
                <CLineText>${input.cLine.cLineText}</CLineText>
            </CLine>`
					: ''
			}
            ${
				input.genre
					? `<Genre ApplicableTerritoryCode="${input.genre.applicableTerritoryCode || 'Worldwide'}">
                <GenreText>${input.genre.genreText}</GenreText>
            </Genre>`
					: ''
			}
            ${input.originalReleaseDate ? `<OriginalReleaseDate>${input.originalReleaseDate}</OriginalReleaseDate>` : ''}
            ${input.releaseVisibilityReference ? `<ReleaseVisibilityReference>${input.releaseVisibilityReference}</ReleaseVisibilityReference>` : ''}
            ${input.parentalWarningType ? `<ParentalWarningType>${input.parentalWarningType}</ParentalWarningType>` : ''}
            ${
				input.resourceGroup
					? `<ResourceGroup>
                <SequenceNumber>${input.resourceGroup.sequenceNumber}</SequenceNumber>
                ${input.resourceGroup.resourceGroupContentItem
					.map(
						(item) => `<ResourceGroupContentItem>
                    <SequenceNumber>${item.sequenceNumber}</SequenceNumber>
                    <ReleaseResourceReference>${item.releaseResourceReference}</ReleaseResourceReference>
                </ResourceGroupContentItem>`,
					)
					.join('\n                ')}
                ${input.resourceGroup.linkedReleaseResourceReference?.map((ref) => `<LinkedReleaseResourceReference>${ref}</LinkedReleaseResourceReference>`).join('\n                ') || ''}
            </ResourceGroup>`
					: ''
			}
        </Release>`;
	}

	private getDealXml(input: DealItem): string {
		let xml = '';

		if (input.deal && input.deal.length > 0) {
			xml += `<ReleaseDeal>
            <DealReleaseReference>${input.dealReleaseReference}</DealReleaseReference>
            ${input.deal
				.map(
					(d) => `<Deal>
                <DealTerms>
                    ${
						Array.isArray(d.dealTerms.territoryCode)
							? d.dealTerms.territoryCode
									.map(
										(tc) =>
											`<TerritoryCode>${tc}</TerritoryCode>`,
									)
									.join('\n                    ')
							: `<TerritoryCode>${d.dealTerms.territoryCode}</TerritoryCode>`
					}
                    ${
						d.dealTerms.validityPeriod
							? `<ValidityPeriod>
                        <StartDateTime>${d.dealTerms.validityPeriod.startDateTime}</StartDateTime>
                        ${d.dealTerms.validityPeriod.endDateTime ? `<EndDateTime>${d.dealTerms.validityPeriod.endDateTime}</EndDateTime>` : ''}
                    </ValidityPeriod>`
							: ''
					}
                    ${d.dealTerms.commercialModelType.map((cmt) => `<CommercialModelType>${cmt}</CommercialModelType>`).join('\n                    ')}
                    ${d.dealTerms.useType.map((ut) => `<UseType>${ut}</UseType>`).join('\n                    ')}
                    ${d.dealTerms.priceInformation?.priceTier ? `<PriceInformation><PriceTier>${d.dealTerms.priceInformation.priceTier}</PriceTier></PriceInformation>` : ''}
                </DealTerms>
                ${
					d.dealTechnicalResourceDetailsReferenceList &&
					d.dealTechnicalResourceDetailsReferenceList.length > 0
						? `<DealTechnicalResourceDetailsReferenceList>
                    ${d.dealTechnicalResourceDetailsReferenceList.map((ref) => `<DealTechnicalResourceDetailsReference>${ref}</DealTechnicalResourceDetailsReference>`).join('\n                    ')}
                </DealTechnicalResourceDetailsReferenceList>`
						: ''
				}
            </Deal>`,
				)
				.join('\n            ')}
        </ReleaseDeal>`;
		}

		if (input.releaseVisibility) {
			const rv = input.releaseVisibility;
			xml += `${xml ? '\n        ' : ''}<ReleaseVisibility>
            <VisibilityReference>${rv.visibilityReference}</VisibilityReference>
            <TerritoryCode>${rv.territoryCode}</TerritoryCode>
            ${rv.releaseDisplayStartDateTime ? `<ReleaseDisplayStartDateTime>${rv.releaseDisplayStartDateTime}</ReleaseDisplayStartDateTime>` : ''}
            ${rv.coverArtPreviewStartDateTime ? `<CoverArtPreviewStartDateTime>${rv.coverArtPreviewStartDateTime}</CoverArtPreviewStartDateTime>` : ''}
            ${rv.fullTrackListingPreviewStartDateTime ? `<FullTrackListingPreviewStartDateTime>${rv.fullTrackListingPreviewStartDateTime}</FullTrackListingPreviewStartDateTime>` : ''}
        </ReleaseVisibility>`;
		}

		if (input.trackReleaseVisibility) {
			const trv = input.trackReleaseVisibility;
			xml += `${xml ? '\n        ' : ''}<TrackReleaseVisibility>
            <VisibilityReference>${trv.visibilityReference}</VisibilityReference>
            <TerritoryCode>${trv.territoryCode}</TerritoryCode>
            ${trv.trackListingPreviewStartDateTime ? `<TrackListingPreviewStartDateTime>${trv.trackListingPreviewStartDateTime}</TrackListingPreviewStartDateTime>` : ''}
        </TrackReleaseVisibility>`;
		}

		return xml;
	}
}
