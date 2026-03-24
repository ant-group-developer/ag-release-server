import { create } from 'xmlbuilder2';
import {
	ErnArtistInput,
	ErnContributorInput,
	ErnDealInput,
	ErnInput,
	ErnTrackInput,
} from '../interfaces/ern-input.interface';

/**
 * Builds DDEX ERN 4.3 XML using xmlbuilder2.
 * Based on: samples/ern/43/external-audio-baseline-ern43.xml
 *
 * Structure: MessageHeader → PartyList → ResourceList → ReleaseList → DealList
 */
export class Ern43Builder {
	private partyIndex = 0;
	private readonly partyMap = new Map<string, string>();

	constructor(private readonly input: ErnInput) {}

	build(): string {
		this.partyIndex = 0;
		this.partyMap.clear();

		// Pre-register all parties so refs are stable
		this.registerParties();

		const doc = create({ version: '1.0', encoding: 'UTF-8' });
		const root = doc.ele('ern:NewReleaseMessage', {
			'xmlns:ern': 'http://ddex.net/xml/ern/43',
			'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'xsi:schemaLocation':
				'http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd',
			ReleaseProfileVersionId: 'Audio',
			LanguageAndScriptCode: 'en',
			AvsVersionId: '3',
		});

		this.buildMessageHeader(root);
		this.buildPartyList(root);
		this.buildResourceList(root);
		this.buildReleaseList(root);
		this.buildDealList(root);

		return doc.end({ prettyPrint: true, indent: '    ' });
	}

	// ==================== Party Registration ====================

	private getPartyRef(name: string): string {
		return this.partyMap.get(name) ?? name;
	}

	private addParty(name: string): string {
		if (this.partyMap.has(name)) return this.partyMap.get(name)!;
		this.partyIndex++;
		const ref = `P${this.partyIndex}`;
		this.partyMap.set(name, ref);
		return ref;
	}

	private registerParties(): void {
		// Release artists
		for (const a of this.input.release.artists) {
			this.addParty(a.name);
		}
		// Track artists + contributors
		for (const t of this.input.tracks) {
			for (const a of t.artists) this.addParty(a.name);
			if (t.contributors) {
				for (const c of t.contributors) this.addParty(c.name);
			}
		}
		// Label
		this.addParty(this.input.release.labelName);
	}

	// ==================== MessageHeader ====================

	private buildMessageHeader(root: ReturnType<typeof create>): void {
		const { message } = this.input;
		const header = root.ele('MessageHeader');

		header.ele('MessageThreadId').txt(message.threadId || message.id);
		header.ele('MessageId').txt(message.id);

		const sender = header.ele('MessageSender');
		sender.ele('PartyId').txt(message.sender.partyId);
		sender.ele('PartyName').ele('FullName').txt(message.sender.name);

		const recipient = header.ele('MessageRecipient');
		recipient.ele('PartyId').txt(message.recipient.partyId);
		recipient.ele('PartyName').ele('FullName').txt(message.recipient.name);

		header
			.ele('MessageCreatedDateTime')
			.txt(message.createdDateTime || new Date().toISOString());
	}

	// ==================== PartyList ====================

	private buildPartyList(root: ReturnType<typeof create>): void {
		const partyList = root.ele('PartyList');

		for (const [name, ref] of this.partyMap) {
			const party = partyList.ele('Party');
			party.ele('PartyReference').txt(ref);
			party.ele('PartyName').ele('FullName').txt(name);

			// Find artist data to add proprietary IDs
			const artistData = this.findArtistByName(name);
			if (artistData?.spotifyId) {
				party
					.ele('PartyId')
					.ele('ProprietaryId', {
						Namespace: this.input.message.recipient.partyId,
					})
					.txt(`spotify:artist:${artistData.spotifyId}`);
			}
		}
	}

	private findArtistByName(name: string): ErnArtistInput | undefined {
		for (const a of this.input.release.artists) {
			if (a.name === name) return a;
		}
		for (const t of this.input.tracks) {
			for (const a of t.artists) {
				if (a.name === name) return a;
			}
		}
		return undefined;
	}

