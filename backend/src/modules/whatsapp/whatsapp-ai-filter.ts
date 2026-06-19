const DANGEROUS_PATTERNS: RegExp[] = [
  /\bDROP\b/gi,
  /\bDELETE\b/gi,
  /\bREMOVE\b/gi,
  /\bUPDATE\b/gi,
  /\bINSERT\b/gi,
  /\bSELECT\b/gi,
  /--/g,
  /\/\*/g,
  /\*\//g,
  /`/g,
  /ignore\s+previous\s+instructions/gi,
  /you\s+are\s+now/gi,
  /\bact\s+as\b/gi,
];

export const DIRECT_CONTACT_RESPONSE = "I'm unable to process this request. Please contact our office directly.";

export function sanitizeInput(message: string): { cleaned: string; needsDirectContact: boolean } {
  let cleaned = message;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return { cleaned, needsDirectContact: cleaned.length === 0 };
}

export function parseResponse(raw: any): string | null {
  const content = raw?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  return content.trim();
}
