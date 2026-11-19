// The Lucide icons the app uses (https://lucide.dev). Add one here before using it.
import ArrowLeft from '@lucide/astro/icons/arrow-left';
import ArrowRight from '@lucide/astro/icons/arrow-right';
import BookOpen from '@lucide/astro/icons/book-open';
import CodeXml from '@lucide/astro/icons/code-xml';
import Database from '@lucide/astro/icons/database';
import Download from '@lucide/astro/icons/download';
import Heart from '@lucide/astro/icons/heart';
import Languages from '@lucide/astro/icons/languages';
import Menu from '@lucide/astro/icons/menu';
import Scale from '@lucide/astro/icons/scale';
import Server from '@lucide/astro/icons/server';
import Tag from '@lucide/astro/icons/tag';
import Bell from '@lucide/astro/icons/bell';
import BookPlus from '@lucide/astro/icons/book-plus';
import ChartColumn from '@lucide/astro/icons/chart-column';
import Check from '@lucide/astro/icons/check';
import ClipboardPaste from '@lucide/astro/icons/clipboard-paste';
import ChevronDown from '@lucide/astro/icons/chevron-down';
import Ellipsis from '@lucide/astro/icons/ellipsis';
import Handshake from '@lucide/astro/icons/handshake';
import House from '@lucide/astro/icons/house';
import Keyboard from '@lucide/astro/icons/keyboard';
import Layers from '@lucide/astro/icons/layers';
import Library from '@lucide/astro/icons/library';
import Lock from '@lucide/astro/icons/lock';
import LogOut from '@lucide/astro/icons/log-out';
import Minus from '@lucide/astro/icons/minus';
import Monitor from '@lucide/astro/icons/monitor';
import Moon from '@lucide/astro/icons/moon';
import Plus from '@lucide/astro/icons/plus';
import RefreshCw from '@lucide/astro/icons/refresh-cw';
import ScanBarcode from '@lucide/astro/icons/scan-barcode';
import Search from '@lucide/astro/icons/search';
import Settings from '@lucide/astro/icons/settings';
import Share from '@lucide/astro/icons/share';
import ShoppingBag from '@lucide/astro/icons/shopping-bag';
import Sun from '@lucide/astro/icons/sun';
import Trash from '@lucide/astro/icons/trash';
import User from '@lucide/astro/icons/user';
import WifiOff from '@lucide/astro/icons/wifi-off';
import X from '@lucide/astro/icons/x';

export const icons = {
  'arrow-right': ArrowRight,
  'book-open': BookOpen,
  'code-xml': CodeXml,
  database: Database,
  download: Download,
  heart: Heart,
  languages: Languages,
  menu: Menu,
  scale: Scale,
  server: Server,
  tag: Tag,
  'arrow-left': ArrowLeft,
  bell: Bell,
  'book-plus': BookPlus,
  'chart-column': ChartColumn,
  check: Check,
  'clipboard-paste': ClipboardPaste,
  'chevron-down': ChevronDown,
  ellipsis: Ellipsis,
  handshake: Handshake,
  house: House,
  keyboard: Keyboard,
  layers: Layers,
  library: Library,
  lock: Lock,
  'log-out': LogOut,
  minus: Minus,
  monitor: Monitor,
  moon: Moon,
  plus: Plus,
  'refresh-cw': RefreshCw,
  'scan-barcode': ScanBarcode,
  search: Search,
  settings: Settings,
  share: Share,
  'shopping-bag': ShoppingBag,
  sun: Sun,
  trash: Trash,
  user: User,
  'wifi-off': WifiOff,
  x: X,
};

export type IconName = keyof typeof icons;
