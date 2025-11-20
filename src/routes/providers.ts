// Proxy route to providers-backend
import { FastifyPluginAsync } from 'fastify';
import { logErrorWithDetails } from '../utils/errorHandler';

const providersProxyRoutes: FastifyPluginAsync = async (fastify) => {
  // Proxy all provider requests to providers-backend
  fastify.all('/*', async (request, reply) => {
    try {
      const providersBackendUrl = process.env.PROVIDERS_BACKEND_URL;
      const internalApiKey = process.env.INTERNAL_API_KEY;
      
      if (!providersBackendUrl || !internalApiKey) {
        throw new Error('Providers backend configuration missing');
      }

      // Build target URL
      const targetUrl = `${providersBackendUrl}/providers${request.url.replace('/providers', '')}`;
      
      // Forward the request - filter valid headers only
      const validHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-internal-key': internalApiKey
      };

      // Add valid request headers
      if (request.headers) {
        Object.entries(request.headers).forEach(([key, value]) => {
          if (typeof value === 'string' && key.toLowerCase().match(/^[a-z-]+$/)) {
            validHeaders[key.toLowerCase()] = value;
          }
        });
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: validHeaders,
        body: request.body ? JSON.stringify(request.body) : null
      });

      // Handle response
      const data = await response.json();
      reply.code(response.status).send(data);
      
    } catch (error) {
      logErrorWithDetails(error, { 
        context: 'Providers proxy',
        url: request.url,
        method: request.method 
      });
      
      reply.code(500).send({
        error: 'Provider service unavailable',
        message: 'Unable to reach providers backend'
      });
    }
  });
};

export default providersProxyRoutes;