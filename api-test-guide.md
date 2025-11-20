# API Test Guide - Movie Streaming Backend

## 🚀 **Quick Test - All New User Features**

### **Test User Session Management**

```bash
# Start a new user session
curl -X POST http://localhost:3000/user/session/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{
    "contentId": "movie_123",
    "contentType": "movie",
    "watchTogetherRoomId": "room_456"
  }'

# Update session progress
curl -X PUT http://localhost:3000/user/session/SESSION_ID/progress \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{
    "currentTime": 120,
    "totalDuration": 7200
  }'

# End a session
curl -X POST http://localhost:3000/user/session/SESSION_ID/end \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{
    "finalProgress": 3600,
    "totalDuration": 7200
  }'
```

### **Test Watch History**

```bash
# Get watch history
curl -X GET "http://localhost:3000/user/watch-history?contentType=movie&limit=10" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Get recently watched
curl -X GET "http://localhost:3000/user/recently-watched?limit=5" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Get continue watching
curl -X GET "http://localhost:3000/user/continue-watching?limit=10" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Toggle favorite
curl -X POST http://localhost:3000/user/favorites/movie_123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{"contentType": "movie"}'

# Get watch statistics
curl -X GET "http://localhost:3000/user/watch-statistics?days=30" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"
```

### **Test User Profile**

```bash
# Get user profile
curl -X GET http://localhost:3000/user/profile \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Update user profile
curl -X PUT http://localhost:3000/user/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -d '{
    "displayName": "John Doe",
    "bio": "Movie enthusiast",
    "preferences": {
      "autoplay": false,
      "subtitles": true,
      "theme": "dark"
    },
    "watchPreferences": {
      "preferredQuality": "1080p",
      "subtitleLanguage": "en"
    }
  }'

# Get profile statistics
curl -X GET http://localhost:3000/user/profile/statistics \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"
```

### **Test Health Endpoints**

```bash
# Main health check
curl -X GET http://localhost:3000/health

# Security status
curl -X GET http://localhost:3000/security/status

# API configuration
curl -X GET http://localhost:3000/api/config

# Providers backend health
curl -X GET http://localhost:3000/health/providers
```

## 📊 **Database Setup Required**

**IMPORTANT**: Before testing, you need to run the database schema in Supabase:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `database-schema.sql`
4. Execute the SQL commands

This will create:

- `user_sessions` table
- `watch_history` table
- `user_profiles` table
- All necessary indexes
- Row Level Security (RLS) policies
- Automatic triggers and functions

## 🔧 **Environment Variables to Set**

Make sure these are in your `.env` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Internal API
INTERNAL_API_KEY=your_internal_api_key_here
PROVIDERS_BACKEND_URL=https://your-providers-backend.railway.app

# JWT
JWT_SECRET=your_jwt_secret_here

# Monitoring
SENTRY_DSN=your_sentry_dsn
POSTHOG_API_KEY=your_posthog_key
```

## 🎯 **Expected Responses**

### **Successful Session Start**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "contentId": "movie_123",
    "contentType": "movie",
    "startTime": "2025-11-09T17:00:00.000Z",
    "lastProgress": 0,
    "completionPercentage": 0,
    "isActive": true,
    "createdAt": "2025-11-09T17:00:00.000Z",
    "updatedAt": "2025-11-09T17:00:00.000Z"
  }
}
```

### **Successful Watch History**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-uuid",
      "contentId": "movie_123",
      "contentType": "movie",
      "watchedDuration": 3600,
      "totalDuration": 7200,
      "lastWatched": "2025-11-09T17:00:00.000Z",
      "completionPercentage": 50,
      "favorite": false,
      "createdAt": "2025-11-09T17:00:00.000Z",
      "updatedAt": "2025-11-09T17:00:00.000Z"
    }
  ]
}
```

### **Successful Profile Update**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "displayName": "John Doe",
    "bio": "Movie enthusiast",
    "preferences": {
      "language": "en",
      "region": "US",
      "autoplay": false,
      "subtitles": true,
      "theme": "dark",
      "notifications": {
        "email": true,
        "push": true,
        "newContent": true,
        "watchParty": true
      }
    },
    "watchPreferences": {
      "preferredQuality": "1080p",
      "preferredAudio": "en",
      "subtitleLanguage": "en",
      "skipIntro": false,
      "skipCredits": false,
      "playbackSpeed": 1.0
    },
    "createdAt": "2025-11-09T17:00:00.000Z",
    "updatedAt": "2025-11-09T17:00:00.000Z"
  }
}
```

## 🚨 **Error Handling**

All APIs include proper error handling:

### **Authentication Error (401)**

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### **Validation Error (400)**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [...]
}
```

### **Not Found (404)**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Session not found or access denied"
}
```

## 🔍 **Monitoring & Analytics**

- All user actions are tracked via **PostHog**
- Errors are captured by **Sentry**
- Performance is monitored via the health endpoint
- Database operations are logged

## 🏃‍♂️ **Next Steps**

1. **Run database schema** in Supabase
2. **Test all endpoints** with proper Supabase tokens
3. **Monitor via PostHog** and Sentry
4. **Deploy to production** with proper environment variables

## 🎉 **Success Criteria**

✅ Server running on port 3000
✅ All new user routes responding
✅ Database tables created and accessible
✅ Authentication working with Supabase
✅ Cross-backend integration functional
✅ Monitoring and analytics operational