	// ==================== ResourceList ====================

	private buildResourceList(root: ReturnType<typeof create>): void {
		const resourceList = root.ele('ResourceList');

		// Sound recordings
		for (let i = 0; i < this.input.tracks.length; i++) {
			this.buildSoundRecording(resourceList, this.input.tracks[i], i);
		}

		// Cover art image
		if (this.input.release.coverArt) {
			this.buildImage(resourceList);
		}
	}

	private buildSoundRecording(
		parent: ReturnType<typeof create>,
		track: ErnTrackInput,
		index: number,
	): void {
		const ref = `A${index + 1}`;
		const techRef = `T${index + 1}S`;

		const sr = parent.ele('SoundRecording');
		sr.ele('ResourceReference').txt(ref);
		sr.ele('Type').txt('MusicalWorkSoundRecording');

		// SoundRecordingEdition
		const edition = sr.ele('SoundRecordingEdition');
		edition.ele('Type').txt('NonImmersiveEdition');
		edition.ele('ResourceId').ele('ISRC').txt(track.isrc);

		// PLine
		const pLine = track.pLine || this.input.release.pLine;
		if (pLine) {
			const pl = edition.ele('PLine');
			pl.ele('Year').txt(String(pLine.year));
			pl.ele('PLineText').txt(pLine.text);
		}

		// Recording mode
		if (track.recordingMode) {
			edition.ele('RecordingMode').txt(track.recordingMode);
		}

		// Technical details
		const techDetails = edition.ele('TechnicalDetails');
		techDetails.ele('TechnicalResourceDetailsReference').txt(techRef);
		const deliveryFile = techDetails.ele('DeliveryFile');
		deliveryFile.ele('Type').txt('AudioFile');

		if (track.audioFile) {
			const file = deliveryFile.ele('File');
			file.ele('URI').txt(track.audioFile.fileName);
			if (track.audioFile.hashSum) {
				const hash = file.ele('HashSum');
				hash.ele('HashSum').txt(track.audioFile.hashSum);
				hash.ele('HashSumAlgorithmType').txt(
					track.audioFile.hashAlgorithm || 'MD5',
				);
			}
		} else {
			deliveryFile
				.ele('File')
				.ele('URI')
				.txt(`${track.isrc}_${techRef}.wav`);
		}

		deliveryFile.ele('IsProvidedInDelivery').txt('true');

		// WorkId (ISWC)
		if (track.iswc) {
			sr.ele('WorkId').ele('ISWC').txt(track.iswc);
		}

		// Display title
		const displayTitle = track.version
			? `${track.title} (${track.version})`
			: track.title;
		sr.ele('DisplayTitleText').txt(displayTitle);
		const dt = sr.ele('DisplayTitle', {
			ApplicableTerritoryCode: 'Worldwide',
			IsDefault: 'true',
		});
		dt.ele('TitleText').txt(track.title);
		if (track.version) dt.ele('SubTitle').txt(track.version);

		// Display artist name
		const artistName = track.artists.map((a) => a.name).join(', ');
		sr.ele('DisplayArtistName', {
			ApplicableTerritoryCode: 'Worldwide',
			IsDefault: 'true',
		}).txt(artistName);

		// Display artists
		for (let i = 0; i < track.artists.length; i++) {
			const da = sr.ele('DisplayArtist', {
				SequenceNumber: String(i + 1),
			});
			da.ele('ArtistPartyReference').txt(
				this.getPartyRef(track.artists[i].name),
			);
			da.ele('DisplayArtistRole').txt(track.artists[i].role);
		}

		// Contributors
		if (track.contributors) {
			for (let i = 0; i < track.contributors.length; i++) {
				this.buildContributor(sr, track.contributors[i], i + 1);
			}
		}

		// Duration
		sr.ele('Duration').txt(this.normalizeDuration(track.duration));

		// Parental warning
		sr.ele('ParentalWarningType').txt(
			track.parentalWarning ||
				this.input.release.parentalWarning ||
				'NotExplicit',
		);
	}

