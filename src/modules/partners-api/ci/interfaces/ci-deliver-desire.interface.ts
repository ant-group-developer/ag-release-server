export interface CiOrganisation {
	type: string;
	name: string;
	DPID: string;
	merlin_member_id: string | null;
	id: number;
	modify_time: string;
	organisation_id: string;
}

export interface CiExportRequest {
	type: string;
	name: string;
	asset_type: string;
	completion_date: string | null;
	identifier: string;
	notes: string | null;
	number_of_tracks: number;
	status: string;
	export_external_id: string;
	number_of_services: number;
	task: string;
	total_tracks: number;
	organisation: CiOrganisation;
	id: number;
	modify_time: string;
	export_id: string;
}

export interface CiReleaseFormat {
	type: string;
	additional_identifier: string;
	barcode: string;
	catalog_no: string;
	explicit_content: string;
	gtin: string;
	identifier: string;
	meta_modify_time: string;
	released: string;
	status: string;
	title: string;
	weight: string | null;
	version_description: string;
	grid: string;
	track_count: number;
	format_type: string;
	qa_flags_run: string;
	volume_part: number;
	volume_total_parts: number;
	c_copy: string;
	p_copy: string;
	price_band: string;
	GTIN: string;
	sound_carrier_id: string;
	id: number;
	modify_time: string;
	release_format_id: string;
	display_artist: string;
	asset_controller_id: string;
	asset_owner_id: string;
	release_start_date: string;
}

export interface CiMusicService {
	type: string;
	name: string;
	dpc: string;
	development_status: string;
	id: number;
	modify_time: string;
	DPID: string;
}

export interface CiDeliverDesire {
	type: string;
	status: string;
	exportRequest: CiExportRequest;
	releaseFormat: CiReleaseFormat;
	exportBatch: { batch_transfer_status: string; [key: string]: any } | null;
	musicService: CiMusicService;
	deliver_desire_id: string;
	status_cause: string;
	id: number;
	create_time: string;
	modify_time: string;
	_links: {
		self: { href: string };
		export: { href: string };
	};
}

export interface CiDeliverDesireResponse {
	page: number;
	pageSize: number;
	total: string;
	organisation_id: number;
	type: string;
	queryParams: Record<string, any>;
	export_id: string;
	_embedded: CiDeliverDesire[];
	_links: {
		self: { href: string };
		first: { href: string };
		last: { href: string };
	};
}
