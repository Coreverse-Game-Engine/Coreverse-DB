import { type WebsiteLocale, } from '../_shared/locales.ts';

export type EmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
};

export type HookPayload = {
  user: { email: string };
  email_data: EmailData;
};

// Verbatim from the Website's src/constants/i18n.json (auth.resetEmail.*
// per locale) -- keep these two in sync by hand if either changes; see
// index.ts's module comment for why this project doesn't share a
// translations package with the Website.
const RESET_EMAIL_COPY: Record<WebsiteLocale, { subject: string; body: string; cta: string }> = {
  en: {
    subject: 'Reset your Coreverse Engine password',
    body:
      "We received a request to reset the password for your Coreverse Engine account. If you made this request, click the button below to create a new password. If you didn't request a password reset, you can safely ignore this email.",
    cta: 'Reset Password',
  },
  tr: {
    subject: 'Coreverse Engine parolanızı sıfırlayın',
    body:
      'Coreverse Engine hesabınızın parolasını sıfırlamak için bir istek aldık. Bu isteği siz yaptıysanız, yeni bir parola oluşturmak için aşağıdaki düğmeye tıklayın. Parola sıfırlama isteğinde bulunmadıysanız, bu e-postayı güvenle yok sayabilirsiniz.',
    cta: 'Parolayı Sıfırla',
  },
  fr: {
    subject: 'Réinitialisez votre mot de passe Coreverse Engine',
    body:
      "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Coreverse Engine. Si vous êtes à l'origine de cette demande, cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe. Si vous n'avez pas demandé de réinitialisation de mot de passe, vous pouvez ignorer cet e-mail en toute sécurité.",
    cta: 'Réinitialiser le mot de passe',
  },
  de: {
    subject: 'Setzen Sie Ihr Coreverse Engine-Passwort zurück',
    body:
      'Wir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Coreverse Engine-Konto erhalten. Wenn Sie diese Anfrage gestellt haben, klicken Sie auf die Schaltfläche unten, um ein neues Passwort zu erstellen. Falls Sie kein Zurücksetzen des Passworts angefordert haben, können Sie diese E-Mail einfach ignorieren.',
    cta: 'Passwort zurücksetzen',
  },
  es: {
    subject: 'Restablece tu contraseña de Coreverse Engine',
    body:
      'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Coreverse Engine. Si realizaste esta solicitud, haz clic en el botón de abajo para crear una nueva contraseña. Si no solicitaste el restablecimiento de la contraseña, puedes ignorar este correo electrónico con seguridad.',
    cta: 'Restablecer contraseña',
  },
  pt: {
    subject: 'Redefina a sua palavra-passe do Coreverse Engine',
    body:
      'Recebemos um pedido para redefinir a palavra-passe da sua conta Coreverse Engine. Se fez este pedido, clique no botão abaixo para criar uma nova palavra-passe. Se não solicitou a redefinição da palavra-passe, pode ignorar este e-mail com segurança.',
    cta: 'Redefinir palavra-passe',
  },
  cn: {
    subject: '重置您的 Coreverse Engine 密码',
    body:
      '我们收到了重置您的 Coreverse Engine 账户密码的请求。如果这是您本人发起的请求，请点击下方按钮创建新密码。如果您没有请求重置密码，可以放心忽略此邮件。',
    cta: '重置密码',
  },
  ru: {
    subject: 'Сбросьте пароль Coreverse Engine',
    body:
      'Мы получили запрос на сброс пароля для вашей учетной записи Coreverse Engine. Если вы отправили этот запрос, нажмите кнопку ниже, чтобы создать новый пароль. Если вы не запрашивали сброс пароля, можете спокойно проигнорировать это письмо.',
    cta: 'Сбросить пароль',
  },
  jp: {
    subject: 'Coreverse Engineのパスワードをリセット',
    body:
      'Coreverse Engineアカウントのパスワードをリセットするリクエストを受け付けました。このリクエストを行った場合は、以下のボタンをクリックして新しいパスワードを作成してください。パスワードのリセットをリクエストしていない場合は、このメールは無視していただいて問題ありません。',
    cta: 'パスワードをリセット',
  },
  kr: {
    subject: 'Coreverse Engine 비밀번호 재설정',
    body:
      'Coreverse Engine 계정의 비밀번호를 재설정해 달라는 요청을 받았습니다. 이 요청을 직접 하셨다면 아래 버튼을 클릭하여 새 비밀번호를 생성해 주세요. 비밀번호 재설정을 요청하지 않으셨다면 이 이메일은 무시하셔도 됩니다.',
    cta: '비밀번호 재설정',
  },
  pl: {
    subject: 'Zresetuj hasło do Coreverse Engine',
    body:
      'Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta Coreverse Engine. Jeśli to Ty wysłałeś tę prośbę, kliknij poniższy przycisk, aby utworzyć nowe hasło. Jeśli nie prosiłeś o zresetowanie hasła, możesz bezpiecznie zignorować tę wiadomość e-mail.',
    cta: 'Zresetuj hasło',
  },
  in: {
    subject: 'अपना Coreverse Engine पासवर्ड रीसेट करें',
    body:
      'हमें आपके Coreverse Engine खाते का पासवर्ड रीसेट करने का अनुरोध प्राप्त हुआ है। यदि आपने यह अनुरोध किया है, तो नया पासवर्ड बनाने के लिए नीचे दिए गए बटन पर क्लिक करें। यदि आपने पासवर्ड रीसेट का अनुरोध नहीं किया है, तो आप इस ईमेल को सुरक्षित रूप से अनदेखा कर सकते हैं।',
    cta: 'पासवर्ड रीसेट करें',
  },
  sa: {
    subject: 'إعادة تعيين كلمة مرور Coreverse Engine الخاصة بك',
    body:
      'تلقينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك في Coreverse Engine. إذا كنت قد قدمت هذا الطلب، فانقر على الزر أدناه لإنشاء كلمة مرور جديدة. إذا لم تطلب إعادة تعيين كلمة المرور، فيمكنك تجاهل هذا البريد الإلكتروني بأمان.',
    cta: 'إعادة تعيين كلمة المرور',
  },
};

export function actionLinkFor(supabaseUrl: string, data: EmailData,): string {
  const params = new URLSearchParams({
    token: data.token_hash,
    type: data.email_action_type,
    redirect_to: data.redirect_to,
  },);
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

// No localized copy for anything besides 'recovery' yet -- see
// index.ts's module comment. Any other action_type still gets a
// working link rather than being dropped or erroring, since a non-2xx
// from the hook fails the underlying Auth action for the end user, not
// just the email.
export function emailContentFor(
  actionType: string,
  locale: WebsiteLocale,
  actionLink: string,
): { subject: string; htmlContent: string } {
  if (actionType === 'recovery') {
    const copy = RESET_EMAIL_COPY[locale];
    return {
      subject: copy.subject,
      htmlContent: `<p>${copy.body}</p><p><a href="${actionLink}">${copy.cta}</a></p>`,
    };
  }

  return {
    subject: 'Coreverse Engine',
    htmlContent: `<p>Please use the link below to continue (action: ${actionType}).</p>` +
      `<p><a href="${actionLink}">${actionLink}</a></p>`,
  };
}
