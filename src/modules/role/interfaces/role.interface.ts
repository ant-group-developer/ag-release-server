export interface ICreateRole {
	name: string;
	color: string;
	note?: string;
}

export interface ICreateRolePermission {
	roleId: string;
	permissionId: string;
}
