import {
	DDEXContributor,
	DDEXCopyrightLine,
	DDEXData,
	DDEXDeal,
	DDEXDisplayArtist,
	DDEXMessageHeader,
	DDEXParty,
	DDEXRelease,
	DDEXResource,
	DDEXTechnicalDetails,
} from '../interfaces/ddex-input.interface';
import {
	element,
	escapeXml,
	formatDateTime,
	indent,
	xmlDeclaration,
} from '../utils/xml.utils';

/**
 * ERN 4.3 Generator for Spotify
 * Generates NewReleaseMessage XML according to ERN 4.3 specification
 */
export class ERN43Generator {
	private readonly namespace = 'http://ddex.net/xml/ern/43';
	private readonly schemaLocation =
		'http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd';

	/**
	 * Generate complete DDEX ERN 4.3 XML
	 */
	generate(data: DDEXData): string {
		const parts: string[] = [
			xmlDeclaration(),
			this.openRootElement(),
			indent(this.buildMessageHeader(data.messageHeader)),
			indent(this.buildPartyList(data.parties)),
			indent(this.buildResourceList(data.resources)),
			indent(this.buildReleaseList(data.releases, data.resources)),
			indent(this.buildDealList(data.deals, data.releases)),
			this.closeRootElement(),
		];

		return parts.join('\n');
	}

	private openRootElement(): string {
		return `<ern:NewReleaseMessage xmlns:ern="${this.namespace}"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${this.schemaLocation}" ReleaseProfileVersionId="Audio" LanguageAndScriptCode="en" AvsVersionId="3">`;
	}

	private closeRootElement(): string {
		return '</ern:NewReleaseMessage>';
	}

	// ==================== Message Header ====================
	private buildMessageHeader(header: DDEXMessageHeader): string {
		const lines: string[] = [
			'<MessageHeader>',
			`    ${element('MessageThreadId', header.messageThreadId || 'Baseline')}`,
			`    ${element('MessageId', header.messageId)}`,
			`    <MessageSender>`,
			`        ${element('PartyId', header.sender.partyId)}`,
			`        <PartyName>`,
			`            ${element('FullName', header.sender.partyName)}`,
			`        </PartyName>`,
			`    </MessageSender>`,
			`    <MessageRecipient>`,
			`        ${element('PartyId', header.recipient.partyId)}`,
			`        <PartyName>`,
			`            ${element('FullName', header.recipient.partyName)}`,
			`        </PartyName>`,
			`    </MessageRecipient>`,
			`    ${element('MessageCreatedDateTime', header.createdDateTime || formatDateTime())}`,
			'</MessageHeader>',
		];
		return lines.join('\n');
	}

	// ==================== Party List ====================
	private buildPartyList(parties: DDEXParty[]): string {
		const partyElements = parties.map((party) => this.buildParty(party));
		return `<PartyList>\n${indent(partyElements.join('\n'))}\n</PartyList>`;
	}

	private buildParty(party: DDEXParty): string {
		const lines: string[] = [
			'<Party>',
			`    ${element('PartyReference', party.reference)}`,
			`    <PartyName>`,
			`        ${element('FullName', party.name)}`,
			`    </PartyName>`,
		];

		if (party.partyId) {
			lines.push(`    <PartyId>`);
			lines.push(
				`        <ProprietaryId Namespace="${escapeXml(party.partyId.namespace)}">${escapeXml(party.partyId.value)}</ProprietaryId>`,
			);
			lines.push(`    </PartyId>`);
		}

		lines.push('</Party>');
		return lines.join('\n');
	}

	// ==================== Resource List ====================
	private buildResourceList(resources: DDEXResource[]): string {
		const resourceElements = resources.map((res) =>
			res.type === 'SoundRecording'
				? this.buildSoundRecording(res)
				: this.buildImage(res),
		);
		return `<ResourceList>\n${indent(resourceElements.join('\n'))}\n</ResourceList>`;
	}

