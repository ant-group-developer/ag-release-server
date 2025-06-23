import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './common/config/app.config';
import { envValidationSchema } from './common/config/env.validation.schema';
import { ArtistRoleModule } from './modules/artist-role/artist-role.module';
import { ArtistModule } from './modules/artist/artist.module';
import { AudioFileModule } from './modules/audio-file/audio-file.module';
import { CountryModule } from './modules/country/country.module';
import { DatabaseModule } from './modules/database/database.module';
import { DspModule } from './modules/dsp/dsp.module';
import { GenreModule } from './modules/genre/genre.module';
import { LabelModule } from './modules/label/label.module';
import { LanguageModule } from './modules/language/language.module';
import { OrganizationDspModule } from './modules/organization-dsp/organization-dsp.module';
import { OrganizationUserModule } from './modules/organization-user/organization-user.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PermissionModule } from './modules/permission/permission.module';
import { ReleaseArtistModule } from './modules/release-artist/release-artist.module';
import { ReleaseLanguageModule } from './modules/release-language/release-language.module';
import { ReleaseLocalizeModule } from './modules/release-localize/release-localize.module';
import { ReleaseModule } from './modules/release/release.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { TrackArtistModule } from './modules/track-artist/track-artist.module';
import { TrackLanguageModule } from './modules/track-language/track-language.module';
import { TrackLocalizeModule } from './modules/track-localize/track-localize.module';
import { TrackModule } from './modules/track/track.module';
import { UserPermissionModule } from './modules/user-permission/user-permission.module';
import { UserModule } from './modules/user/user.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [appConfig],
			validationSchema: envValidationSchema,
		}),
		// TypeOrmModule.forRootAsync({
		// 	imports: [ConfigModule],
		// 	useClass: DatabaseConfigService,
		// }),

		DatabaseModule,
		// ... other modules
		ArtistModule,
		ArtistRoleModule,
		AudioFileModule,
		CountryModule,
		DspModule,
		GenreModule,
		JwtModule,
		LabelModule,
		LanguageModule,
		OrganizationModule,
		PermissionModule,
		ReleaseModule,
		ReleaseArtistModule,
		ReleaseLanguageModule,
		ReleaseLocalizeModule,
		TrackModule,
		TrackArtistModule,
		TrackLanguageModule,
		TrackLocalizeModule,
		UserModule,
		OrganizationDspModule,
		OrganizationUserModule,
		UserPermissionModule,
		ScheduleModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
