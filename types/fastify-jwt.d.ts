import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    sign(payload: any, options?: { expiresIn?: string }): string;
    verify<T = any>(token: string): T;
  }
}