	private buildSoundRecording(resource: DDEXResource): string {
		const lines: string[] = [
			'<SoundRecording>',
			`    ${element('ResourceReference', resource.reference)}`,
			`    ${element('Type', 'MusicalWorkSoundRecording')}`,
			`    <SoundRecordingEdition>`,
			`        ${element('Type', 'NonImmersiveEdition')}`,
		];

		// Resource ID (ISRC)
		if (resource.isrc) {
			lines.push(`        <ResourceId>`);
			lines.push(`            ${element('ISRC', resource.isrc)}`);
			lines.push(`        </ResourceId>`);
		}

		// P-Line
		if (resource.pLine) {
			lines.push(this.buildCopyrightLine('PLine', resource.pLine, 8));
		}

		// Recording Mode
		lines.push(`        ${element('RecordingMode', 'Stereo')}`);

		// Technical Details
		if (resource.technicalDetails) {
			lines.push(
				this.buildTechnicalDetails(resource.technicalDetails, 8),
			);
		}

		lines.push(`    </SoundRecordingEdition>`);

		// Title
		if (resource.title) {
			lines.push(`    ${element('DisplayTitleText', resource.title)}`);
			lines.push(
				`    <DisplayTitle ApplicableTerritoryCode="Worldwide" IsDefault="true">`,
			);
			lines.push(`        ${element('TitleText', resource.title)}`);
			lines.push(`    </DisplayTitle>`);
		}

		// Display Artist Name
		if (resource.displayArtistName) {
			lines.push(
				`    <DisplayArtistName ApplicableTerritoryCode="Worldwide" IsDefault="true">${escapeXml(resource.displayArtistName)}</DisplayArtistName>`,
			);
		}

		// Display Artists
		if (resource.displayArtists) {
			for (const artist of resource.displayArtists) {
				lines.push(this.buildDisplayArtist(artist, 4));
			}
		}

		// Contributors
		if (resource.contributors) {
			for (const contributor of resource.contributors) {
				lines.push(this.buildContributor(contributor, 4));
			}
		}

		// Duration
		if (resource.duration) {
			lines.push(`    ${element('Duration', resource.duration)}`);
		}

		// Parental Warning
		lines.push(
			`    ${element('ParentalWarningType', resource.parentalWarningType || 'NotExplicit')}`,
		);

		lines.push('</SoundRecording>');
		return lines.join('\n');
	}

	private buildImage(resource: DDEXResource): string {
		const lines: string[] = [
			'<Image>',
			`    ${element('ResourceReference', resource.reference)}`,
			`    ${element('Type', resource.imageType || 'FrontCoverImage')}`,
		];

		// Resource ID (Proprietary for images)
		if (resource.technicalDetails) {
			lines.push(`    <ResourceId>`);
			lines.push(
				`        <ProprietaryId Namespace="PADPIDA20250804056">front-cover-image:${resource.reference}</ProprietaryId>`,
			);
			lines.push(`    </ResourceId>`);
		}

		// C-Line
		if (resource.cLine) {
			lines.push(this.buildCopyrightLine('CLine', resource.cLine, 4));
		}

		// Parental Warning
		lines.push(
			`    ${element('ParentalWarningType', resource.parentalWarningType || 'NotExplicit')}`,
		);

		// Technical Details
		if (resource.technicalDetails) {
			lines.push(`    <TechnicalDetails>`);
			lines.push(
				`        ${element('TechnicalResourceDetailsReference', resource.technicalDetails.reference)}`,
			);
			lines.push(`        <File>`);
			lines.push(
				`            ${element('URI', resource.technicalDetails.fileUri)}`,
			);
			lines.push(`        </File>`);
			lines.push(`    </TechnicalDetails>`);
		}

		lines.push('</Image>');
		return lines.join('\n');
	}

	private buildTechnicalDetails(
		details: DDEXTechnicalDetails,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		const lines: string[] = [
			`${pad}<TechnicalDetails>`,
			`${pad}    ${element('TechnicalResourceDetailsReference', details.reference)}`,
			`${pad}    <DeliveryFile>`,
			`${pad}        ${element('Type', 'AudioFile')}`,
			`${pad}        <File>`,
			`${pad}            ${element('URI', details.fileUri)}`,
			`${pad}        </File>`,
			`${pad}        ${element('IsProvidedInDelivery', details.isProvidedInDelivery !== false ? 'true' : 'false')}`,
			`${pad}    </DeliveryFile>`,
			`${pad}</TechnicalDetails>`,
		];
		return lines.join('\n');
	}

	private buildCopyrightLine(
		type: 'PLine' | 'CLine',
		line: DDEXCopyrightLine,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		return [
			`${pad}<${type}>`,
			`${pad}    ${element('Year', line.year.toString())}`,
			`${pad}    ${element(`${type}Text`, line.text)}`,
			`${pad}</${type}>`,
		].join('\n');
	}

	private buildDisplayArtist(
		artist: DDEXDisplayArtist,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		return [
			`${pad}<DisplayArtist SequenceNumber="${artist.sequenceNumber}">`,
			`${pad}    ${element('ArtistPartyReference', artist.partyRef)}`,
			`${pad}    ${element('DisplayArtistRole', artist.role)}`,
			`${pad}</DisplayArtist>`,
		].join('\n');
	}

