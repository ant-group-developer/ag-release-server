import { Metadata } from '@grpc/grpc-js';
import { IsNotEmpty } from 'class-validator';
import { Observable } from 'rxjs';

/* ===== REQUEST TYPES ===== */

export interface QueryUpcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	prefixUpcId?: string;
	status?: string;
	industry?: string;

	isVariable?: boolean;
	isPurchasable?: boolean;
	isAdded?: boolean;

	sortBy?: string;
	orderBy?: string;
}

/* ================= ENUMS ================= */

export enum UpcStatus {
	PRE_MARKET = 'PreMarket',
	IN_USE = 'In Use',
	ARCHIVED = 'Archived',
	RETRACTED = 'Retracted',
}

export enum UpcIndustry {
	GENERAL = 'General',
	CPG = 'CPG',
	REGULATED_HEALTHCARE = 'Regulated Healthcare',
	FOODSERVICE = 'Foodservice',
	APPAREL = 'Apparel',
}

export enum UpcYesNo {
	YES = 'Y',
	NO = 'N',
}

export enum UpcPackagingLevel {
	EACH = 'Each',
	INNER_PACK = 'Inner Pack',
	CASE_AS_EACH = 'Case as Each',
	MIXED_CASE = 'Mixed Case',
	CASE = 'Case',
	DISPLAY_SHIPPER = 'Display Shipper',
	PALLET = 'Pallet',
	MIXED_PALLET = 'Mixed Pallet',
}

/* ===== FULL LANGUAGE ENUM (theo danh sách m gửi) ===== */

export enum UpcLanguage {
	EN = 'en',
	AB = 'ab',
	AF = 'af',
	AK = 'ak',
	AM = 'am',
	AR = 'ar',
	AN = 'an',
	HY = 'hy',
	AS = 'as',
	AV = 'av',
	AE = 'ae',
	AY = 'ay',
	AZ = 'az',
	BA = 'ba',
	BM = 'bm',
	EU = 'eu',
	BE = 'be',
	BN = 'bn',
	BH = 'bh',
	BI = 'bi',
	BO = 'bo',
	BS = 'bs',
	BR = 'br',
	BG = 'bg',
	CA = 'ca',
	CH = 'ch',
	CE = 'ce',
	ZH = 'zh',
	CU = 'cu',
	CV = 'cv',
	KW = 'kw',
	CO = 'co',
	CR = 'cr',
	CY = 'cy',
	CS = 'cs',
	DA = 'da',
	DV = 'dv',
	DZ = 'dz',
	AA = 'aa',
	EO = 'eo',
	ET = 'et',
	EE = 'ee',
	FO = 'fo',
	FJ = 'fj',
	FI = 'fi',
	FR = 'fr',
	FY = 'fy',
	FF = 'ff',
	KA = 'ka',
	DE = 'de',
	GD = 'gd',
	GA = 'ga',
	GL = 'gl',
	GV = 'gv',
	EL = 'el',
	GN = 'gn',
	GU = 'gu',
	HT = 'ht',
	HA = 'ha',
	HE = 'he',
	HZ = 'hz',
	HI = 'hi',
	HO = 'ho',
	HR = 'hr',
	HU = 'hu',
	IG = 'ig',
	IS = 'is',
	IO = 'io',
	II = 'ii',
	IU = 'iu',
	IE = 'ie',
	IA = 'ia',
	ID = 'id',
	IK = 'ik',
	IT = 'it',
	JV = 'jv',
	JA = 'ja',
	KL = 'kl',
	KN = 'kn',
	KS = 'ks',
	KR = 'kr',
	KK = 'kk',
	KM = 'km',
	KI = 'ki',
	RW = 'rw',
	KY = 'ky',
	KV = 'kv',
	KG = 'kg',
	KO = 'ko',
	KJ = 'kj',
	KU = 'ku',
	LO = 'lo',
	LA = 'la',
	LV = 'lv',
	LI = 'li',
	LN = 'ln',
	LT = 'lt',
	LB = 'lb',
	LU = 'lu',
	LG = 'lg',
	MK = 'mk',
	MH = 'mh',
	ML = 'ml',
	MI = 'mi',
	MR = 'mr',
	MG = 'mg',
	MT = 'mt',
	MN = 'mn',
	MS = 'ms',
	MY = 'my',
	NA = 'na',
	NV = 'nv',
	NR = 'nr',
	ND = 'nd',
	NG = 'ng',
	NE = 'ne',
	NL = 'nl',
	NN = 'nn',
	NB = 'nb',
	NO = 'no',
	NY = 'ny',
	OC = 'oc',
	OJ = 'oj',
	OR = 'or',
	OM = 'om',
	OS = 'os',
	PA = 'pa',
	FA = 'fa',
	PI = 'pi',
	PL = 'pl',
	PT = 'pt',
	PS = 'ps',
	QU = 'qu',
	RM = 'rm',
	RO = 'ro',
	RN = 'rn',
	RU = 'ru',
	SG = 'sg',
	SA = 'sa',
	SI = 'si',
	SL = 'sl',
	SE = 'se',
	SM = 'sm',
	SN = 'sn',
	SD = 'sd',
	SO = 'so',
	ST = 'st',
	ES = 'es',
	SQ = 'sq',
	SC = 'sc',
	SR = 'sr',
	SS = 'ss',
	SU = 'su',
	SW = 'sw',
	SV = 'sv',
	TY = 'ty',
	TA = 'ta',
	TT = 'tt',
	TE = 'te',
	TG = 'tg',
	TL = 'tl',
	TH = 'th',
	TI = 'ti',
	TO = 'to',
	TN = 'tn',
	TS = 'ts',
	TK = 'tk',
	TR = 'tr',
	TW = 'tw',
	UG = 'ug',
	UK = 'uk',
	UR = 'ur',
	UZ = 'uz',
	VE = 've',
	VI = 'vi',
	VO = 'vo',
	WA = 'wa',
	WO = 'wo',
	XH = 'xh',
	YI = 'yi',
	YO = 'yo',
	ZA = 'za',
	ZU = 'zu',
	SK = 'sk',
}

