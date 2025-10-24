import { JWTPayload } from './jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload | string | object | Buffer<ArrayBufferLike>;
  }
}