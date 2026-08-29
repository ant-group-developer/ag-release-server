import { create } from 'xmlbuilder2';
import {
	ErnContributorInput,
	ErnInput2,
	ErnTrackInput2,
} from '../interfaces/ern-input.interface';

/**
 * Builds DDEX ERN 3.8.2 XML using xmlbuilder2.
 * Based on: samples/ern/382/Example1.xml
 *
 * Key differences from 4.3:
 * - No PartyList — artists inline with PartyName/FullName
 * - UpdateIndicator at root level
 * - SoundRecordingDetailsByTerritory (not SoundRecordingEdition)
 * - DisplayArtist uses ArtistRole (not DisplayArtistRole)
 * - ResourceContributor / IndirectResourceContributor inline
 * - ReleaseDetailsByTerritory with ResourceGroup
 * - All releases use <Release> (no separate <TrackRelease> element)
 */
export class Ern382Builder2 {
	constructor(private readonly input: ErnInput2) {}

	build(): string {
		const doc = create({ version: '1.0', encoding: 'UTF-8' });
		const root = doc.ele('ern:NewReleaseMessage', {
			'xmlns:ern': 'http://ddex.net/xml/ern/382',
			'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			LanguageAndScriptCode: 'en',
			'xsi:schemaLocation':
				'http://ddex.net/xml/ern/382 http://ddex.net/xml/ern/382/release-notification.xsd',
			MessageSchemaVersionId: 'ern/382',
		});

		this.buildMessageHeader(root);

		// UpdateIndicator (required for 3.8.2)
		root.ele('UpdateIndicator').txt(
			this.input.updateIndicator || 'OriginalMessage',
		);

		this.buildResourceList(root);
		this.buildReleaseList(root);
		this.buildDealList(root);

		return doc.end({ prettyPrint: true, indent: '  ' });
	}

	// ==================== MessageHeader ====================

	private buildMessageHeader(root: ReturnType<typeof create>): void {
		const { message } = this.input;
		const header = root.ele('MessageHeader');

		header.ele('MessageThreadId').txt(message.threadId || message.id);
		header.ele('MessageId').txt(message.id);

		const sender = header.ele('MessageSender');
		if (message.sender.isDPID) {
			sender
				.ele('PartyId', { IsDPID: 'true' })
				.txt(message.sender.partyId);
		} else {
			sender.ele('PartyId').txt(message.sender.partyId);
		}
		sender.ele('PartyName').ele('FullName').txt(message.sender.name);

		const recipient = header.ele('MessageRecipient');
		if (message.recipient.isDPID) {
			recipient
				.ele('PartyId', { IsDPID: 'true' })
				.txt(message.recipient.partyId);
		} else {
			recipient.ele('PartyId').txt(message.recipient.partyId);
		}
		recipient.ele('PartyName').ele('FullName').txt(message.recipient.name);

		header
			.ele('MessageCreatedDateTime')
			.txt(message.createdDateTime || new Date().toISOString());
	}

	// ==================== ResourceList ====================

	private buildResourceList(root: ReturnType<typeof create>): void {
		const resourceList = root.ele('ResourceList');

		for (let i = 0; i < this.input.tracks.length; i++) {
			this.buildSoundRecording(resourceList, this.input.tracks[i], i);
		}

		if (this.input.release.coverArt) {
			this.buildImage(resourceList);
		}
	}