	private buildContributor(
		parent: ReturnType<typeof create>,
		contributor: ErnContributorInput,
		seq: number,
	): void {
		const c = parent.ele('Contributor', {
			SequenceNumber: String(seq),
		});
		c.ele('ContributorPartyReference').txt(
			this.getPartyRef(contributor.name),
		);

		// Known DDEX roles → direct; unknown → UserDefined
		const knownRoles = [
			'Composer',
			'ComposerLyricist',
			'Lyricist',
			'Arranger',
		];
		if (knownRoles.includes(contributor.role)) {
			c.ele('Role').txt(contributor.role);
		} else {
			c.ele('Role', {
				Namespace: 'DPID',
				UserDefinedValue: contributor.role,
			}).txt('UserDefined');
		}
	}

	private buildImage(parent: ReturnType<typeof create>): void {
		const coverArt = this.input.release.coverArt!;
		const ref = `A${this.input.tracks.length + 1}`;
		const techRef = `T${this.input.tracks.length + 1}`;

		const image = parent.ele('Image');
		image.ele('ResourceReference').txt(ref);
		image.ele('Type').txt('FrontCoverImage');

		// ProprietaryId
		image
			.ele('ResourceId')
			.ele('ProprietaryId', {
				Namespace: this.input.message.recipient.partyId,
			})
			.txt(`front-cover-image:${this.input.release.upc}`);

		// CLine
		if (this.input.release.cLine) {
			const cl = image.ele('CLine');
			cl.ele('Year').txt(String(this.input.release.cLine.year));
			cl.ele('CLineText').txt(this.input.release.cLine.text);
		}

		image
			.ele('ParentalWarningType')
			.txt(this.input.release.parentalWarning || 'NotExplicit');

		// Technical details
		const tech = image.ele('TechnicalDetails');
		tech.ele('TechnicalResourceDetailsReference').txt(techRef);
		const file = tech.ele('File');
		file.ele('URI').txt(coverArt.fileName);
		if (coverArt.hashSum) {
			const hash = file.ele('HashSum');
			hash.ele('HashSum').txt(coverArt.hashSum);
			hash.ele('HashSumAlgorithmType').txt(
				coverArt.hashAlgorithm || 'MD5',
			);
		}
	}

	// ==================== ReleaseList ====================

	private buildReleaseList(root: ReturnType<typeof create>): void {
		const releaseList = root.ele('ReleaseList');

		// Main release (R0)
		this.buildMainRelease(releaseList);

		// Track releases (R1, R2, ...)
		for (let i = 0; i < this.input.tracks.length; i++) {
			this.buildTrackRelease(releaseList, i);
		}
	}

