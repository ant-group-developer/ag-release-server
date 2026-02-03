import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrmService } from '../orm/orm.service';
import { Release } from '../release/entities/release.entity';
import { DeliveryService } from './delivery.service';

describe('DeliveryService', () => {
	let service: DeliveryService;
	let releaseRepo: Repository<Release>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				DeliveryService,
				{ provide: OrmService, useValue: {} },
				{
					provide: getRepositoryToken(Release),
					useValue: {
						findOne: jest.fn(),
					},
				},
			],
		}).compile();

		service = module.get<DeliveryService>(DeliveryService);
		releaseRepo = module.get(getRepositoryToken(Release));
	});

	it('should build full DDEX XML from releaseId', async () => {
		(releaseRepo.findOne as jest.Mock).mockResolvedValue({
			id: 'rel-001',
			upc: '123456789012',
			title: 'Chill Album',
			releaseDate: new Date('2025-01-01'),
			label: { name: 'ANT Music' },
			tracks: [
				{
					title: 'Track One',
					isrc: 'US-AAA-25-00001',
					audioFile: { duration: 200 },
				},
			],
			releaseArtists: [{ artist: { name: 'John Doe' } }],
		});

		const xml = await service.buildMetadataXml('rel-001');

		expect(xml).toContain('<ern:NewReleaseMessage');
		expect(xml).toContain('<ern:MessageId>ANT-rel-001</ern:MessageId>');
		expect(xml).toContain('<ern:ISRC>US-AAA-25-00001</ern:ISRC>');
		expect(xml).toContain('<ern:LabelName>ANT Music</ern:LabelName>');
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('should build correct metadata for release', async () => {
		(releaseRepo.findOne as jest.Mock).mockResolvedValue({
			id: 'rel-001',
			upc: '123456789012',
			title: 'Chill Album',
			releaseDate: new Date('2025-01-01'),
			label: { name: 'ANT Music' },
			tracks: [
				{
					title: 'Track One',
					isrc: 'US-AAA-25-00001',
					audioFile: { duration: 200 },
				},
				{
					title: 'Track Two',
					isrc: 'US-AAA-25-00002',
					audioFile: { duration: 180 },
				},
			],
			releaseArtists: [{ artist: { name: 'John Doe' } }],
		});

		const result = await service.buildMetadata('rel-001');

		expect(result.header.messageId).toBe('ANT-rel-001');
		expect(result.releaseList[0].type).toBe('Album');
		expect(result.partyList[0].name).toBe('John Doe');
		expect(result.resourceList).toHaveLength(2);
		expect(result.dealList[0].deals[0].dspId).toBe('SPOTIFY');
	});

	it('should throw error if release not found', async () => {
		(releaseRepo.findOne as jest.Mock).mockResolvedValue(null);

		await expect(service.buildMetadata('rel-999')).rejects.toThrow(
			'Release not found',
		);
	});

	it('should build full DDEX XML from releaseId', async () => {
		(releaseRepo.findOne as jest.Mock).mockResolvedValue({
			id: 'rel-001',
			upc: '123456789012',
			title: 'Chill Album',
			releaseDate: new Date('2025-01-01'),
			label: { name: 'ANT Music' },
			tracks: [
				{
					title: 'Track One',
					isrc: 'US-AAA-25-00001',
					audioFile: { duration: 200 },
				},
			],
			releaseArtists: [{ artist: { name: 'John Doe' } }],
		});

		const xml = await service.buildMetadataXml('rel-001');

		expect(xml).toContain('<ern:NewReleaseMessage');
		expect(xml).toContain('<ern:MessageId>ANT-rel-001</ern:MessageId>');
		expect(xml).toContain('<ern:ISRC>US-AAA-25-00001</ern:ISRC>');
		expect(xml).toContain('<ern:LabelName>ANT Music</ern:LabelName>');
	});

	it('should create ddex folder structure', async () => {
		const result = await service.createDdexBatchFolder({
			releaseId: 'abc123',
		});
		expect(result.baseDir).toContain('ddex_batches');
	});
});
