import { forwardRef, Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { UserModule } from '../user/user.module';
import { Auth0Controller } from './auth0.controller';
import { Auth0Guard } from './guards/auth0.guard';
import Auth0JwtService from './services/auth0-jwt.service';
import { Auth0UserService } from './services/auth0-user.service';
import { Auth0Service } from './services/auth0.service';

@Module({
	imports: [AppConfigModule, forwardRef(() => UserModule)],
	controllers: [Auth0Controller],
	providers: [Auth0Service, Auth0UserService, Auth0Guard, Auth0JwtService],
	exports: [Auth0Service, Auth0UserService, Auth0Guard, Auth0JwtService],
})
export class Auth0Module {}
