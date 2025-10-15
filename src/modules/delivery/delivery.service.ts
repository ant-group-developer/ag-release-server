import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { OrmService } from '../orm/orm.service';
import { Release } from '../release/entities/release.entity';
import { ReleaseStatus } from '../release/enum/release.enum';
import {
	DdexMessage,
	MessageHeader,
	Party,
	ReleaseDeal,
	SoundRecording,
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

		if (!release || release.status === ReleaseStatus.DRAFT || !release.upc)
			throw new Error('Invalid release');

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
			const ext = track.audioFile?.file?.extension || 'flac';
			const resourceName = `${release.upc}_${index + 1}_1.${ext}`;
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
		const metadata = await this.buildMetadata(releaseId);
		return this.getDdexMessage(metadata);
	}

	async buildMetadata(releaseId: string): Promise<DdexMessage> {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			relations: ['tracks', 'label', 'releaseArtists'],
		});

		if (!release) throw new Error('Release not found');

		const header: MessageHeader = {
			messageId: `ANT-${release.id}`,
			senderId: 'PADPIDA123456789',
			recipientId: 'PADPID_SPOTIFY',
			createdAt: new Date().toISOString(),
			controlType: 'Live',
		};

		const partyList: Party[] = release.releaseArtists.map((artist, i) => ({
			partyRef: `P${i + 1}`,
			name: artist.artist.name,
			roles: ['MainArtist'],
		}));

		if (release.label)
			partyList.push({
				partyRef: `P${partyList.length + 1}`,
				name: release.label.name,
				roles: ['Label'],
			});

		const resourceList: SoundRecording[] = release.tracks.map(
			(track, i) => ({
				resourceRef: `A${i + 1}`,
				isrc: track.isrc ?? '',
				title: track.title,
				durationSec: track.audioFile?.duration,
				contributors: [
					{ partyRef: partyList[0].partyRef, roles: ['MainArtist'] },
				],
				tech: { codec: 'FLAC', filePath: 'track.audioFilePath' },
			}),
		);

		const releaseList = [
			{
				releaseRef: 'R1',
				upc: release.upc ?? '',
				title: release.title,
				type: release.tracks.length > 1 ? 'Album' : 'Single',
				label: release.label?.name,
				originalReleaseDate: release.releaseDate
					?.toISOString()
					.split('T')[0],
				resourceRefs: resourceList.map((r) => r.resourceRef),
			},
		];

		const dealList: ReleaseDeal[] = [
			{
				releaseRef: 'R1',
				deals: [
					{
						territories: ['WORLD'],
						usage: ['STREAM'],
						commercialModel: ['SUBSCRIPTION'],
						startDate:
							release.releaseDate?.toISOString().split('T')[0] ??
							new Date().toISOString(),
						dspId: 'SPOTIFY',
					},
				],
			},
		];

		return { header, partyList, resourceList, releaseList, dealList };
	}

	private getDdexMessage(input: DdexMessage): string {
		return `
            <?xml version="1.0" encoding="UTF-8"?>
            <ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/38">
                ${this.getMessageHeaderXml(input.header)}
                <ern:PartyList>
                    ${input.partyList.map((p) => this.getPartyXml(p)).join('')}
                </ern:PartyList>
                <ern:ResourceList>
                    ${input.resourceList.map((r) => this.getResourceXml(r)).join('')}
                </ern:ResourceList>
                <ern:ReleaseList>
                    ${input.releaseList.map((rel) => this.getReleaseXml(rel)).join('')}
                </ern:ReleaseList>
                <ern:DealList>
                    ${input.dealList.map((d) => this.getDealXml(d)).join('')}
                </ern:DealList>
            </ern:NewReleaseMessage>
        `.trim();
	}

	private getMessageHeaderXml(input: MessageHeader): string {
		return `
            <ern:MessageHeader>
                <ern:MessageId>${input.messageId}</ern:MessageId>
                <ern:MessageSender><ern:PartyId>${input.senderId}</ern:PartyId></ern:MessageSender>
                <ern:MessageRecipient><ern:PartyId>${input.recipientId}</ern:PartyId></ern:MessageRecipient>
                <ern:MessageCreatedDateTime>${input.createdAt}</ern:MessageCreatedDateTime>
                <ern:MessageControlType>${input.controlType}</ern:MessageControlType>
            </ern:MessageHeader>
        `.trim();
	}

	private getPartyXml(input: Party): string {
		const roles =
			input.roles
				?.map((r) => `<ern:PartyRole>${r}</ern:PartyRole>`)
				.join('') ?? '';
		return `
            <ern:Party>
                <ern:PartyReference>${input.partyRef}</ern:PartyReference>
                <ern:PartyName><ern:FullName>${input.name}</ern:FullName></ern:PartyName>
                ${input.isni ? `<ern:PartyId><ern:ISNI>${input.isni}</ern:ISNI></ern:PartyId>` : ''}
                ${roles}
            </ern:Party>
        `.trim();
	}

	private getResourceXml(input: SoundRecording): string {
		const contributors = input.contributors
			.map(
				(c) => `
                        <ern:Contributor>
                            <ern:ContributorPartyReference>${c.partyRef}</ern:ContributorPartyReference>
                            ${c.roles.map((r) => `<ern:ContributorRole>${r}</ern:ContributorRole>`).join('')}
                        </ern:Contributor>
                    `,
			)
			.join('');

		return `
                <ern:SoundRecording>
                    <ern:ResourceReference>${input.resourceRef}</ern:ResourceReference>
                    <ern:SoundRecordingId><ern:ISRC>${input.isrc}</ern:ISRC></ern:SoundRecordingId>
                    <ern:ReferenceTitle><ern:TitleText>${input.title}</ern:TitleText></ern:ReferenceTitle>
                    ${contributors}
                    ${input.tech?.filePath ? `<ern:FilePath>${input.tech.filePath}</ern:FilePath>` : ''}
                </ern:SoundRecording>
            `.trim();
	}

	private getReleaseXml(input: DdexMessage['releaseList'][0]): string {
		const refs = input.resourceRefs
			.map(
				(r) =>
					`<ern:ReleaseResourceReference>${r}</ern:ReleaseResourceReference>`,
			)
			.join('');
		return `
            <ern:Release>
                <ern:ReleaseId><ern:ICPN>${input.upc}</ern:ICPN></ern:ReleaseId>
                <ern:ReferenceTitle><ern:TitleText>${input.title}</ern:TitleText></ern:ReferenceTitle>
                <ern:ReleaseType>${input.type}</ern:ReleaseType>
                ${input.label ? `<ern:LabelName>${input.label}</ern:LabelName>` : ''}
                ${input.originalReleaseDate ? `<ern:OriginalReleaseDate>${input.originalReleaseDate}</ern:OriginalReleaseDate>` : ''}
                <ern:ReleaseResourceReferenceList>${refs}</ern:ReleaseResourceReferenceList>
            </ern:Release>
        `.trim();
	}

	private getDealXml(input: ReleaseDeal): string {
		return input.deals
			.map(
				(d) => `
                    <ern:Deal>
                        <ern:DealReleaseReference>${input.releaseRef}</ern:DealReleaseReference>
                        <ern:DealTerms>
                            ${d.usage.map((u) => `<ern:UseType>${u}</ern:UseType>`).join('')}
                            ${d.territories.map((t) => `<ern:TerritoryCode>${t}</ern:TerritoryCode>`).join('')}
                            ${d.commercialModel.map((c) => `<ern:CommercialModelType>${c}</ern:CommercialModelType>`).join('')}
                            <ern:StartDate>${d.startDate}</ern:StartDate>
                        </ern:DealTerms>
                    </ern:Deal>
                `,
			)
			.join('');
	}
}
