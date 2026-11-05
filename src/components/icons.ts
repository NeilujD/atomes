// The Lucide icons the app uses (https://lucide.dev). Add one here before using it.
import ArrowLeft from '@lucide/astro/icons/arrow-left';
import Bell from '@lucide/astro/icons/bell';
import BookPlus from '@lucide/astro/icons/book-plus';
import Check from '@lucide/astro/icons/check';
import House from '@lucide/astro/icons/house';
import Keyboard from '@lucide/astro/icons/keyboard';
import Library from '@lucide/astro/icons/library';
import Lock from '@lucide/astro/icons/lock';
import Monitor from '@lucide/astro/icons/monitor';
import Moon from '@lucide/astro/icons/moon';
import Plus from '@lucide/astro/icons/plus';
import RefreshCw from '@lucide/astro/icons/refresh-cw';
import ScanBarcode from '@lucide/astro/icons/scan-barcode';
import Search from '@lucide/astro/icons/search';
import Settings from '@lucide/astro/icons/settings';
import ShoppingBag from '@lucide/astro/icons/shopping-bag';
import Sun from '@lucide/astro/icons/sun';
import Trash from '@lucide/astro/icons/trash';
import User from '@lucide/astro/icons/user';
import WifiOff from '@lucide/astro/icons/wifi-off';
import X from '@lucide/astro/icons/x';

export const icons = {
  'arrow-left': ArrowLeft,
  bell: Bell,
  'book-plus': BookPlus,
  check: Check,
  house: House,
  keyboard: Keyboard,
  library: Library,
  lock: Lock,
  monitor: Monitor,
  moon: Moon,
  plus: Plus,
  'refresh-cw': RefreshCw,
  'scan-barcode': ScanBarcode,
  search: Search,
  settings: Settings,
  'shopping-bag': ShoppingBag,
  sun: Sun,
  trash: Trash,
  user: User,
  'wifi-off': WifiOff,
  x: X,
};

export type IconName = keyof typeof icons;
