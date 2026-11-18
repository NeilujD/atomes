// The HTML part of the code mails (mail.ts). The mail also has a plain text
// part with the same code. No image and no web font: the mail loads nothing,
// so opening it tells no one, and the logo is drawn in HTML: the mark of
// Mark.astro, its faint spine mixed from theme.css by scripts/icons.ts
// (mail-mark.ts). Every value is escaped: the address is the reader's input.
import type { Language } from '../i18n/i18n';
import { faintSpine } from './mail-mark';

export interface CodeMailWords {
  title: string;
  preheader: string;
  heading: string;
  lead: string;
  expiresBefore: string;
  expiresMinutes: string;
  expiresAfter: string;
  ignore: string;
  neverAsk: string;
  sentTo: string;
  reason: string;
  private: string;
}

const font = "'Schibsted Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// `site`: the origin of the instance (settings.ts), never of the request.
export function codeMailHtml({ language, code, site, words }: { language: Language; code: string; site: string; words: CodeMailWords }): string {
  const w = Object.fromEntries((Object.entries(words) as [keyof CodeMailWords, string][]).map(([key, value]) => [key, escapeHtml(value)])) as unknown as CodeMailWords;
  const host = escapeHtml(new URL(site).host);
  const href = escapeHtml(new URL(site).origin);
  const c = escapeHtml(code);
  return `<!doctype html>
<html lang="${language}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${w.title}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,div,p,a,span{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  a { text-decoration:none; }
  .code { -webkit-user-select:all; user-select:all; }

  /* Phones */
  @media only screen and (max-width:480px) {
    .px  { padding-left:24px !important; padding-right:24px !important; }
    .pt  { padding-top:32px !important; }
    .h1  { font-size:24px !important; }
    .code{ font-size:34px !important; letter-spacing:8px !important; }
  }

  /* Dark mode: Apple Mail, iOS Mail, Outlook macOS/iOS, Hey, Fastmail */
  @media (prefers-color-scheme: dark) {
    .bg-g    { background-color:#121317 !important; }
    .bg-s    { background-color:#1B1D22 !important; }
    .bg-soft { background-color:#25282E !important; }
    .bd-line { border-color:#2C2F36 !important; }
    .t-ink   { color:#F1F1EC !important; }
    .t-gr    { color:#A3A7B0 !important; }
    .t-co    { color:#8A9BFF !important; }
    .sp-ink  { background-color:#F1F1EC !important; }
    .sp-fa   { background-color:${faintSpine.dark} !important; }
    .sp-co   { background-color:#8A9BFF !important; }
  }
  /* Dark mode: Outlook.com and Outlook apps that rewrite colours */
  [data-ogsc] .bg-g    { background-color:#121317 !important; }
  [data-ogsc] .bg-s    { background-color:#1B1D22 !important; }
  [data-ogsc] .bg-soft { background-color:#25282E !important; }
  [data-ogsc] .bd-line { border-color:#2C2F36 !important; }
  [data-ogsc] .t-ink   { color:#F1F1EC !important; }
  [data-ogsc] .t-gr    { color:#A3A7B0 !important; }
  [data-ogsc] .t-co    { color:#8A9BFF !important; }
  [data-ogsb] .sp-ink  { background-color:#F1F1EC !important; }
  [data-ogsb] .sp-fa   { background-color:${faintSpine.dark} !important; }
  [data-ogsb] .sp-co   { background-color:#8A9BFF !important; }
</style>
</head>
<body class="bg-g" style="margin:0; padding:0; background-color:#F6F6F3;">

<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F6F6F3; opacity:0;">
  ${w.preheader}
  &#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-g" style="background-color:#F6F6F3;">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <tr>
          <td class="px" style="padding:0 40px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="bottom" style="padding-right:2px;"><div class="sp-ink" style="width:4px; height:22px; background-color:#17181C; border-radius:1px; font-size:0; line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px;"><div class="sp-ink" style="width:4px; height:22px; background-color:#17181C; border-radius:1px; font-size:0; line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px;"><div class="sp-fa" style="width:4px; height:22px; background-color:${faintSpine.light}; border-radius:1px; font-size:0; line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:10px;"><div class="sp-co" style="width:4px; height:22px; background-color:#2E46D1; border-radius:1px; font-size:0; line-height:0;">&nbsp;</div></td>
                <td valign="middle" class="t-ink" style="font-family:${font}; font-size:22px; line-height:22px; font-weight:700; letter-spacing:-0.6px; color:#17181C;">atomes</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="bg-s bd-line" style="background-color:#FFFFFF; border:1px solid #E3E3DE; border-radius:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <tr>
                <td class="px pt" style="padding:40px 40px 0;">
                  <h1 class="h1 t-ink" style="margin:0; font-family:${font}; font-size:28px; line-height:1.15; font-weight:700; letter-spacing:-0.8px; color:#17181C;">${w.heading}</h1>
                  <p class="t-gr" style="margin:12px 0 0; font-family:${font}; font-size:15px; line-height:1.55; color:#5C606A;">${w.lead}</p>
                </td>
              </tr>

              <tr>
                <td class="px" style="padding:28px 40px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" class="bg-soft" style="background-color:#ECECE6; border-radius:12px; padding:22px 12px;">
                        <span class="code t-ink" style="font-family:ui-monospace,'SF Mono','Roboto Mono',Menlo,Consolas,monospace; font-size:40px; line-height:44px; font-weight:700; letter-spacing:12px; color:#17181C; mso-line-height-rule:exactly;">${c}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td class="px" style="padding:16px 40px 0;">
                  <p class="t-gr" style="margin:0; font-family:${font}; font-size:14px; line-height:1.5; color:#5C606A;">
                    ${w.expiresBefore} <strong class="t-ink" style="color:#17181C; font-weight:600;">${w.expiresMinutes}</strong> ${w.expiresAfter}
                  </p>
                </td>
              </tr>

              <tr>
                <td class="px" style="padding:32px 40px 0;">
                  <div class="bd-line" style="height:0; border-top:1px solid #E3E3DE; font-size:0; line-height:0;">&nbsp;</div>
                </td>
              </tr>

              <tr>
                <td class="px" style="padding:24px 40px 40px;">
                  <p class="t-gr" style="margin:0; font-family:${font}; font-size:13px; line-height:1.6; color:#5C606A;">
                    ${w.ignore}
                  </p>
                  <p class="t-gr" style="margin:12px 0 0; font-family:${font}; font-size:13px; line-height:1.6; color:#5C606A;">
                    ${w.neverAsk}
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:24px 40px 0;">
            <p class="t-gr" style="margin:0; font-family:${font}; font-size:12px; line-height:1.6; color:#5C606A;">
              ${w.sentTo} ${w.reason}
              <a href="${href}" class="t-co" style="color:#2E46D1; font-weight:600; text-decoration:none;">${host}</a>.
              ${w.private}
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>
</body>
</html>
`;
}
