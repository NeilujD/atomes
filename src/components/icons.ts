// The Lucide icons the app uses (https://lucide.dev). Add one here before using it.
import ArrowLeft from '@lucide/astro/icons/arrow-left';
import Bell from '@lucide/astro/icons/bell';
import BookPlus from '@lucide/astro/icons/book-plus';
import House from '@lucide/astro/icons/house';
import Keyboard from '@lucide/astro/icons/keyboard';
import Library from '@lucide/astro/icons/library';
import Lock from '@lucide/astro/icons/lock';
import Monitor from '@lucide/astro/icons/monitor';
import Moon from '@lucide/astro/icons/moon';
import Plus from '@lucide/astro/icons/plus';
import ScanBarcode from '@lucide/astro/icons/scan-barcode';
import Search from '@lucide/astro/icons/search';
import Settings from '@lucide/astro/icons/settings';
import ShoppingBag from '@lucide/astro/icons/shopping-bag';
import Sun from '@lucide/astro/icons/sun';
import Trash from '@lucide/astro/icons/trash';
import User from '@lucide/astro/icons/user';

export const icons = {
  'arrow-left': ArrowLeft,
  bell: Bell,
  'book-plus': BookPlus,
  house: House,
  keyboard: Keyboard,
  library: Library,
  lock: Lock,
  monitor: Monitor,
  moon: Moon,
  plus: Plus,
  'scan-barcode': ScanBarcode,
  search: Search,
  settings: Settings,
  'shopping-bag': ShoppingBag,
  sun: Sun,
  trash: Trash,
  user: User,
};

export type IconName = keyof typeof icons;
