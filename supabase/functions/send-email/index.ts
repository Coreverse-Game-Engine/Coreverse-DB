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
// Why this exists: Coreverse-DB owns every Supabase Auth email (signup
// confirmation, password recovery, magic link, invite, reauthentication).
// Supabase Auth's own mailer would send its built-in, non-localized,
// differently-branded template through whatever SMTP the project has
// configured. With this hook configured, Auth hands the message to this
// function instead, which renders the per-locale copy and sends it via
// Brevo's transactional API.
//
// Links: for signup, recovery, magiclink and invite the button does not
// point at Supabase's /auth/v1/verify. It points at the Website's confirm
// route (render.ts's WEBSITE_CONFIRM_PATH) with token_hash, type and next,
// and the Website calls verifyOtp itself. That works across devices (no
// PKCE verifier cookie is needed) and does not depend on the Site URL.
// The origin comes from email_data.redirect_to and must be listed in
// WEBSITE_ALLOWED_ORIGINS; otherwise the link falls back to the Supabase
// verify URL.
//
// Coverage: this hook fires for every Supabase Auth email type once
// configured, not just password recovery -- if e.g. signup
// confirmations (auth.email.enable_confirmations), magic links or
// invites are ever enabled, those route through here too.
// render.ts's RESET_EMAIL_COPY (recovery, every WEBSITE_LOCALES entry,
// mirrored verbatim from the Website's translations) and ACTION_COPY
// (signup/magiclink/invite/reauthentication, en+tr only, falling back
// to en for any other locale) cover those action types. Anything else
// -- and 'email_change', deliberately left generic, see render.ts's
// module comment -- gets a plain English fallback with a working link
// rather than being silently dropped or erroring: returning a non-2xx
// here fails the underlying Auth action for the end user, not just the
// email, so an unhandled action_type must never turn into e.g.
// "signup failed". Before enabling any of these in an environment,
// add/extend the real copy in render.ts's ACTION_COPY rather than
// relying on the fallback or the en-only entries.
//
// Split from render.ts (the pure, testable logic -- action link
// construction, per-locale copy selection) so that index.test.ts can
// import the latter without also triggering this file's top-level
// Deno.serve(), same reasoning as every other function's
// schemas.ts/index.ts split (see docs/src/development/edge-functions.md).
// ---------------------------------------------------------------------

import { Webhook, } from 'https://esm.sh/standardwebhooks@1.0.0';
import { allowedOrigins, } from '../_shared/http.ts';
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
  const actionLink = actionLinkFor(supabaseUrl, email_data, allowedOrigins(),);

  let redirectPathname: string;
  try {
    redirectPathname = new URL(email_data.redirect_to,).pathname;
  } catch {
    redirectPathname = '/';
  }
  const locale = extractLocale(redirectPathname,);

  const { subject, htmlContent, } = emailContentFor(
    email_data.email_action_type,
    locale,
    actionLink,
    email_data.token,
  );

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
      console.error(
        `send-email: Brevo responded with ${brevoResponse.status}:`,
        await brevoResponse.text(),
      );
      return new Response('email provider error', { status: 500, },);
    }
  } catch (err) {
    console.error('send-email: fetch to Brevo failed:', err,);
    return new Response('email provider error', { status: 500, },);
  }

  return new Response(null, { status: 200, },);
},);
