import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './common/config/app.config';
import { envValidationSchema } from './common/config/env.validation.schema';
import { AlbumFormatModule } from './modules/album-format/album-format.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { ArtistProfileModule } from './modules/artist-profile/artist-profile.module';
import { ArtistRoleModule } from './modules/artist-role/artist-role.module';
import { ArtistModule } from './modules/artist/artist.module';
import { AudioFileModule } from './modules/audio-file/audio-file.module';
import { Auth0Module } from './modules/auth0/auth0.module';
import { BucketModule } from './modules/bucket/bucket.module';
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
import { ReleaseDspModule } from './modules/release-dsp/release-dsp.module';
import { ReleaseLocalizeModule } from './modules/release-localize/release-localize.module';
import { ReleaseModule } from './modules/release/release.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TimezoneModule } from './modules/timezone/timezone.module';
import { TrackArtistModule } from './modules/track-artist/track-artist.module';
import { TrackLanguageModule } from './modules/track-language/track-language.module';
import { TrackLocalizeModule } from './modules/track-localize/track-localize.module';
import { TrackOriginTypeModule } from './modules/track-origin-type/track-origin-type.module';
import { TrackTypeModule } from './modules/track-type/track-type.module';
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

		CountryModule,
		LanguageModule,

		DspModule,
		GenreModule,
		JwtModule,
		LabelModule,

		OrganizationModule,
		PermissionModule,

		ReleaseModule,
		AlbumFormatModule,
		ReleaseArtistModule,
		// ReleaseLanguageModule,
		// ReleaseCoverArtModule,
		ReleaseLocalizeModule,
		ReleaseDspModule,

		TrackModule,
		TrackArtistModule,
		TrackLanguageModule,
		TrackLocalizeModule,
		AudioFileModule,
		TrackTypeModule,
		TrackOriginTypeModule,

		ArtistModule,
		ArtistRoleModule,
		ArtistProfileModule,

		OrganizationDspModule,
		OrganizationUserModule,
		UserPermissionModule,
		BucketModule,
		TimezoneModule,

		AppConfigModule,
		Auth0Module,
		TenantModule,
		UserModule,
		// ScheduleModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
