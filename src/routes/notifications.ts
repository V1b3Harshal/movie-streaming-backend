import { FastifyPluginAsync } from 'fastify';
import { oneSignalService } from '../config/onesignal';
import { mixpanelService } from '../config/mixpanel';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Register user device for push notifications
  fastify.post('/register-device', {
    schema: {
      body: {
        type: 'object',
        required: ['playerId', 'userId'],
        properties: {
          playerId: { type: 'string', maxLength: 100 },
          userId: { type: 'string', maxLength: 100 },
          deviceType: { type: 'string', enum: ['ios', 'android', 'web'] },
          language: { type: 'string', maxLength: 10 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { playerId, userId, deviceType, language } = request.body as any;

      // In a real implementation, you'd store this mapping in your database
      // For now, we'll just track it in analytics
      mixpanelService.track('device_registered', {
        playerId,
        userId,
        deviceType: deviceType || 'web',
        language: language || 'en',
        timestamp: new Date().toISOString()
      }).catch(() => {});

      return {
        success: true,
        message: 'Device registered successfully',
        playerId,
        userId
      };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Register device' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Send test notification to user
  fastify.post('/test/:userId', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.params as any;

      const result = await oneSignalService.sendNotificationToUsers([userId], {
        headings: { en: 'Test Notification' },
        contents: { en: 'This is a test notification from your movie streaming app!' },
        data: {
          type: 'test',
          timestamp: new Date().toISOString()
        }
      });

      if (result.success) {
        mixpanelService.track('test_notification_sent', {
          userId,
          notificationId: result.id,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        return {
          success: true,
          message: 'Test notification sent successfully',
          notificationId: result.id
        };
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to send notification'
        });
      }
    } catch (error) {
      logErrorWithDetails(error, { context: 'Send test notification' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Send new content notification
  fastify.post('/content-available', {
    schema: {
      body: {
        type: 'object',
        required: ['contentId', 'contentType', 'title'],
        properties: {
          contentId: { type: 'string', maxLength: 50 },
          contentType: { type: 'string', enum: ['movie', 'tv'] },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 500 },
          posterUrl: { type: 'string', maxLength: 500 },
          targetUsers: { type: 'array', items: { type: 'string' } } // Optional: specific users
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { contentId, contentType, title, description, posterUrl, targetUsers } = request.body as any;

      const notification: any = {
        headings: { en: `New ${contentType === 'tv' ? 'TV Series' : 'Movie'} Available!` },
        contents: { en: `${title} is now available to watch${description ? ': ' + description : '!'}` },
        data: {
          type: 'new_content',
          contentId,
          contentType,
          title,
          posterUrl,
          timestamp: new Date().toISOString()
        },
        big_picture: posterUrl,
        chrome_big_picture: posterUrl
      };

      if (posterUrl) {
        notification.ios_attachments = { poster: posterUrl };
      }

      let result;
      if (targetUsers && targetUsers.length > 0) {
        // Send to specific users
        result = await oneSignalService.sendNotificationToUsers(targetUsers, notification);
      } else {
        // Send to all users (segment)
        result = await oneSignalService.sendNotificationToSegment('all_users', notification);
      }

      if (result.success) {
        mixpanelService.track('content_notification_sent', {
          contentId,
          contentType,
          title,
          targetUsersCount: targetUsers?.length || 'all',
          notificationId: result.id,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        return {
          success: true,
          message: 'Content notification sent successfully',
          notificationId: result.id,
          recipients: targetUsers?.length || 'all_users'
        };
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to send notification'
        });
      }
    } catch (error) {
      logErrorWithDetails(error, { context: 'Send content notification' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Send watch party invitation
  fastify.post('/watch-party-invite', {
    schema: {
      body: {
        type: 'object',
        required: ['roomId', 'hostName', 'contentTitle', 'inviteeIds'],
        properties: {
          roomId: { type: 'string', maxLength: 50 },
          hostName: { type: 'string', maxLength: 100 },
          contentTitle: { type: 'string', maxLength: 200 },
          contentType: { type: 'string', enum: ['movie', 'tv'] },
          inviteeIds: { type: 'array', items: { type: 'string' }, minItems: 1 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { roomId, hostName, contentTitle, contentType, inviteeIds } = request.body as any;

      const result = await oneSignalService.sendNotificationToUsers(inviteeIds, {
        headings: { en: 'Watch Party Invitation!' },
        contents: { en: `${hostName} invited you to watch "${contentTitle}" together!` },
        data: {
          type: 'watch_party_invite',
          roomId,
          hostName,
          contentTitle,
          contentType,
          timestamp: new Date().toISOString()
        },
        buttons: [
          {
            id: 'join_party',
            text: 'Join Party',
            icon: 'ic_menu_share'
          },
          {
            id: 'view_details',
            text: 'View Details',
            icon: 'ic_menu_info_details'
          }
        ]
      });

      if (result.success) {
        mixpanelService.track('watch_party_invite_sent', {
          roomId,
          hostName,
          contentTitle,
          contentType,
          inviteeCount: inviteeIds.length,
          notificationId: result.id,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        return {
          success: true,
          message: 'Watch party invitations sent successfully',
          notificationId: result.id,
          inviteeCount: inviteeIds.length
        };
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Failed to send invitations'
        });
      }
    } catch (error) {
      logErrorWithDetails(error, { context: 'Send watch party invitation' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get notification statistics
  fastify.get('/stats', async (_request, reply) => {
    try {
      const stats = oneSignalService.getStatus();

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get notification stats' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });
};

export default notificationsRoutes;