	private buildContributor(
		contributor: DDEXContributor,
		indentLevel: number,
	): string {
		const pad = ' '.repeat(indentLevel);
		return [
			`${pad}<Contributor SequenceNumber="${contributor.sequenceNumber}">`,
			`${pad}    ${element('ContributorPartyReference', contributor.partyRef)}`,
			`${pad}    ${element('Role', contributor.role)}`,
			`${pad}</Contributor>`,
		].join('\n');
	}

	// ==================== Release List ====================
	private buildReleaseList(
		releases: DDEXRelease[],
		resources: DDEXResource[],
	): string {
		const releaseElements: string[] = [];

		// Main release (R0)
		const mainRelease = releases.find((r) => r.reference === 'R0');
		if (mainRelease) {
			releaseElements.push(this.buildMainRelease(mainRelease, resources));
		}

		// Track releases (R1, R2, ...)
		const trackReleases = releases.filter((r) => r.reference !== 'R0');
		// Build track releases from resources
		const soundRecordings = resources.filter(
			(r) => r.type === 'SoundRecording',
		);
		for (let i = 0; i < soundRecordings.length; i++) {
			releaseElements.push(
				this.buildTrackRelease(
					`R${i + 1}`,
					soundRecordings[i],
					mainRelease!,
					i + 1,
				),
			);
		}

		return `<ReleaseList>\n${indent(releaseElements.join('\n'))}\n</ReleaseList>`;
	}

	private buildMainRelease(
		release: DDEXRelease,
		resources: DDEXResource[],
	): string {
		const lines: string[] = [
			'<Release>',
			`    ${element('ReleaseReference', release.reference)}`,
			`    ${element('ReleaseType', release.type)}`,
			`    <ReleaseId>`,
			`        ${element('ICPN', release.icpn)}`,
			`    </ReleaseId>`,
			`    ${element('DisplayTitleText', release.title)}`,
			`    <DisplayTitle ApplicableTerritoryCode="Worldwide" IsDefault="true">`,
			`        ${element('TitleText', release.title)}`,
			`    </DisplayTitle>`,
			`    <DisplayArtistName ApplicableTerritoryCode="Worldwide" IsDefault="true">${escapeXml(release.displayArtistName)}</DisplayArtistName>`,
		];

		// Display Artists
		for (const artist of release.displayArtists) {
			lines.push(this.buildDisplayArtist(artist, 4));
		}

		// Label Reference
		lines.push(
			`    <ReleaseLabelReference ApplicableTerritoryCode="Worldwide">${escapeXml(release.labelRef)}</ReleaseLabelReference>`,
		);

		// P-Line and C-Line
		if (release.pLine) {
			lines.push(this.buildCopyrightLine('PLine', release.pLine, 4));
		}
		if (release.cLine) {
			lines.push(this.buildCopyrightLine('CLine', release.cLine, 4));
		}

		// Genre
		lines.push(`    <Genre ApplicableTerritoryCode="Worldwide">`);
		lines.push(`        ${element('GenreText', release.genre)}`);
		lines.push(`    </Genre>`);

		// Original Release Date
		lines.push(
			`    ${element('OriginalReleaseDate', release.releaseDate)}`,
		);

		// Visibility Reference
		lines.push(`    ${element('ReleaseVisibilityReference', 'V0')}`);

		// Parental Warning
		lines.push(
			`    ${element('ParentalWarningType', release.parentalWarningType || 'NotExplicit')}`,
		);

		// Resource Group
		lines.push(`    <ResourceGroup>`);
		lines.push(`        ${element('SequenceNumber', '1')}`);

		// Add sound recordings
		const soundRecordings = resources.filter(
			(r) => r.type === 'SoundRecording',
		);
		for (let i = 0; i < soundRecordings.length; i++) {
			lines.push(`        <ResourceGroupContentItem>`);
			lines.push(
				`            ${element('SequenceNumber', (i + 1).toString())}`,
			);
			lines.push(
				`            ${element('ReleaseResourceReference', soundRecordings[i].reference)}`,
			);
			lines.push(`        </ResourceGroupContentItem>`);
		}

		// Add cover art reference
		const coverArt = resources.find((r) => r.type === 'Image');
		if (coverArt) {
			lines.push(
				`        ${element('LinkedReleaseResourceReference', coverArt.reference)}`,
			);
		}

		lines.push(`    </ResourceGroup>`);
		lines.push('</Release>');

		return lines.join('\n');
	}

