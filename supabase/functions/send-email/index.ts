// ---------------------------------------------------------------------
// Supabase Auth "Send Email" hook target.
//
// NOT part of the SDK-facing REST surface -- no openapi entry, no
// withCors, no user JWT. Supabase Auth calls this directly,
// server-to-server, with a Standard Webhooks signature
// (SEND_EMAIL_HOOK_SECRET), configured at Dashboard -> Authentication
// -> Hooks -> Send Email hook. Must be deployed with:
//   supabase functions deploy send-email --no-verify-jwt
// (the JWT verifier Supabase normally enforces would reject Auth's own
// signed request, which carries no user Authorization header at all).
//
// Why this exists: the Website's password-reset flow currently sends
// its own localized email via Brevo directly (src/services/brevo.ts +
// src/constants/i18n.json's auth.resetEmail.*), calling
// admin.auth.admin.generateLink() -- entirely bypassing Supabase Auth's
// mailer. Once the Website switches to this package's
// POST /auth/password-reset (supabase.auth.resetPasswordForEmail),
// Supabase Auth's own mailer fires instead, and by default that means
// Supabase's built-in (non-localized, differently-branded) template.
// This hook is what keeps the *content* identical -- the same per-locale
// copy, verbatim, from the Website's own translations -- while moving
// delivery through Supabase Auth's flow.
//
// Coverage: this hook fires for every Supabase Auth email type once
// configured, not just password recovery -- if e.g. signup
// confirmations (auth.email.enable_confirmations) or magic links are
// ever enabled, those route through here too. Only 'recovery' has real,
// localized copy (render.ts's RESET_EMAIL_COPY, mirrored from the
// Website's own translations). Any other action_type gets a plain
// English fallback with a working link rather than being silently
// dropped or erroring -- returning a non-2xx here fails the underlying
// Auth action for the end user, not just the email, so an unhandled
// action_type must never turn into e.g. "signup failed". Before
// enabling this hook in an environment where anything besides recovery
// is active, add real per-locale copy for that action_type in
// render.ts instead of relying on the fallback.
//
// Split from render.ts (the pure, testable logic -- action link
// construction, per-locale copy selection) so that index.test.ts can
// import the latter without also triggering this file's top-level
// Deno.serve(), same reasoning as every other function's
// schemas.ts/index.ts split (see docs/src/development/edge-functions.md).
// ---------------------------------------------------------------------

import { Webhook, } from 'https://esm.sh/standardwebhooks@1.0.0';
import { extractLocale, } from '../_shared/locales.ts';
import { actionLinkFor, emailContentFor, type HookPayload, } from './render.ts';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

Deno.serve(async (req: Request,): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, },);
  }

  const hookSecretRaw = Deno.env.get('SEND_EMAIL_HOOK_SECRET',);
  const brevoApiKey = Deno.env.get('BREVO_API_KEY',);
  const supabaseUrl = Deno.env.get('SUPABASE_URL',);
  if (!hookSecretRaw || !brevoApiKey || !supabaseUrl) {
    console.error(
      'send-email: missing required secret (SEND_EMAIL_HOOK_SECRET, BREVO_API_KEY or SUPABASE_URL).',
    );
    return new Response('server misconfigured', { status: 500, },);
  }
  const hookSecret = hookSecretRaw.replace('v1,whsec_', '',);

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers,);

  let verified: HookPayload;
  try {
    verified = new Webhook(hookSecret,).verify(payload, headers,) as HookPayload;
  } catch (err) {
    console.error('send-email: webhook signature verification failed:', err,);
    return new Response('invalid signature', { status: 401, },);
  }

  const { user, email_data, } = verified;
  const actionLink = actionLinkFor(supabaseUrl, email_data,);

  let redirectPathname: string;
  try {
    redirectPathname = new URL(email_data.redirect_to,).pathname;
  } catch {
    redirectPathname = '/';
  }
  const locale = extractLocale(redirectPathname,);

  const { subject, htmlContent, } = emailContentFor(email_data.email_action_type, locale, actionLink,);

  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL',) ?? 'coreverseengine@gmail.com';
  const senderName = Deno.env.get('BREVO_SENDER_NAME',) ?? 'CoreVerse Engine';

  try {
    const brevoResponse = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail, },
        to: [{ email: user.email, },],
        subject,
        htmlContent,
      },),
    },);

    if (!brevoResponse.ok) {
      console.error(`send-email: Brevo responded with ${brevoResponse.status}:`, await brevoResponse.text(),);
      return new Response('email provider error', { status: 500, },);
    }
  } catch (err) {
    console.error('send-email: fetch to Brevo failed:', err,);
    return new Response('email provider error', { status: 500, },);
  }

  return new Response(null, { status: 200, },);
},);
