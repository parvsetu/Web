import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { RolesService } from './roles.service';
import { UserProvisioningService } from './user-provisioning.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, RolesService, UserProvisioningService],
  exports: [RolesService, UserProvisioningService],
})
export class OrganizationsModule {}
