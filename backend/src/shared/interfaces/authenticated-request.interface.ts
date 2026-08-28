export interface JwtUserPayload {
  userId: string;
  email: string;
  companyId: string | null;
  role: string;
  regionCodes: string[];
}

export interface AuthenticatedRequest {
  user: JwtUserPayload;
}
