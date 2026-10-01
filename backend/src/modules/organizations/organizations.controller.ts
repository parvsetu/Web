import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { ALL_PERMISSIONS, PERMISSIONS, permissionGroup } from '../../common/permissions';
import { OrganizationsService } from './organizations.service';
import { SearchPageQuery } from '../../common/http';
import { RolesService } from './roles.service';
import {
  AddMemberDto, AuditQuery, OrgListQuery, CreateOrganizationDto, CreateRoleDto, UpdateMemberDto, UpdateOrganizationDto, UpdateRoleDto,
} from './organizations.dto';

@Controller()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService, private readonly roles: RolesService) {}

  @Get('permissions')
  permissions() {
    return ALL_PERMISSIONS.map((key) => ({ key, group: permissionGroup(key), description: PERMISSIONS[key] }));
  }

  @Get('organizations')
  list(@CurrentUser() user: RequestUser, @Query() q: OrgListQuery) {
    return this.orgs.list(user, q);
  }

  @SuperAdminOnly()
  @Post('organizations')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrganizationDto) {
    return this.orgs.create(user, dto);
  }

  @RequireOrgPermission('EVENT_VIEW')
  @Get('organizations/:orgId')
  get(@Param('orgId') orgId: string) {
    return this.orgs.get(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Patch('organizations/:orgId')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: UpdateOrganizationDto) {
    return this.orgs.update(user, orgId, dto);
  }

  @RequireOrgPermission('USER_VIEW')
  @Get('organizations/:orgId/members')
  members(@Param('orgId') orgId: string, @Query() q: SearchPageQuery) {
    return this.orgs.members(orgId, q);
  }

  @RequireOrgPermission('USER_CREATE')
  @Post('organizations/:orgId/members')
  addMember(@CurrentUser() user: RequestUser, @Access() access: AccessContext, @Param('orgId') orgId: string, @Body() dto: AddMemberDto) {
    return this.orgs.addMember(user, access.perms, orgId, dto);
  }

  @RequireOrgPermission('USER_UPDATE')
  @Patch('organizations/:orgId/members/:userId')
  updateMember(
    @CurrentUser() user: RequestUser, @Access() access: AccessContext,
    @Param('orgId') orgId: string, @Param('userId') userId: string, @Body() dto: UpdateMemberDto,
  ) {
    return this.orgs.updateMember(user, access.perms, orgId, userId, dto);
  }

  @RequireOrgPermission('USER_DELETE')
  @Delete('organizations/:orgId/members/:userId')
  @HttpCode(204)
  async removeMember(@CurrentUser() user: RequestUser, @Access() access: AccessContext, @Param('orgId') orgId: string, @Param('userId') userId: string) {
    await this.orgs.removeMember(user, access.perms, orgId, userId);
  }

  @RequireOrgPermission('ROLE_VIEW')
  @Get('organizations/:orgId/roles')
  listRoles(@Param('orgId') orgId: string) {
    return this.roles.list(orgId);
  }

  @RequireOrgPermission('ROLE_CREATE')
  @Post('organizations/:orgId/roles')
  createRole(@CurrentUser() user: RequestUser, @Access() access: AccessContext, @Param('orgId') orgId: string, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, access.perms, orgId, dto);
  }

  @RequireOrgPermission('ROLE_UPDATE')
  @Patch('organizations/:orgId/roles/:roleId')
  updateRole(
    @CurrentUser() user: RequestUser, @Access() access: AccessContext,
    @Param('orgId') orgId: string, @Param('roleId') roleId: string, @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(user, access.perms, orgId, roleId, dto);
  }

  @RequireOrgPermission('ROLE_DELETE')
  @Delete('organizations/:orgId/roles/:roleId')
  @HttpCode(204)
  async deleteRole(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('roleId') roleId: string) {
    await this.roles.remove(user, orgId, roleId);
  }

  @RequireOrgPermission('AUDIT_VIEW')
  @Get('organizations/:orgId/audit-logs')
  auditLogs(@Param('orgId') orgId: string, @Query() q: AuditQuery) {
    return this.orgs.auditLogs(orgId, q);
  }
}