	private buildSoundRecording(
		parent: ReturnType<typeof create>,
		track: ErnTrackInput2,
		index: number,
	): void {
		const ref = `A${index + 1}`;
		const techRef = `T${index + 1}S`;
		const territories = this.input.release.territories || ['Worldwide'];

		const sr = parent.ele('SoundRecording');

		// SoundRecordingId
		const srId = sr.ele('SoundRecordingId');
		srId.ele('ISRC').txt(track.isrc);

		sr.ele('ResourceReference').txt(ref);

		// Reference title
		const refTitle = sr.ele('ReferenceTitle', {
			LanguageAndScriptCode: 'en',
		});
		refTitle.ele('TitleText').txt(track.title);
		if (track.version) {
			refTitle.ele('SubTitle').txt(track.version);
		}

		if (track.isInstrumental) {
			sr.ele('IsInstrumental').txt('true');
		} else if (track.languageOfPerformance) {
			sr.ele('LanguageOfPerformance').txt(track.languageOfPerformance);
		}

		// Duration
		sr.ele('Duration').txt(this.normalizeDuration(track.duration));

		// SoundRecordingDetailsByTerritory
		const details = sr.ele('SoundRecordingDetailsByTerritory');

		for (const t of territories) {
			details.ele('TerritoryCode').txt(t);
		}

		// Titles
		const displayTitle = track.version
			? `${track.title} (${track.version})`
			: track.title;
		details
			.ele('Title', {
				TitleType: 'DisplayTitle',
				LanguageAndScriptCode: 'en',
			})
			.ele('TitleText')
			.txt(displayTitle);

		const formalTitle = details.ele('Title', {
			TitleType: 'FormalTitle',
			LanguageAndScriptCode: 'en',
		});
		formalTitle.ele('TitleText').txt(track.title);
		if (track.version) {
			formalTitle.ele('SubTitle').txt(track.version);
		}

		// Display artists (inline)
		for (const artist of track.artists) {
			const da = details.ele('DisplayArtist');
			const pn = da.ele('PartyName');
			if (artist.languageAndScriptCode) {
				pn.att('LanguageAndScriptCode', artist.languageAndScriptCode);
			}
			pn.ele('FullName').txt(artist.name);
			da.ele('ArtistRole').txt(artist.role);
		}

		// FeaturedArtist stored in contributors -> render as DisplayArtist (only this case, additive)
		if (track.contributors) {
			for (const c of track.contributors) {
				if (c.role === 'FeaturedArtist') {
					const da = details.ele('DisplayArtist');
					const pn = da.ele('PartyName');
					if (c.languageAndScriptCode) {
						pn.att(
							'LanguageAndScriptCode',
							c.languageAndScriptCode,
						);
					}
					pn.ele('FullName').txt(c.name);
					da.ele('ArtistRole').txt('FeaturedArtist');
				}
			}
		}

		// Role mapping
		const resourceRoles = ['Producer', 'Mixer'];

		// Resource contributors (from track.contributors)
		if (track.contributors && track.contributors.length > 0) {
			for (const contributor of track.contributors) {
				if (resourceRoles.includes(contributor.role)) {
					const rc = details.ele('ResourceContributor');
					const pn = rc.ele('PartyName');
					if (contributor.languageAndScriptCode) {
						pn.att(
							'LanguageAndScriptCode',
							contributor.languageAndScriptCode,
						);
					}
					pn.ele('FullName').txt(contributor.name);
					rc.ele('ResourceContributorRole').txt(contributor.role);
				}
			}
		}

		// Indirect resource contributors (composers, lyricists, etc.)
		// Exclude FeaturedArtist (already rendered as DisplayArtist above)
		if (track.contributors && track.contributors.length > 0) {
			for (const contributor of track.contributors) {
				if (
					!resourceRoles.includes(contributor.role) &&
					contributor.role !== 'FeaturedArtist'
				) {
					this.buildIndirectContributor(details, contributor);
				}
			}
		}

		// Display artist name (combined main feat. featured for DSP display)
		const mainsDisplay = track.artists
			.map((a) => a.name.trim())
			.filter(Boolean);
		const featuredsDisplay =
			track.contributors
				?.filter((c) => c.role === 'FeaturedArtist')
				.map((c) => c.name.trim())
				.filter(Boolean) ?? [];
		const displayArtistName = featuredsDisplay.length
			? `${mainsDisplay.join(', ')} feat. ${featuredsDisplay.join(', ')}`
			: mainsDisplay.join(', ');
		details.ele('DisplayArtistName').txt(displayArtistName);

		// Label
		details.ele('LabelName').txt(this.input.release.labelName);

		// PLine
		const pLine = track.pLine || this.input.release.pLine;
		if (pLine) {
			const pl = details.ele('PLine');
			pl.ele('Year').txt(String(pLine.year));
			pl.ele('PLineText').txt(pLine.text);
		}

		// Genre
		const genre = details.ele('Genre');
		genre.ele('GenreText').txt(track.genre || this.input.release.genre);
		if (track.subGenre || this.input.release.subGenre) {
			genre
				.ele('SubGenre')
				.txt(track.subGenre || this.input.release.subGenre || '');
		}

		// Parental warning
		details
			.ele('ParentalWarningType')
			.txt(
				track.parentalWarning ||
					this.input.release.parentalWarning ||
					'NotExplicit',
			);

		// Technical details (bỏ khi takedown — không gửi file resource)
		if (!this.input.isTakedown) {
			const tech = details.ele('TechnicalSoundRecordingDetails');
			tech.ele('TechnicalResourceDetailsReference').txt(techRef);

			if (track.audioFile) {
				if (track.audioFile.codecType) {
					const codec = track.audioFile.codecType.toUpperCase();
					if (codec === 'WAV') {
						tech.ele('AudioCodecType', {
							UserDefinedValue: codec,
						}).txt('UserDefined');
					} else {
						tech.ele('AudioCodecType').txt(codec);
					}
				}
				if (track.audioFile.bitRate) {
					tech.ele('BitRate', { UnitOfMeasure: 'kbps' }).txt(
						String(track.audioFile.bitRate),
					);
				}
				if (track.audioFile.channels) {
					tech.ele('NumberOfChannels').txt(track.audioFile.channels);
				}
				if (track.audioFile.samplingRate) {
					tech.ele('SamplingRate').txt(
						String(track.audioFile.samplingRate),
					);
				}
				if (track.audioFile.bitDepth) {
					tech.ele('BitsPerSample').txt(
						String(track.audioFile.bitDepth),
					);
				}

				const file = tech.ele('File');
				file.ele('FileName').txt(track.audioFile.fileName);
				if (track.audioFile.filePath) {
					file.ele('FilePath').txt(track.audioFile.filePath);
				}
				if (track.audioFile.hashSum) {
					const hash = file.ele('HashSum');
					hash.ele('HashSum').txt(track.audioFile.hashSum);
					hash.ele('HashSumAlgorithmType').txt(
						track.audioFile.hashAlgorithm || 'MD5',
					);
				}
			}
		}
	}

