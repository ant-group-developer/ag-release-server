export enum UserType {
	ADMIN = 'admin',
	USER = 'user',
}

export enum UserOrderBy {
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',
	NAME = 'name',
	EMAIL = 'email',
	LAST_LOGIN = 'lastLogin',
}

export enum TenantUserType {
	OWNER = 'owner',
	ADMIN = 'admin',
	MEMBER = 'member',
}
