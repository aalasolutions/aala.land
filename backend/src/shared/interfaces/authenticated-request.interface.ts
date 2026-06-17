export interface JwtUserPayload {
  userId: string;
  email: string;
  companyId: string | null;
  role: string;
  impersonatedBy: string | null;
}

export interface AuthenticatedRequest {
  user: JwtUserPayload;
}