	private buildIndirectContributor(
		parent: ReturnType<typeof create>,
		contributor: ErnContributorInput,
	): void {
		const knownRoles = [
			'Composer',
			'ComposerLyricist',
			'Lyricist',
			'Arranger',
			'MusicPublisher',
		];

		const irc = parent.ele('IndirectResourceContributor');
		const pn = irc.ele('PartyName');
		if (contributor.languageAndScriptCode) {
			pn.att('LanguageAndScriptCode', contributor.languageAndScriptCode);
		}
		pn.ele('FullName').txt(contributor.name);

		if (knownRoles.includes(contributor.role)) {
			irc.ele('IndirectResourceContributorRole').txt(contributor.role);
		} else {
			irc.ele('IndirectResourceContributorRole', {
				UserDefinedValue: contributor.role,
			}).txt('UserDefined');
		}
	}

	private buildImage(parent: ReturnType<typeof create>): void {
		const coverArt = this.input.release.coverArt!;
		const ref = `A${this.input.tracks.length + 1}`;
		const techRef = `T${this.input.tracks.length + 1}`;
		const territories = this.input.release.territories || ['Worldwide'];

		const image = parent.ele('Image');
		image.ele('ImageType').txt('FrontCoverImage');

		// ImageId
		image
			.ele('ImageId')
			.ele('ProprietaryId', {
				Namespace: this.input.message.recipient.partyId,
			})
			.txt(this.input.release.upc);

		image.ele('ResourceReference').txt(ref);

		// ImageDetailsByTerritory
		const details = image.ele('ImageDetailsByTerritory');
		for (const t of territories) {
			details.ele('TerritoryCode').txt(t);
		}

		// Technical details (bỏ khi takedown — không gửi file cover)
		if (!this.input.isTakedown) {
			const tech = details.ele('TechnicalImageDetails');
			tech.ele('TechnicalResourceDetailsReference').txt(techRef);

			if (coverArt.codecType) {
				let c = coverArt.codecType.toUpperCase();
				if (c === 'IMAGE/JPEG' || c === 'JPG') c = 'JPEG';
				else if (c === 'IMAGE/PNG') c = 'PNG';
				else if (c === 'IMAGE/GIF') c = 'GIF';
				tech.ele('ImageCodecType').txt(c);
			}
			if (coverArt.height) {
				tech.ele('ImageHeight').txt(String(coverArt.height));
			}
			if (coverArt.width) {
				tech.ele('ImageWidth').txt(String(coverArt.width));
			}

			const file = tech.ele('File');
			file.ele('FileName').txt(coverArt.fileName);
			if (coverArt.filePath) {
				file.ele('FilePath').txt(coverArt.filePath);
			}
			if (coverArt.hashSum) {
				const hash = file.ele('HashSum');
				hash.ele('HashSum').txt(coverArt.hashSum);
				hash.ele('HashSumAlgorithmType').txt(
					coverArt.hashAlgorithm || 'MD5',
				);
			}
		}
	}
	// ==================== ReleaseList ====================

