export interface CiExportCreator {
	type: string;
	name: string;
	email: string;
	identifier: string;
	id: number;
	modify_time: string;
	user_id: string;
}

export interface CiExportItem {
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
	creator: CiExportCreator;
	export_id: string;
	id: number;
	create_time: string;
	modify_time: string;
	_links: {
		self: { href: string };
		batch: { href: string };
		deliver_desire: { href: string };
	};
}

export interface CiExportListResponse {
	page: number;
	pageSize: number;
	total: number;
	organisation_id: number;
	type: string;
	queryParams: Record<string, any>;
	_embedded: CiExportItem[];
	_links: {
		self: { href: string };
		first: { href: string };
		last: { href: string };
	};
}
