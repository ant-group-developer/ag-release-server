export enum DBType {
	MYSQL = 'mysql',
	POSTGRES = 'postgres',
}

export const DBConst = {
	LENGTH_ID: {
		DEFAULT: 36,
		LONG: 36,
		SHORT: 10,
	},

	UTC_OFFSET: '00:07',
} as const;

export type TypeID = string;
