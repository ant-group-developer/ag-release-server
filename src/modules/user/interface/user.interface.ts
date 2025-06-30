import { CreateUserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
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

export interface IUserService {
	createUser(data: CreateUserDto): Promise<User>;
}

// export interface IUserPublic {
// 	id: string;
// 	userName: string;
// }

// export interface IUserSchema {
// 	userName: string;
// 	password: string;
// }
