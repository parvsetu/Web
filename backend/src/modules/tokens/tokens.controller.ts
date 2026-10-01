import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { TokensService } from './tokens.service';
import { ScanService } from './scan.service';
import { BulkGenerateDto, CancelTokenDto, ChangeValidityDto, IssueTokenDto, ReactivateTokenDto, ScanDto, TokenListQuery } from './tokens.dto';

export const SCAN_RATE_LIMIT = Number(process.env.SCAN_RATE_LIMIT_PER_MIN ?? 120);

@Controller()
export class TokensController {
  constructor(private readonly tokens: TokensService, private readonly scanner: ScanService) {}

  /** Authorization is done inside ScanService so that refusals are logged too. */
  @Throttle({ default: { limit: SCAN_RATE_LIMIT, ttl: 60_000 } })
  @Post('tokens/scan')
  async scan(@CurrentUser() user: RequestUser, @Body() dto: ScanDto, @Req() req: Request, @Res() res: Response) {
    const out = await this.scanner.scan(user, dto, { ip: req.ip, userAgent: req.get('user-agent') });
    res.status(out.httpStatus).json(out.body);
  }

  @RequireEventPermission('TOKEN_CREATE')
  @Post('events/:eventId/tokens')
  issue(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Body() dto: IssueTokenDto) {
    return this.tokens.issue(user, a.event!, a.perms, dto);
  }

  @RequireEventPermission('TOKEN_GENERATE')
  @Post('events/:eventId/tokens/bulk')
  bulk(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Body() dto: BulkGenerateDto) {
    return this.tokens.bulkGenerate(user, a.event!, a.perms, dto);
  }

  @RequireEventPermission('TOKEN_VIEW')
  @Get('events/:eventId/tokens')
  list(@Access() a: AccessContext, @Query() q: TokenListQuery) {
    return this.tokens.list(a.event!, q);
  }

  @RequireEventPermission('TOKEN_VIEW')
  @Get('events/:eventId/tokens/:tokenId')
  detail(@Param('eventId') eventId: string, @Param('tokenId') tokenId: string) {
    return this.tokens.detail(eventId, tokenId);
  }

  @RequireEventPermission('TOKEN_VIEW')
  @Get('events/:eventId/tokens/:tokenId/qr.png')
  async qr(@Param('eventId') eventId: string, @Param('tokenId') tokenId: string, @Res() res: Response) {
    const png = await this.tokens.qrPng(eventId, tokenId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(png);
  }

  @RequireEventPermission('TOKEN_CANCEL')
  @Post('events/:eventId/tokens/:tokenId/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('tokenId') tokenId: string, @Body() dto: CancelTokenDto) {
    return this.tokens.cancel(user, a.event!, tokenId, dto.reason);
  }

  @RequireEventPermission('TOKEN_GENERATE')
  @Patch('events/:eventId/tokens/:tokenId/validity')
  validity(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('tokenId') tokenId: string, @Body() dto: ChangeValidityDto) {
    return this.tokens.changeValidity(user, a.event!, a.perms, tokenId, dto);
  }

  @RequireEventPermission('TOKEN_REACTIVATE')
  @Post('events/:eventId/tokens/:tokenId/reactivate')
  @HttpCode(200)
  reactivate(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('tokenId') tokenId: string, @Body() dto: ReactivateTokenDto) {
    return this.tokens.reactivate(user, a.event!, tokenId, dto);
  }
}
