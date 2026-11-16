// Email from the instance (ADR 0016, "Sign-in"): one sender over SMTP
// (Nodemailer), so the provider is one setting (SMTP_URL, MAIL_FROM). The
// transport is given: tests and the dev server send nothing. In development
// and E2E the mails go to an outbox in memory, read on /dev/outbox.
import { translator, type Language } from '../i18n/i18n';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type SendMail = (mail: Mail) => Promise<void>;

// What this module needs of a Nodemailer transporter (createTransport).
export interface MailTransport {
  sendMail(message: Mail & { from: string }): Promise<unknown>;
}

// Plain text only: no HTML, nothing to click.
export function smtpSender(transport: MailTransport, from: string): SendMail {
  return async ({ to, subject, text }) => {
    await transport.sendMail({ from, to, subject, text });
  };
}

// The Sign-in Code, in the reader's language.
export function signInCodeMail(to: string, code: string, language: Language): Mail {
  const t = translator(language);
  return { to, subject: t('mail.code.subject'), text: t('mail.code.text', code) };
}

// The code that adds the address to an Account, from Settings (link-email.ts).
export function linkCodeMail(to: string, code: string, language: Language): Mail {
  const t = translator(language);
  return { to, subject: t('mail.link.subject'), text: t('mail.link.text', code) };
}

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
