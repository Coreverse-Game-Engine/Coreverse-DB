const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoMessage {
  to: string;
  subject: string;
  htmlContent: string;
}

// Sends one transactional email through Brevo. Throws on any non-2xx
// response or network failure so each caller decides how to surface it
// (send-email answers 500 to Supabase Auth; auth/password-reset only logs,
// because its response must not reveal whether the address has an account).
export async function sendBrevoEmail(apiKey: string, message: BrevoMessage,): Promise<void> {
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL',) ?? 'coreverseengine@gmail.com';
  const senderName = Deno.env.get('BREVO_SENDER_NAME',) ?? 'CoreVerse Engine';

  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail, },
      to: [{ email: message.to, },],
      subject: message.subject,
      htmlContent: message.htmlContent,
    },),
  },);

  if (!response.ok) {
    throw new Error(`Brevo responded with ${response.status}: ${await response.text()}`,);
  }
}
