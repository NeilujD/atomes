import { describe, expect, test } from 'vitest';
import { devOutbox, signInCodeMail, smtpSender } from './mail';

describe('the Sign-in Code mail', () => {
  test.each([
    ['en', 'Your Atomes sign-in code', 'Your sign-in code'],
    ['fr', 'Votre code de connexion Atomes', 'Votre code de connexion'],
  ] as const)('%s: plain text with the code, its 10 minutes, and nothing to click', (language, subject, body) => {
    const mail = signInCodeMail('reader@example.org', '042917', language);

    expect(mail).toMatchObject({ to: 'reader@example.org', subject });
    expect(mail.text).toContain(body);
    expect(mail.text).toContain('042917');
    expect(mail.text).toContain('10');
    expect(mail.text).not.toMatch(/https?:|www\.|<[a-z]/i);
  });
});

describe('smtpSender', () => {
  test('sends through the transport, from MAIL_FROM, as plain text only', async () => {
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

    await send({ to: 'reader@example.org', subject: 'Subject', text: 'Body' });

    expect(sent).toEqual([{ from: 'Atomes <atomes@example.org>', to: 'reader@example.org', subject: 'Subject', text: 'Body' }]);
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
