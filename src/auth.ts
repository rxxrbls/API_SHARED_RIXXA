export interface JwtClaims {
  sub: string;
  tribeId?: string;
  permissions?: string[];
  scopes?: string[];
  exp?: number;
  [key: string]: unknown;
}

export interface IssuedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}