	private buildReleaseList(root: ReturnType<typeof create>): void {
		const releaseList = root.ele('ReleaseList');

		// Track releases first (R1, R2, ...)
		for (let i = 0; i < this.input.tracks.length; i++) {
			this.buildTrackRelease(releaseList, this.input.tracks[i], i);
		}

		// Main release last (R0)
		this.buildMainRelease(releaseList);
	}

	private buildTrackRelease(
		parent: ReturnType<typeof create>,
		track: ErnTrackInput2,
		index: number,
	): void {
		const ref = `R${index + 1}`;
		const resourceRef = `A${index + 1}`;
		const territories = this.input.release.territories || ['Worldwide'];

		const release = parent.ele('Release');

		// ReleaseId
		const releaseId = release.ele('ReleaseId');
		releaseId.ele('ISRC').txt(track.isrc);

		release.ele('ReleaseReference').txt(ref);

		// Reference title
		const refTitle = release.ele('ReferenceTitle', {
			LanguageAndScriptCode: 'en',
		});
		refTitle.ele('TitleText').txt(track.title);
		if (track.version) refTitle.ele('SubTitle').txt(track.version);

		// Resource references
		release
			.ele('ReleaseResourceReferenceList')
			.ele('ReleaseResourceReference')
			.txt(resourceRef);

		release.ele('ReleaseType').txt('TrackRelease');

		// Details by territory
		const details = release.ele('ReleaseDetailsByTerritory');

		for (const t of territories) {
			details.ele('TerritoryCode').txt(t);
		}

		// Display artist name (combined main feat. featured for DSP display)
		const mainsDisplay = track.artists
			.map((a) => a.name.trim())
			.filter(Boolean);
		const featuredsDisplay =
			track.contributors
				?.filter((c) => c.role === 'FeaturedArtist')
				.map((c) => c.name.trim())
				.filter(Boolean) ?? [];

		const displayArtistName = featuredsDisplay.length
			? `${mainsDisplay.join(', ')} feat. ${featuredsDisplay.join(', ')}`
			: mainsDisplay.join(', ');

		details.ele('DisplayArtistName').txt(displayArtistName);
		details.ele('LabelName').txt(this.input.release.labelName);

		// Display artists
		for (const artist of track.artists) {
			const da = details.ele('DisplayArtist');
			const pn = da.ele('PartyName');
			if (artist.languageAndScriptCode) {
				pn.att('LanguageAndScriptCode', artist.languageAndScriptCode);
			}
			pn.ele('FullName').txt(artist.name);
			da.ele('ArtistRole').txt(artist.role);
		}

		// FeaturedArtist stored in contributors -> render as DisplayArtist (only this case, additive)
		if (track.contributors) {
			for (const c of track.contributors) {
				if (c.role === 'FeaturedArtist') {
					const da = details.ele('DisplayArtist');
					const pn = da.ele('PartyName');
					if (c.languageAndScriptCode) {
						pn.att(
							'LanguageAndScriptCode',
							c.languageAndScriptCode,
						);
					}
					pn.ele('FullName').txt(c.name);
					da.ele('ArtistRole').txt('FeaturedArtist');
				}
			}
		}

		// Related release (link back to main)
		const related = details.ele('RelatedRelease');
		const relatedId = related.ele('ReleaseId');
		if (this.input.release.isEan) {
			relatedId
				.ele('ICPN', { IsEan: 'true' })
				.txt(this.input.release.upc);
		} else {
			relatedId.ele('ICPN').txt(this.input.release.upc);
		}
		if (this.input.release.catalogNumber) {
			relatedId
				.ele('CatalogNumber', {
					Namespace: this.input.release.labelName
						.toLowerCase()
						.replace(/\s+/g, '-'),
				})
				.txt(this.input.release.catalogNumber);
		}
		related
			.ele('ReferenceTitle', { LanguageAndScriptCode: 'en' })
			.ele('TitleText')
			.txt(this.input.release.title);
		related.ele('ReleaseRelationshipType').txt('IsReleaseFromRelease');

		// Parental warning
		details
			.ele('ParentalWarningType')
			.txt(
				track.parentalWarning ||
					this.input.release.parentalWarning ||
					'NotExplicit',
			);

		// Genre
		const genre = details.ele('Genre');
		genre.ele('GenreText').txt(track.genre || this.input.release.genre);
		if (track.subGenre || this.input.release.subGenre) {
			genre
				.ele('SubGenre')
				.txt(track.subGenre || this.input.release.subGenre || '');
		}

		// Duration
		release.ele('Duration').txt(this.normalizeDuration(track.duration));
	}

