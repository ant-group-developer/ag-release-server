import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private jwtService: JwtService,
	) {
		super({
			clientID: 'YOUR_GOOGLE_CLIENT_ID',
			clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
			callbackURL: 'http://localhost:3000/auth/google/callback',
			scope: ['email', 'profile'],
		});
	}

	async validate(
		accessToken: string,
		refreshToken: string,
		profile: any,
		done: VerifyCallback,
	) {
		const { name, emails } = profile;
		const user = await this.userRepository.findOne({
			where: { email: emails[0].value },
		});

		if (!user) {
			// Create a new user if not found
			const newUser = await this.userRepository.save({
				email: emails[0].value,
				name: name.givenName + ' ' + name.familyName,
				googleId: profile.id,
			});
			return done(null, newUser);
		}

		return done(null, user);
	}
}
