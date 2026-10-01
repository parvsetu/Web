import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail, normalizeMobile, temporaryPassword } from '../../common/identity';
import { BCRYPT_ROUNDS } from '../auth/auth.service';

/**
 * Admin-side account creation. An existing account (matched by mobile) is
 * attached as-is — an org admin can't overwrite another person's profile or
 * password. A new account gets the given password or a one-time temporary one.
 */
@Injectable()
export class UserProvisioningService {
  async findOrCreate(
    tx: Prisma.TransactionClient,
    input: { name: string; mobile: string; email?: string | null; password?: string | null },
  ) {
    const mobile = normalizeMobile(input.mobile);
    const existing = await tx.user.findUnique({ where: { mobile } });
    if (existing) return { user: existing, created: false, temporaryPassword: undefined as string | undefined };

    const email = normalizeEmail(input.email);
    if (email && (await tx.user.findUnique({ where: { email } }))) {
      throw new ConflictException({ message: 'Another account already uses this email.', code: 'EMAIL_TAKEN' });
    }
    const temp = input.password ? undefined : temporaryPassword();
    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        mobile,
        email,
        passwordHash: await bcrypt.hash(input.password ?? temp!, BCRYPT_ROUNDS),
      },
    });
    return { user, created: true, temporaryPassword: temp };
  }
}
