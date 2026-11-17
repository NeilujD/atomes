import { describe, expect, test } from 'vitest';
import { devOutbox, linkCodeMail, signInCodeMail, smtpSender } from './mail';

const site = 'https://atomes.example.org';

describe('the code mails', () => {
  test.each([
    ['en', '042917 is your Atomes sign-in code', 'Your sign-in code', 'Your sign-in code'],
    ['fr', '042917 est votre code de connexion Atomes', 'Votre code de connexion', 'Votre code de connexion'],
  ] as const)('%s: the code first in the subject, a plain text part and an HTML part', (language, subject, text, heading) => {
    const mail = signInCodeMail('reader@example.org', '042917', language, site);

    expect(mail).toMatchObject({ to: 'reader@example.org', subject });
    expect(mail.text).toContain(text);
    expect(mail.text).toContain('042917');
    expect(mail.text).not.toMatch(/https?:|www\.|<[a-z]/i);
    expect(mail.html).toContain(`<html lang="${language}"`);
    expect(mail.html).toContain(heading);
    expect(mail.html).toContain('>042917</span>');
    expect(mail.html).toContain('10 minutes');
  });

  test('the HTML part loads nothing, and its only link is the origin of the instance', () => {
    const { html } = signInCodeMail('reader@example.org', '042917', 'en', site);

    expect(html).not.toMatch(/<link|<img|<script|src=|url\(/i);
    expect([...html!.matchAll(/href="([^"]*)"/g)].map(([, href]) => href)).toEqual([site]);
  });

  test('the address the reader typed is escaped in the HTML part', () => {
    const to = '"><img src=x>@example.org';
    const { html } = linkCodeMail(to, '042917', 'en', site);

    expect(html).not.toContain('<img');
    expect(html).toContain('Sent to &#34;&#62;&#60;img src=x&#62;@example.org');
  });

  test('the mail that adds an address says so', () => {
    const mail = linkCodeMail('reader@example.org', '042917', 'fr', site);

    expect(mail.subject).toBe('042917 ajoute cette adresse à votre compte Atomes');
    expect(mail.html).toContain('Ajouter cette adresse');
  });
});

describe('smtpSender', () => {
  test('sends through the transport, from MAIL_FROM, with both parts', async () => {
    const sent: unknown[] = [];
    const send = smtpSender(
      {
        sendMail: (message) => {
          sent.push(message);
          return Promise.resolve({});
        },
      },
      'Atomes <atomes@example.org>',
    );

    await send({ to: 'reader@example.org', subject: 'Subject', text: 'Body', html: '<p>Body</p>' });

    expect(sent).toEqual([{ from: 'Atomes <atomes@example.org>', to: 'reader@example.org', subject: 'Subject', text: 'Body', html: '<p>Body</p>' }]);
  });

  test('a transport failure rejects', async () => {
    const send = smtpSender({ sendMail: () => Promise.reject(new Error('connection refused')) }, 'atomes@example.org');

    await expect(send({ to: 'reader@example.org', subject: 'S', text: 'T' })).rejects.toThrow('connection refused');
  });
});

describe('devOutbox', () => {
  test('keeps the last mail of each address, and sends nothing', async () => {
    const outbox = devOutbox();

    await outbox.send({ to: 'reader@example.org', subject: 'S', text: 'first' });
    await outbox.send({ to: 'reader@example.org', subject: 'S', text: 'second' });

    expect(outbox.last('reader@example.org')?.text).toBe('second');
    expect(outbox.last('other@example.org')).toBeUndefined();
  });
});