	private buildMainRelease(parent: ReturnType<typeof create>): void {
		const territories = this.input.release.territories || ['Worldwide'];
		const release = parent.ele('Release');

		// ReleaseId
		const releaseId = release.ele('ReleaseId');
		if (this.input.release.isEan) {
			releaseId
				.ele('ICPN', { IsEan: 'true' })
				.txt(this.input.release.upc);
		} else {
			releaseId.ele('ICPN').txt(this.input.release.upc);
		}
		if (this.input.release.catalogNumber) {
			releaseId
				.ele('CatalogNumber', {
					Namespace: this.input.release.labelName
						.toLowerCase()
						.replace(/\s+/g, '-'),
				})
				.txt(this.input.release.catalogNumber);
		}

		release.ele('ReleaseReference').txt('R0');

		// Reference title
		const refTitle = release.ele('ReferenceTitle', {
			LanguageAndScriptCode: 'en',
		});
		refTitle.ele('TitleText').txt(this.input.release.title);
		if (this.input.release.version) {
			refTitle.ele('SubTitle').txt(this.input.release.version);
		}

		// All resource references
		const refList = release.ele('ReleaseResourceReferenceList');
		// Cover art first
		if (this.input.release.coverArt) {
			refList
				.ele('ReleaseResourceReference')
				.txt(`A${this.input.tracks.length + 1}`);
		}
		// Sound recordings
		for (let i = 0; i < this.input.tracks.length; i++) {
			refList.ele('ReleaseResourceReference').txt(`A${i + 1}`);
		}

		release.ele('ReleaseType').txt(this.input.release.type);

		// Details by territory
		const details = release.ele('ReleaseDetailsByTerritory');

		for (const t of territories) {
			details.ele('TerritoryCode').txt(t);
		}

		// Display artist
		const artistName = this.input.release.artists
			.map((a) => a.name)
			.join(', ');
		details.ele('DisplayArtistName').txt(artistName);
		details.ele('LabelName').txt(this.input.release.labelName);

		for (const artist of this.input.release.artists) {
			const da = details.ele('DisplayArtist');
			const pn = da.ele('PartyName');
			if (artist.languageAndScriptCode) {
				pn.att('LanguageAndScriptCode', artist.languageAndScriptCode);
			}
			pn.ele('FullName').txt(artist.name);
			da.ele('ArtistRole').txt(artist.role);
		}

		// Parental warning
		details
			.ele('ParentalWarningType')
			.txt(this.input.release.parentalWarning || 'NotExplicit');

		// ResourceGroup
		const rg = details.ele('ResourceGroup');
		rg.ele('SequenceNumber').txt('1');
		for (let i = 0; i < this.input.tracks.length; i++) {
			const item = rg.ele('ResourceGroupContentItem');
			item.ele('SequenceNumber').txt(String(i + 1));
			item.ele('ReleaseResourceReference').txt(`A${i + 1}`);
		}

		// Genre
		const genre = details.ele('Genre');
		genre.ele('GenreText').txt(this.input.release.genre);
		if (this.input.release.subGenre) {
			genre.ele('SubGenre').txt(this.input.release.subGenre);
		}

		// Release date
		details.ele('OriginalReleaseDate').txt(this.input.release.releaseDate);

		// Total duration
		const totalSeconds = this.input.tracks.reduce(
			(sum, t) => sum + this.durationToSeconds(t.duration),
			0,
		);
		release.ele('Duration').txt(this.secondsToIso(totalSeconds));

		// PLine / CLine at release level
		if (this.input.release.pLine) {
			const pl = release.ele('PLine');
			pl.ele('Year').txt(String(this.input.release.pLine.year));
			pl.ele('PLineText').txt(this.input.release.pLine.text);
		}
		if (this.input.release.cLine) {
			const cl = release.ele('CLine');
			cl.ele('Year').txt(String(this.input.release.cLine.year));
			cl.ele('CLineText').txt(this.input.release.cLine.text);
		}
	}

