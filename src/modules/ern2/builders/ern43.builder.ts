import { create } from 'xmlbuilder2';
import {
	ErnArtistInput,
	ErnContributorInput,
	ErnDealInput2,
	ErnInput2,
	ErnTrackInput2,
	ErnVideoInput2,
	ErnSubtitleInput,
} from '../interfaces/ern-input.interface';

/**
 * Builds DDEX ERN 4.3 XML using xmlbuilder2.
 * Based on: samples/ern/43/external-audio-baseline-ern43.xml
 * Supports: Audio and Video single release distributions.
 *
 * Structure: MessageHeader → PartyList → ResourceList → ReleaseList → DealList
 */
export class Ern43Builder2 {
	private partyIndex = 0;
	private readonly partyMap = new Map<string, string>();

	constructor(private readonly input: ErnInput2) {}

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
			ReleaseProfileVersionId: this.input.release.type === 'video' || this.input.release.type === 'VideoSingle' ? 'Video' : 'Audio',
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
		// Video artists + contributors
		for (const v of this.input.videos ?? []) {
			for (const a of v.artists) this.addParty(a.name);
			if (v.contributors) {
				for (const c of v.contributors) this.addParty(c.name);
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
		for (const v of this.input.videos ?? []) {
			for (const a of v.artists) {
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

		// Videos
		const videoCount = this.input.videos?.length ?? 0;
		for (let i = 0; i < videoCount; i++) {
			this.buildVideoResource(resourceList, this.input.videos![i], i);
		}

		// Subtitles
		for (let i = 0; i < videoCount; i++) {
			const video = this.input.videos![i];
			if (video.subtitles) {
				for (let j = 0; j < video.subtitles.length; j++) {
					this.buildSubtitleResource(resourceList, video.subtitles[j], i, j);
				}
			}
		}

		// Cover art image
		if (this.input.release.coverArt) {
			this.buildImage(resourceList);
		}
	}

	private getTrackRef(index: number): string {
		return `A${index + 1}`;
	}

	private getVideoRef(index: number): string {
		const offset = this.input.tracks.length;
		return `A${offset + index + 1}`;
	}

	private getSubtitleRef(videoIndex: number, subIndex: number): string {
		const offset = this.input.tracks.length + (this.input.videos?.length ?? 0);
		let cumIndex = 0;
		for (let i = 0; i < videoIndex; i++) {
			cumIndex += this.input.videos![i].subtitles?.length ?? 0;
		}
		return `A${offset + cumIndex + subIndex + 1}`;
	}

	private getImageRef(): string {
		const offset = this.input.tracks.length + 
			(this.input.videos?.length ?? 0) + 
			this.getTotalSubtitleCount();
		return `A${offset + 1}`;
	}

	private getTotalSubtitleCount(): number {
		let count = 0;
		for (const v of this.input.videos ?? []) {
			count += v.subtitles?.length ?? 0;
		}
		return count;
	}

	private buildSoundRecording(
		parent: ReturnType<typeof create>,
		track: ErnTrackInput2,
		index: number,
	): void {
		const ref = this.getTrackRef(index);
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
			const uri = track.audioFile.filePath
				? `${track.audioFile.filePath}/${track.audioFile.fileName}`
				: track.audioFile.fileName;
			file.ele('URI').txt(uri);
			if (track.audioFile.hashSum) {
				const hash = file.ele('HashSum');
				hash.ele('HashSum').txt(track.audioFile.hashSum);
				hash.ele('HashSumAlgorithmType').txt(
					track.audioFile.hashAlgorithm || 'MD5',
				);
			}
		} else {
			const defaultPath = this.input.release.coverArt?.filePath
				? `${this.input.release.coverArt.filePath}/`
				: '';
			deliveryFile
				.ele('File')
				.ele('URI')
				.txt(`${defaultPath}${track.isrc}_${techRef}.wav`);
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

	private buildVideoResource(
		parent: ReturnType<typeof create>,
		video: ErnVideoInput2,
		index: number,
	): void {
		const ref = this.getVideoRef(index);
		const techRef = `T${this.input.tracks.length + index + 1}V`;

		const vNode = parent.ele('Video');
		vNode.ele('ResourceReference').txt(ref);
		vNode.ele('Type').txt('ShortFormMusicalWorkVideo');

		const edition = vNode.ele('VideoEdition');
		edition.ele('Type').txt('NonImmersiveEdition');

		const resId = edition.ele('ResourceId');
		resId.ele('ISRC').txt(video.isrc);
		if (video.isUnlisted) {
			resId.ele('ProprietaryId', { Namespace: 'VEVO:YouTubeUnlisted' }).txt('true');
		}

		// PLine
		const pLine = video.pLine || this.input.release.pLine;
		if (pLine) {
			const pl = edition.ele('PLine');
			pl.ele('Year').txt(String(pLine.year));
			pl.ele('PLineText').txt(pLine.text);
		}

		// Technical details
		const techDetails = edition.ele('TechnicalDetails');
		techDetails.ele('TechnicalResourceDetailsReference').txt(techRef);
		const deliveryFile = techDetails.ele('DeliveryFile');
		deliveryFile.ele('Type').txt('VideoFile');

		if (video.videoFile) {
			const file = deliveryFile.ele('File');
			const uri = video.videoFile.filePath
				? `${video.videoFile.filePath}/${video.videoFile.fileName}`
				: video.videoFile.fileName;
			file.ele('URI').txt(uri);
			if (video.videoFile.hashSum) {
				const hash = file.ele('HashSum');
				hash.ele('HashSum').txt(video.videoFile.hashSum);
				hash.ele('HashSumAlgorithmType').txt(
					video.videoFile.hashAlgorithm || 'MD5',
				);
			}
		} else {
			const defaultPath = this.input.release.coverArt?.filePath
				? `${this.input.release.coverArt.filePath}/`
				: '';
			deliveryFile
				.ele('File')
				.ele('URI')
				.txt(`${defaultPath}${video.isrc}_${techRef}.mp4`);
		}
		deliveryFile.ele('IsProvidedInDelivery').txt('true');

		// Title
		const displayTitle = video.version
			? `${video.title} (${video.version})`
			: video.title;
		vNode.ele('DisplayTitleText').txt(displayTitle);

		const dt = vNode.ele('DisplayTitle', {
			ApplicableTerritoryCode: 'Worldwide',
			IsDefault: 'true',
		});
		dt.ele('TitleText').txt(video.title);
		if (video.version) dt.ele('SubTitle').txt(video.version);

		// Display artist name
		const artistName = video.artists.map((a) => a.name).join(', ');
		vNode.ele('DisplayArtistName', {
			ApplicableTerritoryCode: 'Worldwide',
			IsDefault: 'true',
		}).txt(artistName);

		// Display artists
		for (let i = 0; i < video.artists.length; i++) {
			const da = vNode.ele('DisplayArtist', {
				SequenceNumber: String(i + 1),
			});
			da.ele('ArtistPartyReference').txt(
				this.getPartyRef(video.artists[i].name),
			);
			da.ele('DisplayArtistRole').txt(video.artists[i].role);
		}

		// Contributors
		if (video.contributors) {
			for (let i = 0; i < video.contributors.length; i++) {
				this.buildContributor(vNode, video.contributors[i], i + 1);
			}
		}

		vNode.ele('Duration').txt(this.normalizeDuration(video.duration));

		vNode.ele('ParentalWarningType').txt(
			video.parentalWarning ||
				this.input.release.parentalWarning ||
				'NotExplicit',
		);
	}

	private buildSubtitleResource(
		parent: ReturnType<typeof create>,
		sub: ErnSubtitleInput,
		videoIndex: number,
		subIndex: number,
	): void {
		const ref = this.getSubtitleRef(videoIndex, subIndex);
		const techRef = `T${this.input.tracks.length + (this.input.videos?.length ?? 0) + subIndex + 1}S`;

		const textNode = parent.ele('Text');
		textNode.ele('ResourceReference').txt(ref);
		textNode.ele('Type').txt('Caption');

		const techDetails = textNode.ele('TechnicalDetails');
		textNode.ele('TechnicalResourceDetailsReference').txt(techRef);
		techDetails.ele('TextCodecType').txt('SRT');

		const file = techDetails.ele('File');
		const uri = sub.filePath
			? `${sub.filePath}/${sub.fileName}`
			: sub.fileName;
		file.ele('URI').txt(uri);

		textNode.ele('LanguageOfText').txt(sub.language);
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
		const ref = this.getImageRef();
		const techRef = `T${this.input.tracks.length + (this.input.videos?.length ?? 0) + this.getTotalSubtitleCount() + 1}`;

		const image = parent.ele('Image');
		image.ele('ResourceReference').txt(ref);
		image.ele('Type').txt(this.input.release.type === 'video' || this.input.release.type === 'VideoSingle' ? 'VideoScreenCapture' : 'FrontCoverImage');

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

		const uri = coverArt.filePath
			? `${coverArt.filePath}/${coverArt.fileName}`
			: coverArt.fileName;
		file.ele('URI').txt(uri);
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

		// Video track releases (R_V1, R_V2, ...)
		const videoCount = this.input.videos?.length ?? 0;
		for (let i = 0; i < videoCount; i++) {
			this.buildVideoTrackRelease(releaseList, i);
		}
	}

	private buildMainRelease(parent: ReturnType<typeof create>): void {
		const release = parent.ele('Release');
		release.ele('ReleaseReference').txt('R0');
		release.ele('ReleaseType').txt(this.input.release.type === 'video' || this.input.release.type === 'VideoSingle' ? 'VideoSingle' : this.input.release.type);
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

		const refList = release.ele('ReleaseResourceReferenceList');
		
		// Cover art image reference link
		if (this.input.release.coverArt) {
			refList
				.ele('ReleaseResourceReference', { ReleaseResourceType: 'SecondaryResource' })
				.txt(this.getImageRef());
		}

		// Sound recordings
		for (let i = 0; i < this.input.tracks.length; i++) {
			refList.ele('ReleaseResourceReference', { ReleaseResourceType: 'PrimaryResource' }).txt(this.getTrackRef(i));
			
			const item = rg.ele('ResourceGroupContentItem');
			item.ele('SequenceNumber').txt(String(i + 1));
			item.ele('ReleaseResourceReference').txt(this.getTrackRef(i));
		}

		// Videos
		const videoCount = this.input.videos?.length ?? 0;
		for (let i = 0; i < videoCount; i++) {
			refList.ele('ReleaseResourceReference', { ReleaseResourceType: 'PrimaryResource' }).txt(this.getVideoRef(i));
			
			const item = rg.ele('ResourceGroupContentItem');
			item.ele('SequenceNumber').txt(String(this.input.tracks.length + i + 1));
			item.ele('ReleaseResourceReference').txt(this.getVideoRef(i));

			// Video screen capture image link
			if (this.input.release.coverArt) {
				item.ele('LinkedReleaseResourceReference', { LinkDescription: 'VideoScreenCapture' }).txt(this.getImageRef());
			}

			// Subtitle caption file link
			const video = this.input.videos![i];
			if (video.subtitles) {
				for (let j = 0; j < video.subtitles.length; j++) {
					item.ele('LinkedReleaseResourceReference', { LinkDescription: 'Caption' }).txt(this.getSubtitleRef(i, j));
				}
			}
		}

		// Subtitle references to main list
		for (let i = 0; i < videoCount; i++) {
			const video = this.input.videos![i];
			if (video.subtitles) {
				for (let j = 0; j < video.subtitles.length; j++) {
					refList.ele('ReleaseResourceReference', { ReleaseResourceType: 'SecondaryResource' }).txt(this.getSubtitleRef(i, j));
				}
			}
		}

		// Linked cover art for audio-only releases at root level
		if (this.input.release.coverArt && this.input.release.type !== 'video' && this.input.release.type !== 'VideoSingle') {
			rg.ele('LinkedReleaseResourceReference').txt(this.getImageRef());
		}

		// Total duration
		let totalSeconds = this.input.tracks.reduce(
			(sum, t) => sum + this.durationToSeconds(t.duration),
			0,
		);
		totalSeconds += (this.input.videos ?? []).reduce(
			(sum, v) => sum + this.durationToSeconds(v.duration),
			0,
		);
		release.ele('Duration').txt(this.secondsToIso(totalSeconds));
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

	private buildVideoTrackRelease(
		parent: ReturnType<typeof create>,
		index: number,
	): void {
		const video = this.input.videos![index];
		const ref = `R${this.input.tracks.length + index + 1}`;
		const resourceRef = this.getVideoRef(index);

		const tr = parent.ele('TrackRelease');
		tr.ele('ReleaseReference').txt(ref);
		
		const relId = tr.ele('ReleaseId');
		relId.ele('ProprietaryId', { Namespace: 'ISRC' }).txt(video.isrc);
		if (video.channel) {
			relId.ele('ProprietaryId', { Namespace: 'Channel' }).txt(video.channel);
		}

		tr.ele('ReleaseResourceReference').txt(resourceRef);
		tr.ele('ReleaseLabelReference', {
			ApplicableTerritoryCode: 'Worldwide',
		}).txt(this.getPartyRef(this.input.release.labelName));

		// Genre
		const genre = tr.ele('Genre', {
			ApplicableTerritoryCode: 'Worldwide',
		});
		genre.ele('GenreText').txt(video.genre || this.input.release.genre);
		if (video.subGenre || this.input.release.subGenre) {
			genre
				.ele('SubGenre')
				.txt(video.subGenre || this.input.release.subGenre!);
		}

		// Visibility reference
		tr.ele('ReleaseVisibilityReference').txt(`V${this.input.tracks.length + index + 1}`);
	}

	// ==================== DealList ====================

	private buildDealList(root: ReturnType<typeof create>): void {
		const dealList = root.ele('DealList');

		const hasDeals =
			this.input.deals &&
			((this.input.deals.release &&
				this.input.deals.release.length > 0) ||
				(this.input.deals.tracks &&
					this.input.deals.tracks.length > 0) ||
				(this.input.deals.videos &&
					this.input.deals.videos.length > 0));

		if (hasDeals) {
			this.buildExplicitDeals(dealList);
		} else {
			this.buildDefaultDeals(dealList);
		}

		// Release visibility
		this.buildVisibility(dealList);
	}

	private buildExplicitDeals(dealList: ReturnType<typeof create>): void {
		// Main release deal
		if (this.input.deals?.release && this.input.deals.release.length > 0) {
			const rd = dealList.ele('ReleaseDeal');
			rd.ele('DealReleaseReference').txt('R0');

			for (const deal of this.input.deals.release) {
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

				this.appendPrice(terms, deal);
			}
		}

		// Track release deals
		if (this.input.deals?.tracks && this.input.deals.tracks.length > 0) {
			for (let i = 0; i < this.input.tracks.length; i++) {
				const releaseRef = `R${i + 1}`;
				const techRef = `T${i + 1}S`;

				const rd = dealList.ele('ReleaseDeal');
				rd.ele('DealReleaseReference').txt(releaseRef);

				for (const deal of this.input.deals.tracks) {
					const d = rd.ele('Deal');
					const terms = d.ele('DealTerms');

					for (const t of deal.territories) {
						terms.ele('TerritoryCode').txt(t);
					}

					const validity = terms.ele('ValidityPeriod');
					validity
						.ele('StartDateTime')
						.txt(`${deal.startDate}T00:00:00`);
					if (deal.endDate) {
						validity
							.ele('EndDateTime')
							.txt(`${deal.endDate}T00:00:00`);
					}

					for (const cm of deal.commercialModels) {
						terms.ele('CommercialModelType').txt(cm);
					}
					for (const ut of deal.useTypes) {
						terms.ele('UseType').txt(ut);
					}

					this.appendPrice(terms, deal);

					d.ele('DealTechnicalResourceDetailsReferenceList')
						.ele('DealTechnicalResourceDetailsReference')
						.txt(techRef);
				}
			}
		}

		// Video release deals
		if (this.input.deals?.videos && this.input.deals.videos.length > 0) {
			const videoCount = this.input.videos?.length ?? 0;
			for (let i = 0; i < videoCount; i++) {
				const releaseRef = `R${this.input.tracks.length + i + 1}`;
				const techRef = `T${this.input.tracks.length + i + 1}V`;

				const rd = dealList.ele('ReleaseDeal');
				rd.ele('DealReleaseReference').txt(releaseRef);

				for (const deal of this.input.deals.videos) {
					const d = rd.ele('Deal');
					const terms = d.ele('DealTerms');

					for (const t of deal.territories) {
						terms.ele('TerritoryCode').txt(t);
					}

					const validity = terms.ele('ValidityPeriod');
					validity
						.ele('StartDateTime')
						.txt(`${deal.startDate}T00:00:00`);
					if (deal.endDate) {
						validity
							.ele('EndDateTime')
							.txt(`${deal.endDate}T00:00:00`);
					}

					for (const cm of deal.commercialModels) {
						terms.ele('CommercialModelType').txt(cm);
					}
					for (const ut of deal.useTypes) {
						terms.ele('UseType').txt(ut);
					}

					this.appendPrice(terms, deal);

					d.ele('DealTechnicalResourceDetailsReferenceList')
						.ele('DealTechnicalResourceDetailsReference')
						.txt(techRef);
				}
			}
		}
	}

	private buildDefaultDeals(dealList: ReturnType<typeof create>): void {
		const territories = this.input.release.territories || ['Worldwide'];
		const startDate = `${this.input.release.releaseDate}T00:00:00`;

		// Audio tracks default deals
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

		// Video default deals
		const videoCount = this.input.videos?.length ?? 0;
		for (let i = 0; i < videoCount; i++) {
			const releaseRef = `R${this.input.tracks.length + i + 1}`;
			const techRef = `T${this.input.tracks.length + i + 1}V`;

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

		// Video visibilities (V_V1, V_V2, ...)
		const videoCount = this.input.videos?.length ?? 0;
		for (let i = 0; i < videoCount; i++) {
			const v = dealList.ele('TrackReleaseVisibility');
			v.ele('VisibilityReference').txt(`V${this.input.tracks.length + i + 1}`);
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

	private durationToSeconds(duration: string | number): number {
		if (typeof duration === 'number') return duration;
		const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) return 0;
		const h = parseInt(match[1] || '0');
		const m = parseInt(match[2] || '0');
		const s = parseInt(match[3] || '0');
		return h * 3600 + m * 60 + s;
	}

	private secondsToIso(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `PT${String(h).padStart(2, '0')}H${String(m).padStart(2, '0')}M${String(s).padStart(2, '0')}S`;
	}

	private appendPrice(
		terms: ReturnType<typeof create>,
		deal: ErnDealInput2,
	): void {
		if (!deal.price) return;

		const amount = this.normalizePriceValue(deal.price.value);

		const priceInfo = terms.ele('PriceInformation', {
			PriceType: deal.price.priceType,
		});

		priceInfo
			.ele('SuggestedRetailPrice', {
				CurrencyCode: deal.price.currencyCode,
			})
			.txt(amount);
	}

	private normalizePriceValue(value: number | string): string {
		if (typeof value === 'number') return String(value);

		const normalized = String(value).trim().replace(',', '.');
		return normalized;
	}
}
