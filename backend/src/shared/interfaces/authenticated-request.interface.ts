export interface JwtUserPayload {
  userId: string;
  email: string;
  companyId: string | null;
  role: string;
}

export interface AuthenticatedRequest {
  user: JwtUserPayload;
}