	// ==================== DealList ====================

	private buildDealList(root: ReturnType<typeof create>): void {
		const dealList = root.ele('DealList');

		const hasDeals =
			this.input.deals &&
			((this.input.deals.release &&
				this.input.deals.release.length > 0) ||
				(this.input.deals.tracks &&
					this.input.deals.tracks.length > 0));

		if (hasDeals) {
			this.buildExplicitDeals(dealList);
		} else {
			this.buildDefaultDeals(dealList);
		}
	}

	private buildExplicitDeals(dealList: ReturnType<typeof create>): void {
		// Main release deal
		if (this.input.deals?.release && this.input.deals.release.length > 0) {
			const rd = dealList.ele('ReleaseDeal');
			rd.ele('DealReleaseReference').txt('R0');

			for (const deal of this.input.deals.release) {
				const d = rd.ele('Deal');
				const terms = d.ele('DealTerms');

				for (const cm of deal.commercialModels) {
					terms.ele('CommercialModelType').txt(cm);
				}

				const usage = terms.ele('Usage');
				for (const ut of deal.useTypes) {
					usage.ele('UseType').txt(ut);
				}

				for (const t of deal.territories) {
					terms.ele('TerritoryCode').txt(t);
				}

				if (deal.price) {
					const pi = terms.ele('PriceInformation');
					pi.ele('PriceRangeType', {
						Namespace: `DPID:${this.input.message.sender.partyId}`,
					}).txt(deal.price.priceRangeType || 'mid');

					if (deal.useTypes?.includes('PermanentDownload')) {
						pi.ele('PriceType', {
							Namespace: this.input.message.sender.partyId,
						}).txt(deal.price.priceRangeType || 'mid');
					}
				}

				const validity = terms.ele('ValidityPeriod');
				validity.ele('StartDate').txt(deal.startDate.split('T')[0]);
				if (deal.endDate) {
					validity.ele('EndDate').txt(deal.endDate.split('T')[0]);
				}
			}

			// Add EffectiveDate once per ReleaseDeal using the first deal's start date
			rd.ele('EffectiveDate').txt(
				this.input.deals.release[0].startDate.split('T')[0],
			);
		}

		// Track release deals
		if (this.input.deals?.tracks && this.input.deals.tracks.length > 0) {
			for (let i = 0; i < this.input.tracks.length; i++) {
				const releaseRef = `R${i + 1}`;
				const rd = dealList.ele('ReleaseDeal');
				rd.ele('DealReleaseReference').txt(releaseRef);

				for (const deal of this.input.deals.tracks) {
					const d = rd.ele('Deal');
					const terms = d.ele('DealTerms');

					for (const cm of deal.commercialModels) {
						terms.ele('CommercialModelType').txt(cm);
					}

					const usage = terms.ele('Usage');
					for (const ut of deal.useTypes) {
						usage.ele('UseType').txt(ut);
					}

					for (const t of deal.territories) {
						terms.ele('TerritoryCode').txt(t);
					}

					if (deal.price) {
						const pi = terms.ele('PriceInformation');
						pi.ele('PriceRangeType', {
							Namespace: `DPID:${this.input.message.sender.partyId}`,
						}).txt(deal.price.priceRangeType || 'mid');

						if (deal.useTypes?.includes('PermanentDownload')) {
							pi.ele('PriceType', {
								Namespace: this.input.message.sender.partyId,
							}).txt(deal.price.priceRangeType || 'mid');
						}
					}

					const validity = terms.ele('ValidityPeriod');
					validity.ele('StartDate').txt(deal.startDate.split('T')[0]);
					if (deal.endDate) {
						validity.ele('EndDate').txt(deal.endDate.split('T')[0]);
					}
				}

				// Add EffectiveDate once per ReleaseDeal
				rd.ele('EffectiveDate').txt(
					this.input.deals.tracks[0].startDate.split('T')[0],
				);
			}
		}
	}

