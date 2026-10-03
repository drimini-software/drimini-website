import type { D1Database } from "../_shared/cloudflare";

const MAX_BODY_BYTES = 24_000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TEST_TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
const PRIVACY_NOTICE_VERSION = "2026-10-02";

export interface ContactEnvironment {
  TURNSTILE_SECRET_KEY?: string;
  CONTACT_DB?: D1Database;
}

interface ContactContext {
  request: Request;
  env: ContactEnvironment;
}

interface TurnstileResult {
  success?: boolean;
  hostname?: string;
  action?: string;
}

export interface ContactFields {
  name: string;
  email: string;
  company: string;
  role: string;
  project: string;
  timeline: string;
  budget: string;
}

type Fetcher = typeof fetch;
type EnquiryStore = (fields: ContactFields, database: D1Database) => Promise<boolean>;

type ConfiguredEnvironment = ContactEnvironment & {
  TURNSTILE_SECRET_KEY: string;
  CONTACT_DB: D1Database;
};

function singleLine(value: string, maximum: number): string | null {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 && cleaned.length <= maximum ? cleaned : null;
}

function optionalSingleLine(value: string, maximum: number): string | null {
  if (value.trim() === "") return "";
  return singleLine(value, maximum);
}

function multiline(value: string, minimum: number, maximum: number): string | null {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  return cleaned.length >= minimum && cleaned.length <= maximum ? cleaned : null;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function jsonResponse(status: number, ok: boolean, message: string): Response {
  return Response.json(
    { ok, message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function browserResponse(request: Request, status: number, ok: boolean, message: string): Response {
  if (request.headers.get("accept")?.includes("application/json")) {
    return jsonResponse(status, ok, message);
  }

  const path = ok ? "/contact/sent/" : "/contact/problem/";
  return Response.redirect(new URL(path, request.url), 303);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function requiredConfiguration(env: ContactEnvironment): env is ConfiguredEnvironment {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.CONTACT_DB);
}

async function verifyTurnstile(
  token: string,
  request: Request,
  secret: string,
  fetcher: Fetcher,
): Promise<boolean> {
  const response = await fetcher(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  if (!response.ok) return false;
  const result = (await response.json()) as TurnstileResult;
  if (!result.success) return false;

  // Cloudflare's documented test key deliberately returns test metadata.
  if (secret === TEST_TURNSTILE_SECRET) return true;

  const requestHostname = new URL(request.url).hostname;
  return result.hostname === requestHostname && result.action === "contact";
}

export async function storeEnquiry(
  fields: ContactFields,
  database: D1Database,
): Promise<boolean> {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const result = await database
    .prepare(
      `INSERT INTO contact_enquiries (
        id, created_at, updated_at, name, email, company, role, project,
        timeline, budget, status, privacy_notice_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    )
    .bind(
      id,
      timestamp,
      timestamp,
      fields.name,
      fields.email,
      fields.company,
      fields.role,
      fields.project,
      fields.timeline,
      fields.budget,
      PRIVACY_NOTICE_VERSION,
    )
    .run();

  return result.success === true;
}

export async function handleContactRequest(
  request: Request,
  env: ContactEnvironment,
  fetcher: Fetcher = fetch,
  enquiryStore: EnquiryStore = storeEnquiry,
): Promise<Response> {
  if (!sameOrigin(request)) {
    return browserResponse(request, 403, false, "We could not verify where this request came from.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentType.startsWith("application/x-www-form-urlencoded") || contentLength > MAX_BODY_BYTES) {
    return browserResponse(request, 415, false, "This message format is not supported.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return browserResponse(request, 413, false, "That message is too large to send.");
  }

  const form = new URLSearchParams(rawBody);

  // Bots commonly fill this visually hidden field. Return an ordinary success
  // response without invoking validation or persistence.
  if ((form.get("website") ?? "").trim() !== "") {
    return browserResponse(request, 200, true, "Thanks. Your message has been received.");
  }

  if (!requiredConfiguration(env)) {
    return browserResponse(
      request,
      503,
      false,
      "The message could not be received right now. Please try again later.",
    );
  }

  const name = singleLine(form.get("name") ?? "", 100);
  const email = singleLine(form.get("email") ?? "", 254);
  const company = singleLine(form.get("company") ?? "", 160);
  const role = optionalSingleLine(form.get("role") ?? "", 120);
  const project = multiline(form.get("project") ?? "", 20, 5_000);
  const timeline = optionalSingleLine(form.get("timeline") ?? "", 120);
  const budget = optionalSingleLine(form.get("budget") ?? "", 120);
  const consent = form.get("consent") === "acknowledged";
  const turnstileToken = form.get("cf-turnstile-response") ?? "";

  if (
    !name ||
    !email ||
    !validEmail(email) ||
    !company ||
    role === null ||
    !project ||
    timeline === null ||
    budget === null ||
    !consent ||
    turnstileToken.length === 0 ||
    turnstileToken.length > 4_096
  ) {
    return browserResponse(request, 400, false, "Please check the required fields and try again.");
  }

  let human = false;
  try {
    human = await verifyTurnstile(turnstileToken, request, env.TURNSTILE_SECRET_KEY, fetcher);
  } catch {
    human = false;
  }

  if (!human) {
    return browserResponse(request, 400, false, "Spam protection could not verify this submission. Please try again.");
  }

  try {
    const stored = await enquiryStore(
      { name, email, company, role, project, timeline, budget },
      env.CONTACT_DB,
    );
    if (!stored) throw new Error("D1 rejected the enquiry");
  } catch (error) {
    console.error("Contact persistence failed", error instanceof Error ? error.name : "UnknownError");
    return browserResponse(
      request,
      503,
      false,
      "The message could not be received right now. Please try again later.",
    );
  }

  return browserResponse(request, 200, true, "Thanks. Your message has been received.");
}

export const onRequestPost = ({ request, env }: ContactContext) =>
  handleContactRequest(request, env);
