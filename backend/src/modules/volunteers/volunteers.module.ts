import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

@Module({ imports: [OrganizationsModule], controllers: [VolunteersController], providers: [VolunteersService] })
export class VolunteersModule {}