	private buildMainRelease(parent: ReturnType<typeof create>): void {
		const release = parent.ele('Release');
		release.ele('ReleaseReference').txt('R0');
		release.ele('ReleaseType').txt(this.input.release.type);
		release.ele('ReleaseId').ele('ICPN').txt(this.input.release.upc);

		// Title
		const displayTitle = this.input.release.version
			? `${this.input.release.title} (${this.input.release.version})`
			: this.input.release.title;
		release.ele('DisplayTitleText').txt(displayTitle);
		const dt = release.ele('DisplayTitle', {
			ApplicableTerritoryCode: 'Worldwide',
			IsDefault: 'true',
		});
		dt.ele('TitleText').txt(this.input.release.title);
		if (this.input.release.version) {
			dt.ele('SubTitle').txt(this.input.release.version);
		}

		// Display artist
		const artistName = this.input.release.artists
			.map((a) => a.name)
			.join(', ');
		release
			.ele('DisplayArtistName', {
				ApplicableTerritoryCode: 'Worldwide',
				IsDefault: 'true',
			})
			.txt(artistName);

		for (let i = 0; i < this.input.release.artists.length; i++) {
			const da = release.ele('DisplayArtist', {
				SequenceNumber: String(i + 1),
			});
			da.ele('ArtistPartyReference').txt(
				this.getPartyRef(this.input.release.artists[i].name),
			);
			da.ele('DisplayArtistRole').txt(this.input.release.artists[i].role);
		}

		// Label
		release
			.ele('ReleaseLabelReference', {
				ApplicableTerritoryCode: 'Worldwide',
			})
			.txt(this.getPartyRef(this.input.release.labelName));

		// PLine / CLine
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

		// Genre
		const genre = release.ele('Genre', {
			ApplicableTerritoryCode: 'Worldwide',
		});
		genre.ele('GenreText').txt(this.input.release.genre);
		if (this.input.release.subGenre) {
			genre.ele('SubGenre').txt(this.input.release.subGenre);
		}

		// Release date
		release.ele('OriginalReleaseDate').txt(this.input.release.releaseDate);

		// Visibility reference
		release.ele('ReleaseVisibilityReference').txt('V0');

		// Parental warning
		release
			.ele('ParentalWarningType')
			.txt(this.input.release.parentalWarning || 'NotExplicit');

		// ResourceGroup
		const rg = release.ele('ResourceGroup');
		rg.ele('SequenceNumber').txt('1');

		for (let i = 0; i < this.input.tracks.length; i++) {
			const item = rg.ele('ResourceGroupContentItem');
			item.ele('SequenceNumber').txt(String(i + 1));
			item.ele('ReleaseResourceReference').txt(`A${i + 1}`);
		}

		// Linked cover art
		if (this.input.release.coverArt) {
			rg.ele('LinkedReleaseResourceReference').txt(
				`A${this.input.tracks.length + 1}`,
			);
		}
	}

	private buildTrackRelease(
		parent: ReturnType<typeof create>,
		index: number,
	): void {
		const ref = `R${index + 1}`;
		const resourceRef = `A${index + 1}`;

		const tr = parent.ele('TrackRelease');
		tr.ele('ReleaseReference').txt(ref);
		tr.ele('ReleaseId')
			.ele('ProprietaryId', {
				Namespace: this.input.message.recipient.partyId,
			})
			.txt(`${this.input.release.upc}_${ref}`);
		tr.ele('ReleaseResourceReference').txt(resourceRef);
		tr.ele('ReleaseLabelReference', {
			ApplicableTerritoryCode: 'Worldwide',
		}).txt(this.getPartyRef(this.input.release.labelName));

		// Genre
		const track = this.input.tracks[index];
		const genre = tr.ele('Genre', {
			ApplicableTerritoryCode: 'Worldwide',
		});
		genre.ele('GenreText').txt(track.genre || this.input.release.genre);
		if (track.subGenre || this.input.release.subGenre) {
			genre
				.ele('SubGenre')
				.txt(track.subGenre || this.input.release.subGenre!);
		}

		// Visibility reference
		tr.ele('ReleaseVisibilityReference').txt(`V${index + 1}`);
	}

	// ==================== DealList ====================

	private buildDealList(root: ReturnType<typeof create>): void {
		const dealList = root.ele('DealList');

		if (this.input.deals && this.input.deals.length > 0) {
			this.buildExplicitDeals(dealList);
		} else {
			this.buildDefaultDeals(dealList);
		}

		// Release visibility
		this.buildVisibility(dealList);
	}

	private buildExplicitDeals(dealList: ReturnType<typeof create>): void {
		// Apply each deal to each track release
		for (let i = 0; i < this.input.tracks.length; i++) {
			const releaseRef = `R${i + 1}`;
			const techRef = `T${i + 1}S`;

			for (const deal of this.input.deals!) {
				const rd = dealList.ele('ReleaseDeal');
				rd.ele('DealReleaseReference').txt(releaseRef);
				const d = rd.ele('Deal');
				const terms = d.ele('DealTerms');

				for (const t of deal.territories) {
					terms.ele('TerritoryCode').txt(t);
				}

				const validity = terms.ele('ValidityPeriod');
				validity.ele('StartDateTime').txt(`${deal.startDate}T00:00:00`);
				if (deal.endDate) {
					validity.ele('EndDateTime').txt(`${deal.endDate}T00:00:00`);
				}

				for (const cm of deal.commercialModels) {
					terms.ele('CommercialModelType').txt(cm);
				}
				for (const ut of deal.useTypes) {
					terms.ele('UseType').txt(ut);
				}

				this.appendPrices(terms, deal);

				d.ele('DealTechnicalResourceDetailsReferenceList')
					.ele('DealTechnicalResourceDetailsReference')
					.txt(techRef);
			}
		}
	}

