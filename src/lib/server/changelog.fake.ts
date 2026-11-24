// The GitHub Releases answer for tests and CHANGELOG_SOURCE=recorded
// (`changelog.ts`): the real v1.0.0 Release, recorded on 2026-11-24, and a
// sample v1.1.0 with every category. A built server never holds this file.
import answer from './changelog.fixture.json';

export const recordedFetch = (): Promise<Response> => Promise.resolve(Response.json(answer));
