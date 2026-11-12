// What tells the instances apart outside production (ui-direction: Environment
// badge): the app name and icons. Outside production, the icons show the same
// mark on an orange background (`public/**/*-staging*`).
import type { AppEnv } from './server/settings';

const names: Record<AppEnv, string> = {
  production: 'Atomes',
  staging: 'Atomes Staging',
  preview: 'Atomes Preview',
  local: 'Atomes Local',
};

export interface AppIcons {
  favicon: string;
  favicon32: string;
  appleTouch: string;
  icon192: string;
  icon512: string;
  maskable192: string;
  maskable512: string;
}

const productionIcons: AppIcons = {
  favicon: '/favicon.svg',
  favicon32: '/favicon-32.png',
  appleTouch: '/apple-touch-icon-180.png',
  icon192: '/icons/atomes-icon-192.png',
  icon512: '/icons/atomes-icon-512.png',
  maskable192: '/icons/atomes-icon-maskable-192.png',
  maskable512: '/icons/atomes-icon-maskable-512.png',
};

const stagingIcons: AppIcons = {
  favicon: '/favicon-staging.svg',
  favicon32: '/favicon-staging-32.png',
  appleTouch: '/apple-touch-icon-staging-180.png',
  icon192: '/icons/atomes-icon-staging-192.png',
  icon512: '/icons/atomes-icon-staging-512.png',
  maskable192: '/icons/atomes-icon-staging-maskable-192.png',
  maskable512: '/icons/atomes-icon-staging-maskable-512.png',
};

export function appIcons(appEnv: AppEnv): AppIcons {
  return appEnv === 'production' ? productionIcons : stagingIcons;
}

// The web manifest of the installed app. Served by `src/pages/manifest.webmanifest.ts`.
export function webManifest(appEnv: AppEnv) {
  const icons = appIcons(appEnv);
  return {
    id: '/',
    name: names[appEnv],
    short_name: names[appEnv],
    description: 'Your books, series and volumes. Private by default.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f6f3',
    theme_color: '#f6f6f3',
    icons: [
      { src: icons.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icons.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icons.maskable192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: icons.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