	private buildTrackRelease(
		reference: string,
		resource: DDEXResource,
		mainRelease: DDEXRelease,
		index: number,
	): string {
		const lines: string[] = [
			'<TrackRelease>',
			`    ${element('ReleaseReference', reference)}`,
			`    <ReleaseId>`,
			`        <ProprietaryId Namespace="PADPIDA20250804056">${mainRelease.icpn}_${reference}</ProprietaryId>`,
			`    </ReleaseId>`,
			`    ${element('ReleaseResourceReference', resource.reference)}`,
			`    <ReleaseLabelReference ApplicableTerritoryCode="Worldwide">${escapeXml(mainRelease.labelRef)}</ReleaseLabelReference>`,
			`    <Genre ApplicableTerritoryCode="Worldwide">`,
			`        ${element('GenreText', mainRelease.genre)}`,
			`    </Genre>`,
			`    ${element('ReleaseVisibilityReference', `V${index}`)}`,
			'</TrackRelease>',
		];
		return lines.join('\n');
	}

	// ==================== Deal List ====================
	private buildDealList(deals: DDEXDeal[], releases: DDEXRelease[]): string {
		const dealElements: string[] = [];

		// Build deals for each release
		for (const deal of deals) {
			dealElements.push(this.buildReleaseDeal(deal));
		}

		// Build visibility sections
		const mainRelease = releases.find((r) => r.reference === 'R0');
		if (mainRelease) {
			// Main release visibility
			dealElements.push(
				this.buildReleaseVisibility(
					'V0',
					deals[0]?.territories[0] || 'US',
					mainRelease.releaseDate,
				),
			);

			// Track release visibilities
			const trackCount = mainRelease.resourceRefs.length;
			for (let i = 1; i <= trackCount; i++) {
				dealElements.push(
					this.buildTrackReleaseVisibility(
						`V${i}`,
						deals[0]?.territories[0] || 'US',
						mainRelease.releaseDate,
					),
				);
			}
		}

		return `<DealList>\n${indent(dealElements.join('\n'))}\n</DealList>`;
	}

	private buildReleaseDeal(deal: DDEXDeal): string {
		const lines: string[] = [
			'<ReleaseDeal>',
			`    ${element('DealReleaseReference', deal.releaseRef)}`,
			`    <Deal>`,
			`        <DealTerms>`,
		];

		// Territories
		for (const territory of deal.territories) {
			lines.push(`            ${element('TerritoryCode', territory)}`);
		}

		// Validity Period
		lines.push(`            <ValidityPeriod>`);
		lines.push(
			`                ${element('StartDateTime', deal.validityStartDateTime)}`,
		);
		lines.push(`            </ValidityPeriod>`);

		// Commercial Model Types
		for (const model of deal.commercialModelTypes) {
			lines.push(`            ${element('CommercialModelType', model)}`);
		}

		// Use Types
		for (const useType of deal.useTypes) {
			lines.push(`            ${element('UseType', useType)}`);
		}

		lines.push(`        </DealTerms>`);

		// Technical Resource Reference (for track deals)
		if (deal.technicalResourceRef) {
			lines.push(`        <DealTechnicalResourceDetailsReferenceList>`);
			lines.push(
				`            ${element('DealTechnicalResourceDetailsReference', deal.technicalResourceRef)}`,
			);
			lines.push(`        </DealTechnicalResourceDetailsReferenceList>`);
		}

		lines.push(`    </Deal>`);
		lines.push('</ReleaseDeal>');

		return lines.join('\n');
	}

	private buildReleaseVisibility(
		reference: string,
		territory: string,
		releaseDate: string,
	): string {
		const dateTime = `${releaseDate}T00:00:00`;
		return [
			'<ReleaseVisibility>',
			`    ${element('VisibilityReference', reference)}`,
			`    ${element('TerritoryCode', territory)}`,
			`    ${element('ReleaseDisplayStartDateTime', dateTime)}`,
			`    ${element('CoverArtPreviewStartDateTime', dateTime)}`,
			`    ${element('FullTrackListingPreviewStartDateTime', dateTime)}`,
			'</ReleaseVisibility>',
		].join('\n');
	}

	private buildTrackReleaseVisibility(
		reference: string,
		territory: string,
		releaseDate: string,
	): string {
		const dateTime = `${releaseDate}T00:00:00`;
		return [
			'<TrackReleaseVisibility>',
			`    ${element('VisibilityReference', reference)}`,
			`    ${element('TerritoryCode', territory)}`,
			`    ${element('TrackListingPreviewStartDateTime', dateTime)}`,
			'</TrackReleaseVisibility>',
		].join('\n');
	}
}
