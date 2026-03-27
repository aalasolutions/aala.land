export interface JwtUserPayload {
  userId: string;
  email: string;
  companyId: string;
  role: string;
}

export interface AuthenticatedRequest {
  user: JwtUserPayload;
}
