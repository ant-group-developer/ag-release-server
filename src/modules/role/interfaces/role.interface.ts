export interface ICreateRole {
	name: string;
	color: string;
	note?: string;
	creatorId: string;
	modifierId: string;
}

export interface ICreateRolePermission {
	roleId: string;
	permissionId: string;
}
