// The Lucide icons the app uses (https://lucide.dev). Add one here before using it.
import ArrowLeft from '@lucide/astro/icons/arrow-left';
import ArrowRight from '@lucide/astro/icons/arrow-right';
import Bell from '@lucide/astro/icons/bell';
import BookOpen from '@lucide/astro/icons/book-open';
import BookPlus from '@lucide/astro/icons/book-plus';
import Bug from '@lucide/astro/icons/bug';
import ChartColumn from '@lucide/astro/icons/chart-column';
import Check from '@lucide/astro/icons/check';
import ChevronDown from '@lucide/astro/icons/chevron-down';
import CircleExclamationPoint from '@lucide/astro/icons/circle-exclamation-point';
import ClipboardPaste from '@lucide/astro/icons/clipboard-paste';
import CodeXml from '@lucide/astro/icons/code-xml';
import Database from '@lucide/astro/icons/database';
import Download from '@lucide/astro/icons/download';
import Ellipsis from '@lucide/astro/icons/ellipsis';
import Handshake from '@lucide/astro/icons/handshake';
import Heart from '@lucide/astro/icons/heart';
import House from '@lucide/astro/icons/house';
import Keyboard from '@lucide/astro/icons/keyboard';
import Languages from '@lucide/astro/icons/languages';
import Layers from '@lucide/astro/icons/layers';
import Library from '@lucide/astro/icons/library';
import Lock from '@lucide/astro/icons/lock';
import LogOut from '@lucide/astro/icons/log-out';
import Menu from '@lucide/astro/icons/menu';
import Minus from '@lucide/astro/icons/minus';
import Monitor from '@lucide/astro/icons/monitor';
import Moon from '@lucide/astro/icons/moon';
import Plus from '@lucide/astro/icons/plus';
import RefreshCw from '@lucide/astro/icons/refresh-cw';
import Scale from '@lucide/astro/icons/scale';
import ScanBarcode from '@lucide/astro/icons/scan-barcode';
import Search from '@lucide/astro/icons/search';
import Server from '@lucide/astro/icons/server';
import Settings from '@lucide/astro/icons/settings';
import Share from '@lucide/astro/icons/share';
import ShoppingBag from '@lucide/astro/icons/shopping-bag';
import Sparkles from '@lucide/astro/icons/sparkles';
import Sun from '@lucide/astro/icons/sun';
import Tag from '@lucide/astro/icons/tag';
import Trash from '@lucide/astro/icons/trash';
import TrendingUp from '@lucide/astro/icons/trending-up';
import User from '@lucide/astro/icons/user';
import WifiOff from '@lucide/astro/icons/wifi-off';
import Wrench from '@lucide/astro/icons/wrench';
import X from '@lucide/astro/icons/x';

export const icons = {
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  bell: Bell,
  'book-open': BookOpen,
  'book-plus': BookPlus,
  bug: Bug,
  'chart-column': ChartColumn,
  check: Check,
  'chevron-down': ChevronDown,
  'circle-exclamation-point': CircleExclamationPoint,
  'clipboard-paste': ClipboardPaste,
  'code-xml': CodeXml,
  database: Database,
  download: Download,
  ellipsis: Ellipsis,
  handshake: Handshake,
  heart: Heart,
  house: House,
  keyboard: Keyboard,
  languages: Languages,
  layers: Layers,
  library: Library,
  lock: Lock,
  'log-out': LogOut,
  menu: Menu,
  minus: Minus,
  monitor: Monitor,
  moon: Moon,
  plus: Plus,
  'refresh-cw': RefreshCw,
  scale: Scale,
  'scan-barcode': ScanBarcode,
  search: Search,
  server: Server,
  settings: Settings,
  share: Share,
  'shopping-bag': ShoppingBag,
  sparkles: Sparkles,
  sun: Sun,
  tag: Tag,
  trash: Trash,
  'trending-up': TrendingUp,
  user: User,
  'wifi-off': WifiOff,
  wrench: Wrench,
  x: X,
};

export type IconName = keyof typeof icons;
