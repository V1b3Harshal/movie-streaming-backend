export interface JWTPayload {
  userId: string;
  email: string;
  sessionId?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  email: string;
  sessionId?: string;
  jti?: string; // JWT ID for token revocation
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
}