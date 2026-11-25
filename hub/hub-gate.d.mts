export interface HubSession { sub: string; name?: string; role?: string; pages: string[]; iat: number; exp: number; aud: string; typ: string; iss: string }
export interface HubUser { email: string; name: string; pages: string[]; role?: string }
export interface HubGateConfig {
  pages: Record<string, string>;
  defaultPage?: string;
  isPublic?: (path: string, request: Request) => boolean;
  apiPages?: (path: string) => string[] | undefined;
}
export const TICKET_TYP: string;
export const SESSION_TYP: string;
export function hubEnforced(): boolean;
export function hubOrigins(): string[];
export function hubOrigin(): string;
export function hubFrameAncestors(): string | null;
export function freshSeconds(): number;
export function sessionSeconds(): number;
export function signJwt(payload: Record<string, unknown>, key?: string): Promise<string>;
export function verifyJwt(token: string | null | undefined, opts: { typ: string; aud: string | string[] }, key?: string): Promise<HubSession | null>;
export function sessionCookieName(secure: boolean): string;
export function appOrigins(url: URL): string[];
export function sessionFromCookieHeader(cookieHeader: string | null, url: string | URL): Promise<HubSession | null>;
export function sessionFromHeaders(get: (name: string) => string | null): Promise<HubSession | null>;
export function hubUser(session: HubSession | null): HubUser | null;
export function pageFor(pathname: string, pageMap: Record<string, string>): string | null;
export function hubGate(request: Request, cfg: HubGateConfig): Promise<{ response?: Response; session?: HubSession | null }>;
export function mintTicket(t: { origin: string; email: string; name?: string; role?: string; pages: string[] }, ttl?: number): Promise<string>;
