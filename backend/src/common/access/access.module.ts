import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PermissionGuard } from './permission.guard';
import { AuditService } from '../audit/audit.service';
import { QrSigner } from '../qr/qr-signer';

@Global()
@Module({
  providers: [AccessService, PermissionGuard, AuditService, QrSigner],
  exports: [AccessService, PermissionGuard, AuditService, QrSigner],
})
export class AccessModule {}
