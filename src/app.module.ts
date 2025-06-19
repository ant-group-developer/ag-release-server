// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { ConfigCustomModule } from './config/config.module';
// import { DatabaseModule } from './database/database.module';
// import { UserModule } from './user/user.module';

// @Module({
// 	imports: [ConfigCustomModule, DatabaseModule, UserModule],
// 	controllers: [AppController],
// 	providers: [AppService],
// })
// export class AppModule {}

import { Module } from '@nestjs/common';
import { ArtistRoleModule } from './artist-role/artist-role.module';
import { ArtistModule } from './artist/artist.module';
import { AudioFileModule } from './audio-file/audio-file.module';
import { AuthModule } from './auth/auth.module';
import { ConfigCustomModule } from './config/config.module';
import { CountryModule } from './country/country.module';
import { DatabaseModule } from './database/database.module';
import { DspModule } from './dsp/dsp.module';
import { GenreModule } from './genre/genre.module';
import { JwtModule } from './jwt/jwt.module';
import { LabelModule } from './label/label.module';
import { LanguageModule } from './language/language.module';
import { OrganizationDspModule } from './organization-dsp/organization-dsp.module';
import { OrganizationUserModule } from './organization-user/organization-user.module';
import { OrganizationModule } from './organization/organization.module';
import { PermissionModule } from './permission/permission.module';
import { ReleaseArtistModule } from './release-artist/release-artist.module';
import { ReleaseLanguageModule } from './release-language/release-language.module';
import { ReleaseLocalizeModule } from './release-localize/release-localize.module';
import { ReleaseModule } from './release/release.module';
import { TrackArtistModule } from './track-artist/track-artist.module';
import { TrackLanguageModule } from './track-language/track-language.module';
import { TrackLocalizeModule } from './track-localize/track-localize.module';
import { TrackModule } from './track/track.module';
import { UserModule } from './user/user.module';

@Module({
	imports: [
		DatabaseModule,
		ConfigCustomModule,
		//
		// ArtistModule,
		// ArtistRoleModule,
		// AudioFileModule,
		// AuthModule,
		// ConfigCustomModule,
		// CountryModule,
		// DspModule,
		// GenreModule,
		// JwtModule,
		// LabelModule,
		// LanguageModule,
		// OrganizationModule,
		// PermissionModule,
		// ReleaseModule,
		// ReleaseArtistModule,
		// ReleaseLanguageModule,
		// ReleaseLocalizeModule,
		// TrackModule,
		// TrackArtistModule,
		// TrackLanguageModule,
		// TrackLocalizeModule,
		// UserModule,
		OrganizationDspModule,
		// OrganizationUserModule,
	],
})
export class AppModule { }