export interface CreateUpc {
	/** ID Prefix UPC */
	prefixUpcId: string;

	/** Cấp độ đóng gói */
	packagingLevel: UpcPackagingLevel;

	/** Mô tả sản phẩm */
	description: string;

	/** Ngôn ngữ của mô tả */
	desc1Language: UpcLanguage;

	/** Tên thương hiệu */
	brandName: string;

	/** Ngôn ngữ của thương hiệu */
	brand1Language: UpcLanguage;

	/** Trạng thái UPC */
	status: UpcStatus;

	/** Ngành hàng */
	industry: UpcIndustry;

	/** Có phải mã biến đổi (Y/N) */
	isVariable: UpcYesNo;

	/** Có thể bán thương mại (Y/N) */
	isPurchasable: UpcYesNo;

	/** Có phải bản bổ sung (Y/N) */
	isAdded: UpcYesNo;

	/** Danh sách thị trường mục tiêu (VN, US, JP...) */
	targetMarkets: string[];
}

export interface CreateUpcRequest extends CreateUpc {}

/* ===== RESPONSE TYPES ===== */

export interface UpcItem {
	id: string;
	prefixUpcId: string;
	gs1CompanyPrefix: string;
	gtin: string;
	packagingLevel: string;
	description: string;
	desc1Language: string;
	brandName: string;
	brand1Language: string;
	status: string;
	industry: string;
	isVariable: boolean;
	isPurchasable: boolean;
	isAdded: boolean;
	targetMarkets: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Pagination {
	totalItems: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface QueryUpcResponse {
	data: UpcItem[];
	metadata: Pagination;
	message: string;
}

export interface CreateUpcResponse {
	data: UpcItem;
	message: string;
}

export interface ListPrefixUpcRequest {
	page?: number;
	pageSize?: number;
	search?: string;
	sortBy?: string;
	orderBy?: string;
}

export interface PrefixUpcItem {
	id: string;
	code: string;
	brandName: string;
	maxQuantity: number;
	createdAt: string;
	updatedAt: string;
	type: string;
}

export interface ListPrefixUpcResponse {
	data: PrefixUpcItem[];
	metadata: Pagination;
	message: string;
}

export class GetUpcRequest {
	@IsNotEmpty()
	prefixUpcId: string;
}

export interface GetUpcResponse {
	upc: string;
	message: string;
}

/* ===== gRPC CONTRACT ===== */

export interface UpcGrpcService {
	listUpc(
		data: QueryUpcRequest,
		metadata?: Metadata,
	): Observable<QueryUpcResponse>;
	createUpc(
		data: CreateUpcRequest,
		metadata?: Metadata,
	): Observable<CreateUpcResponse>;
	getUpc(
		data: GetUpcRequest,
		metadata?: Metadata,
	): Observable<GetUpcResponse>;
	listPrefixUpc(
		data: ListPrefixUpcRequest,
		metadata?: Metadata,
	): Observable<ListPrefixUpcResponse>;
}
