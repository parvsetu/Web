import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionGuard } from './permission.guard';
import { AuditService } from '../audit/audit.service';
import { QrSigner } from '../qr/qr-signer';
import { FestivalCatalogService } from '../catalog/festival-catalog.service';

@Global()
@Module({
  providers: [AccessService, PermissionGuard, AuditService, QrSigner, FestivalCatalogService],
  exports: [AccessService, PermissionGuard, AuditService, QrSigner, FestivalCatalogService],
})
export class AccessModule {}