	private buildDefaultDeals(dealList: ReturnType<typeof create>): void {
		const territories = this.input.release.territories || ['Worldwide'];
		const startDate = `${this.input.release.releaseDate}T00:00:00`;

		for (let i = 0; i < this.input.tracks.length; i++) {
			const releaseRef = `R${i + 1}`;
			const techRef = `T${i + 1}S`;

			const rd = dealList.ele('ReleaseDeal');
			rd.ele('DealReleaseReference').txt(releaseRef);
			const d = rd.ele('Deal');
			const terms = d.ele('DealTerms');

			for (const t of territories) {
				terms.ele('TerritoryCode').txt(t);
			}

			terms.ele('ValidityPeriod').ele('StartDateTime').txt(startDate);
			terms.ele('CommercialModelType').txt('SubscriptionModel');
			terms.ele('CommercialModelType').txt('AdvertisementSupportedModel');
			terms.ele('UseType').txt('ConditionalDownload');
			terms.ele('UseType').txt('Stream');

			d.ele('DealTechnicalResourceDetailsReferenceList')
				.ele('DealTechnicalResourceDetailsReference')
				.txt(techRef);
		}
	}

	private buildVisibility(dealList: ReturnType<typeof create>): void {
		const territories = this.input.release.territories || ['Worldwide'];
		const startDate = `${this.input.release.releaseDate}T00:00:00`;

		// Main release visibility (V0)
		const v0 = dealList.ele('ReleaseVisibility');
		v0.ele('VisibilityReference').txt('V0');
		for (const t of territories) {
			v0.ele('TerritoryCode').txt(t);
		}
		v0.ele('ReleaseDisplayStartDateTime').txt(startDate);
		v0.ele('CoverArtPreviewStartDateTime').txt(startDate);
		v0.ele('FullTrackListingPreviewStartDateTime').txt(startDate);

		// Track visibilities (V1, V2, ...)
		for (let i = 0; i < this.input.tracks.length; i++) {
			const v = dealList.ele('TrackReleaseVisibility');
			v.ele('VisibilityReference').txt(`V${i + 1}`);
			for (const t of territories) {
				v.ele('TerritoryCode').txt(t);
			}
			v.ele('TrackListingPreviewStartDateTime').txt(startDate);
		}
	}

	// ==================== Helpers ====================

	private normalizeDuration(duration: string | number): string {
		if (typeof duration === 'number') {
			const hours = Math.floor(duration / 3600);
			const minutes = Math.floor((duration % 3600) / 60);
			const seconds = Math.floor(duration % 60);
			return `PT${hours}H${minutes}M${seconds}S`;
		}
		return duration;
	}

	private appendPrices(
		terms: ReturnType<typeof create>,
		deal: ErnDealInput,
	): void {
		if (!deal.prices?.length) return;

		for (const price of deal.prices) {
			const priceInfo = terms.ele('PriceInformation');

			if (price.territories?.length) {
				for (const territory of price.territories) {
					priceInfo.ele('TerritoryCode').txt(territory);
				}
			}

			priceInfo
				.ele('PriceType', {
					Namespace: price.priceTypeNamespace || 'DPID',
				})
				.txt(price.priceType);

			priceInfo
				.ele('Price', {
					CurrencyCode: price.currencyCode,
				})
				.txt(this.normalizePriceValue(price.value));
		}
	}

	private normalizePriceValue(value: number | string): string {
		if (typeof value === 'number') return String(value);

		const normalized = String(value).trim().replace(',', '.');
		return normalized;
	}
}
