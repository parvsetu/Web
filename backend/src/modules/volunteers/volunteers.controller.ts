import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireOrgPermission } from '../../common/access/permission.guard';
import { VolunteersService } from './volunteers.service';
import { ApplicationListQuery, ApproveApplicationDto, CreateVolunteerDto, ReasonDto, UpdateVolunteerDto, VolunteerListQuery } from './volunteers.dto';

@Controller('organizations/:orgId')
export class VolunteersController {
  constructor(private readonly volunteers: VolunteersService) {}

  @RequireOrgPermission('VOLUNTEER_VIEW')
  @Get('volunteers')
  list(@Param('orgId') orgId: string, @Query() q: VolunteerListQuery) {
    return this.volunteers.list(orgId, q);
  }

  // VOLUNTEER_ASSIGN on the target event is checked in the service.
  @RequireOrgPermission('VOLUNTEER_CREATE')
  @Post('volunteers')
  create(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: CreateVolunteerDto) {
    return this.volunteers.create(user, orgId, dto);
  }

  @RequireOrgPermission('VOLUNTEER_UPDATE')
  @Patch('volunteers/:userId')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('userId') userId: string, @Body() dto: UpdateVolunteerDto) {
    return this.volunteers.update(user, orgId, userId, dto);
  }

  @RequireOrgPermission('VOLUNTEER_UPDATE')
  @Post('volunteers/:userId/activate')
  @HttpCode(200)
  activate(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('orgId') orgId: string, @Param('userId') userId: string, @Body() dto: ReasonDto) {
    return this.volunteers.setActive(user, a.perms, orgId, userId, true, dto.reason);
  }

  @RequireOrgPermission('VOLUNTEER_UPDATE')
  @Post('volunteers/:userId/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('orgId') orgId: string, @Param('userId') userId: string, @Body() dto: ReasonDto) {
    return this.volunteers.setActive(user, a.perms, orgId, userId, false, dto.reason);
  }

  @RequireOrgPermission('VOLUNTEER_VIEW')
  @Get('volunteer-applications')
  applications(@Param('orgId') orgId: string, @Query() q: ApplicationListQuery) {
    return this.volunteers.applications(orgId, q);
  }

  // Event-level VOLUNTEER_ASSIGN is checked in the service against dto.eventId.
  @RequireOrgPermission('VOLUNTEER_VIEW')
  @Post('volunteer-applications/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: ApproveApplicationDto) {
    return this.volunteers.approve(user, orgId, id, dto);
  }

  @RequireOrgPermission('VOLUNTEER_ASSIGN')
  @Post('volunteer-applications/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.volunteers.reject(user, orgId, id, dto.reason);
  }
}
