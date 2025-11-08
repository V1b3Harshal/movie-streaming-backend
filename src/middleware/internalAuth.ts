import { FastifyRequest, FastifyReply } from 'fastify';

export const internalAuth = (request: FastifyRequest, reply: FastifyReply, done: Function) => {
  const apiKey = request.headers['x-internal-key'];
  const expectedApiKey = process.env.INTERNAL_API_KEY;

  if (!apiKey) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing x-internal-key header'
    });
    return;
  }

  if (apiKey !== expectedApiKey) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid x-internal-key'
    });
    return;
  }

  done(); // Continue to next handler
};