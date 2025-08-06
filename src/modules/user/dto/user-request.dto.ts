import { UserType } from '../enum/user.enum';

interface UserRequest {
	id: string;
	authO0ClientId: string;
	type: UserType;
	email: string;
}

export class UserRequestDto {
	id: string;
	authO0ClientId: string;
	type: UserType = UserType.USER;
	email: string;

	constructor(data: UserRequest) {
		this.id = data.id;
		this.authO0ClientId = data.authO0ClientId;
		this.type = data.type || UserType.USER;
		this.email = data.email;
	}
}
