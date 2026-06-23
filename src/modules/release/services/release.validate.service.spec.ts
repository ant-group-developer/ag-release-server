import { Release } from '../entities/release.entity';
import { ReleaseTimeMode } from '../enum/release.enum';
import { ReleaseValidateService } from './release.validate.service';

describe('ReleaseValidateService instrumental validation', () => {
	const service = new ReleaseValidateService(
		null as never,
		null as never,
		null as never,
		null as never,
		null as never,
		{ requiredArtistRoles: [] } as never,
	);

	it('skips language validation based on each entity instrumental flag', () => {
		const release = {
			type: 'audio',
			isInstrumental: true,
			title: 'Instrumental release',
			albumFormat: { code: 'Album' },
			releaseTimeMode: ReleaseTimeMode.GLOBAL_MIDNIGHT,
			releaseCoverArts: [],
			releaseArtists: [],
			releaseContributors: [],
			releaseLanguage: undefined,
			releaseTerritory: undefined,
			tracks: [
				{
					id: 'TRACK00001',
					title: 'Instrumental track',
					isInstrumental: true,
					trackLanguage: undefined,
					trackArtists: [],
					trackContributors: [],
				},
			],
		} as unknown as Release;

		const fields = service
			.getErrorsSchemaRelease(release)
			.map((error) => error.field);

		expect(
			fields.some((field) => field.startsWith('releaseLanguage.')),
		).toBe(false);
		expect(
			fields.some(
				(field) =>
					field.includes('audioLanguageId') ||
					field.includes('metadataLanguageId') ||
					field.includes('metadataLanguageCountryId'),
			),
		).toBe(false);
		expect(fields).toContain('tracks.0.trackLanguage.recordingCountryId');
	});

	it('does not use release isInstrumental to skip track language', () => {
		const release = {
			type: 'audio',
			isInstrumental: true,
			title: 'Instrumental release',
			albumFormat: { code: 'Album' },
			releaseTimeMode: ReleaseTimeMode.GLOBAL_MIDNIGHT,
			releaseCoverArts: [],
			releaseArtists: [],
			releaseContributors: [],
			releaseLanguage: undefined,
			releaseTerritory: undefined,
			tracks: [
				{
					id: 'TRACK00001',
					title: 'Vocal track',
					isInstrumental: false,
					trackLanguage: undefined,
					trackArtists: [],
					trackContributors: [],
				},
			],
		} as unknown as Release;

		const fields = service
			.getErrorsSchemaRelease(release)
			.map((error) => error.field);

		expect(fields).toContain('tracks.0.trackLanguage.audioLanguageId');
		expect(fields).toContain('tracks.0.trackLanguage.metadataLanguageId');
		expect(fields).toContain(
			'tracks.0.trackLanguage.metadataLanguageCountryId',
		);
	});

	it.skip('rejects explicit content when release and track have no vocals', () => {
		const release = {
			type: 'audio',
			isInstrumental: true,
			title: 'Instrumental release',
			albumFormat: { code: 'Album' },
			releaseTimeMode: ReleaseTimeMode.GLOBAL_MIDNIGHT,
			releaseCoverArts: [],
			releaseArtists: [],
			releaseContributors: [],
			releaseLanguage: undefined,
			releaseTerritory: undefined,
			tracks: [
				{
					id: 'TRACK00001',
					title: 'Explicit instrumental track',
					isInstrumental: true,
					trackLanguage: undefined,
					trackSensitive: { code: 'PARENTAL_ADVISORY' },
					trackArtists: [],
					trackContributors: [],
				},
			],
		} as unknown as Release;

		const explicitErrors = service
			.getErrorsSchemaRelease(release)
			.filter(
				(error) => error.messageCode === 'NOVOCALSETFOREXPLICITCONTENT',
			);

		expect(explicitErrors.map((error) => error.field)).toEqual(
			expect.arrayContaining([
				'isInstrumental',
				'tracks.0.trackSensitiveId',
			]),
		);
	});

	it.skip('rejects explicit content when track audio language is zxx', () => {
		const release = {
			type: 'audio',
			isInstrumental: false,
			title: 'Release',
			albumFormat: { code: 'Album' },
			releaseTimeMode: ReleaseTimeMode.GLOBAL_MIDNIGHT,
			releaseCoverArts: [],
			releaseArtists: [],
			releaseContributors: [],
			releaseLanguage: {},
			releaseTerritory: undefined,
			tracks: [
				{
					id: 'TRACK00001',
					title: 'No vocal track',
					isInstrumental: false,
					trackLanguage: {
						audioLanguage: { code: 'zxx' },
					},
					trackSensitive: { code: 'Explicit' },
					trackArtists: [],
					trackContributors: [],
				},
			],
		} as unknown as Release;

		const fields = service
			.getErrorsSchemaRelease(release)
			.filter(
				(error) => error.messageCode === 'NOVOCALSETFOREXPLICITCONTENT',
			)
			.map((error) => error.field);

		expect(fields).toEqual(['tracks.0.trackSensitiveId']);
	});
});
