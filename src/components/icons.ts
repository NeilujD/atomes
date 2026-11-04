// The Lucide icons the app uses (https://lucide.dev). Add one here before using it.
import Bell from '@lucide/astro/icons/bell';
import House from '@lucide/astro/icons/house';
import Library from '@lucide/astro/icons/library';
import Lock from '@lucide/astro/icons/lock';
import Monitor from '@lucide/astro/icons/monitor';
import Moon from '@lucide/astro/icons/moon';
import ScanBarcode from '@lucide/astro/icons/scan-barcode';
import Search from '@lucide/astro/icons/search';
import Settings from '@lucide/astro/icons/settings';
import ShoppingBag from '@lucide/astro/icons/shopping-bag';
import Sun from '@lucide/astro/icons/sun';
import User from '@lucide/astro/icons/user';

export const icons = {
  bell: Bell,
  house: House,
  library: Library,
  lock: Lock,
  monitor: Monitor,
  moon: Moon,
  'scan-barcode': ScanBarcode,
  search: Search,
  settings: Settings,
  'shopping-bag': ShoppingBag,
  sun: Sun,
  user: User,
};

export type IconName = keyof typeof icons;
