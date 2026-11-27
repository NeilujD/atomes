// The GitHub Releases answer for tests and CHANGELOG_SOURCE=recorded
// (`changelog.ts`): the real v1.0.0 Release, recorded on 2026-11-24, and a
// sample v1.1.0 with every category. A server always runs a published
// Release, so when the version of package.json is not recorded (a release PR
// bumps it), an empty Release of that version comes first. A built server
// never holds this file.
import { version } from '../../../package.json';
import recorded from './changelog.fixture.json';

const tag = `v${version}`;
const running = {
  tag_name: tag,
  name: tag,
  body: '',
  draft: false,
  prerelease: false,
  published_at: new Date().toISOString(),
  html_url: `https://github.com/NeilujD/atomes/releases/tag/${tag}`,
};
const answer = recorded.some((release) => release.tag_name === tag) ? recorded : [running, ...recorded];

export const recordedFetch = (): Promise<Response> => Promise.resolve(Response.json(answer));
