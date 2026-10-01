import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';

/**
 * Every error leaves as `{ statusCode, message, code? }`. Database errors,
 * stack traces and internals are logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();

    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ statusCode: 429, message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') return res.status(status).json({ statusCode: status, message: body });
      const b = body as Record<string, unknown>;
      return res.status(status).json({
        ...b,
        statusCode: status,
        message: b.message ?? exception.message,
        // Nest's default `error: "Bad Request"` label adds nothing for clients.
        error: undefined,
      });
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(409).json({ statusCode: 409, message: 'This record already exists.', code: 'CONFLICT' });
      }
      if (exception.code === 'P2025') {
        return res.status(404).json({ statusCode: 404, message: 'Not found' });
      }
    }
    this.logger.error(`${req?.method} ${req?.url} failed`, exception instanceof Error ? exception.stack : String(exception));
    return res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'Something went wrong. Please try again.' });
  }
}
