// Email from the instance (ADR 0016, "Sign-in"): one sender over SMTP
// (Nodemailer), so the provider is one setting (SMTP_URL, MAIL_FROM). The
// transport is given: tests and the dev server send nothing. In development
// and E2E the mails go to an outbox in memory, read on /dev/outbox.
import { translator, type Language } from '../i18n/i18n';
import { codeMailHtml } from './mail-html';
import { codeLifetimeMs } from './sign-in-codes';

export interface Mail {
  to: string;
  subject: string;
  // The plain text part: the dev outbox shows it, and a mail app with no HTML reads it.
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export type SendMail = (mail: Mail) => Promise<void>;

// What this module needs of a Nodemailer transporter (createTransport).
export interface MailTransport {
  sendMail(message: Mail & { from: string }): Promise<unknown>;
}

// One mail with a plain text part and, when given, an HTML part.
export function smtpSender(transport: MailTransport, from: string): SendMail {
  return async ({ to, subject, text, html, headers }) => {
    await transport.sendMail({ from, to, subject, text, ...(html === undefined ? {} : { html }), ...(headers === undefined ? {} : { headers }) });
  };
}

const minutes = codeLifetimeMs / 60_000;

// A code mail in the reader's language. `site`: the origin of the instance.
function codeMail(kind: 'code' | 'link', to: string, code: string, language: Language, site: string): Mail {
  const t = translator(language);
  const subject = t(`mail.${kind}.subject`, code);
  const html = codeMailHtml({
    language,
    code,
    site,
    words: {
      title: subject,
      preheader: `${t(`mail.${kind}.lead`)} ${t('mail.expires-before')} ${t('mail.expires-minutes', minutes)}.`,
      heading: t(`mail.${kind}.heading`),
      lead: t(`mail.${kind}.lead`),
      expiresBefore: t('mail.expires-before'),
      expiresMinutes: t('mail.expires-minutes', minutes),
      expiresAfter: t('mail.expires-after'),
      ignore: t(`mail.${kind}.ignore`),
      neverAsk: t('mail.never-ask'),
      sentTo: t('mail.sent-to', to),
      reason: t(`mail.${kind}.reason`),
      private: t('mail.private'),
    },
  });
  // Bind the code to the instance for a mail app that reads them: OTP-Token
  // (draft-goto-otp-token) wants the origin, One-Time-Code (draft-wells) the host.
  const headers = { 'OTP-Token': `"${code}"; origin="${site}"`, 'One-Time-Code': `code=${code}; origin=${new URL(site).host}` };
  return { to, subject, text: t(`mail.${kind}.text`, code), html, headers };
}

// The Sign-in Code.
export const signInCodeMail = (to: string, code: string, language: Language, site: string): Mail => codeMail('code', to, code, language, site);

// The code that adds the address to an Account, from Settings (link-email.ts).
export const linkCodeMail = (to: string, code: string, language: Language, site: string): Mail => codeMail('link', to, code, language, site);

// Development only: no mail leaves. Keeps the last mail of each address.
export function devOutbox(): { send: SendMail; last(to: string): Mail | undefined } {
  const mails = new Map<string, Mail>();
  return {
    send: (mail) => {
      mails.set(mail.to, mail);
      return Promise.resolve();
    },
    last: (to) => mails.get(to),
  };
}