	private buildDefaultDeals(dealList: ReturnType<typeof create>): void {
		const territories = this.input.release.territories || ['Worldwide'];
		const startDate = this.input.release.releaseDate;

		// Main release
		const rd0 = dealList.ele('ReleaseDeal');
		rd0.ele('DealReleaseReference').txt('R0');
		const d0 = rd0.ele('Deal');
		const t0 = d0.ele('DealTerms');
		t0.ele('Usage').ele('UseType').txt('PermanentDownload');
		for (const t of territories) {
			t0.ele('TerritoryCode').txt(t);
		}
		const pi0 = t0.ele('PriceInformation');
		pi0.ele('PriceRangeType', {
			Namespace: `DPID:${this.input.message.sender.partyId}`,
		}).txt('mid');
		pi0.ele('PriceType', {
			Namespace: this.input.message.sender.partyId,
		}).txt('mid');
		t0.ele('ValidityPeriod').ele('StartDate').txt(startDate);
		rd0.ele('EffectiveDate').txt(startDate);

		// Track releases
		for (let i = 0; i < this.input.tracks.length; i++) {
			const rd = dealList.ele('ReleaseDeal');
			rd.ele('DealReleaseReference').txt(`R${i + 1}`);
			const d = rd.ele('Deal');
			const terms = d.ele('DealTerms');
			terms.ele('Usage').ele('UseType').txt('OnDemandStream');
			for (const t of territories) {
				terms.ele('TerritoryCode').txt(t);
			}
			const pi = terms.ele('PriceInformation');
			pi.ele('PriceRangeType', {
				Namespace: `DPID:${this.input.message.sender.partyId}`,
			}).txt('mid');
			terms.ele('ValidityPeriod').ele('StartDate').txt(startDate);
			rd.ele('EffectiveDate').txt(startDate);
		}
	}

	// ==================== Helpers ====================

	private normalizeDuration(duration: string | number): string {
		if (typeof duration === 'number') {
			return this.secondsToIso(duration);
		}
		return duration;
	}

	private secondsToIso(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `PT${String(h).padStart(2, '0')}H${String(m).padStart(2, '0')}M${String(s).padStart(2, '0')}S`;
	}

	private durationToSeconds(duration: string | number): number {
		if (typeof duration === 'number') return duration;
		const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return 0;
		const h = parseInt(match[1] || '0');
		const m = parseInt(match[2] || '0');
		const s = parseInt(match[3] || '0');
		return h * 3600 + m * 60 + s;
	}
}
