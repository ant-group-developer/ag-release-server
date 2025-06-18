import { UserType } from '../enum/user.enum';

export interface IUserSchema {
	id: string;
	creatorId: string;
	creator: IUserSchema;
	modifierId: string;
	modifier: IUserSchema;
	name: string;
	email: string;
	type: UserType;
	isActive: boolean;
}
