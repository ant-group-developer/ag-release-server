import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { readFileSync } from 'fs';
import { AccessControlModule } from '../access-control/access-control.module';
import { UserModule } from '../user/user.module';
import { TokenService } from './token.service';
import { JwtStrategy } from './token.strategy';

export type PublicKeysMap = Record<string, string>;

const PublicKeysProvider: Provider = {
	provide: 'PUBLIC_KEYS',
	inject: [ConfigService],
	useFactory: (cfg: ConfigService): PublicKeysMap => {
		const kid = cfg.get<string>('JWT_KID') || 'v1';
		const pub = readFileSync(
			cfg.get<string>('JWT_PUBLIC_KEY_PATH')!,
			'utf8',
		);
		return { [kid]: pub };
	},
};

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (cfg: ConfigService) => {
				const privateKey = readFileSync(
					cfg.get<string>('JWT_PRIVATE_KEY_PATH')!,
					'utf8',
				);
				const publicKey = readFileSync(
					cfg.get<string>('JWT_PUBLIC_KEY_PATH')!,
					'utf8',
				);

				return {
					privateKey,
					publicKey,
					signOptions: {
						algorithm: 'RS256',
						issuer: cfg.get<string>('JWT_ISSUER'),
						audience: cfg.get<string>('JWT_AUDIENCE'),
						expiresIn: cfg.get('JWT_EXPIRES_IN') || '15m',
						keyid: cfg.get<string>('JWT_KID') || 'v1',
					},
					verifyOptions: {
						algorithms: ['RS256'],
						issuer: cfg.get<string>('JWT_ISSUER'),
						audience: cfg.get<string>('JWT_AUDIENCE'),
						clockTolerance: 5,
					},
				};
			},
		}),
		UserModule,
		AccessControlModule,
	],
	providers: [TokenService, JwtStrategy, PublicKeysProvider],
	exports: [TokenService, JwtModule],
})
export class TokenModule {}
