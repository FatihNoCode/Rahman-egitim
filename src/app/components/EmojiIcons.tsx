import type { LucideIcon } from 'lucide-react';

/**
 * Emoji stand-ins for the Lucide icons the app used to draw.
 *
 * Every export here has the same name and the same call signature as the
 * lucide-react icon it replaces, so call sites keep their `className` and
 * nothing else had to change. Three icons stayed on Lucide on purpose:
 * Loader2 has to spin, and Shield / ShieldCheck carry the security colour.
 *
 * Emoji are bitmaps, so they ignore `text-*` colour classes. The size comes
 * from the first `h-<n>` Tailwind class on the element (h-4 -> 1rem); an
 * arbitrary value like `h-[18px]` is read as well. Responsive variants such
 * as `sm:h-8` only change the box, not the glyph, which is why the base
 * class decides the glyph size.
 */

const REM_PER_UNIT = 0.25;

function glyphSize(className?: string): string {
  if (!className) return '1.5rem';
  const arbitrary = className.match(/(?:^|\s)h-\[([0-9.]+)(px|rem|em)\]/);
  if (arbitrary) return arbitrary[1] + arbitrary[2];
  const scale = className.match(/(?:^|\s)h-([0-9]+(?:\.[0-9]+)?)(?:\s|$)/);
  if (scale) return Number(scale[1]) * REM_PER_UNIT + 'rem';
  return '1.5rem';
}

interface EmojiIconProps {
  className?: string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  title?: string;
}

const EMOJI_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function make(glyph: string) {
  const Icon = ({ className, style, ...rest }: EmojiIconProps) => (
    <span
      className={className}
      aria-hidden={rest['aria-label'] ? undefined : true}
      role={rest['aria-label'] ? 'img' : undefined}
      aria-label={rest['aria-label']}
      title={rest.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: glyphSize(className),
        lineHeight: 1,
        fontFamily: EMOJI_STACK,
        fontStyle: 'normal',
        ...style,
      }}
    >
      {glyph}
    </span>
  );
  // Call sites (and the Sidebar/nav config) are typed against LucideIcon.
  return Icon as unknown as LucideIcon;
}

export const Check = make('✔️');
export const CheckCircle2 = make('✅');
export const X = make('✖️');
export const XCircle = make('❌');
export const AlertTriangle = make('⚠️');
export const Info = make('ℹ️');
export const Circle = make('⚪');
export const Square = make('⬜');
export const CheckSquare = make('☑️');
export const Frown = make('😞');
export const Meh = make('😐');
export const Smile = make('😊');
export const PartyPopper = make('🎉');
export const Sparkles = make('✨');
export const Star = make('⭐');
export const Award = make('🏅');
export const Lock = make('🔒');
export const KeyRound = make('🔑');
export const ChevronDown = make('🔽');
export const ChevronUp = make('🔼');
export const ChevronRight = make('▶️');
export const ChevronLeft = make('◀️');
export const ArrowLeft = make('⬅️');
export const ArrowRight = make('➡️');
export const ArrowUp = make('⬆️');
export const ArrowDown = make('⬇️');
export const ArrowUpDown = make('↕️');
export const ArrowLeftRight = make('↔️');
export const CornerDownLeft = make('↩️');
export const MoreHorizontal = make('⋯');
export const GripVertical = make('⠿');
export const Home = make('🏠');
export const LayoutGrid = make('🔳');
export const Layers = make('🗂️');
export const Trash2 = make('🗑️');
export const Plus = make('➕');
export const Send = make('📤');
export const Pencil = make('✏️');
export const PenLine = make('🖊️');
export const RefreshCw = make('🔄');
export const RotateCcw = make('🔄');
export const Copy = make('📋');
export const Search = make('🔍');
export const Upload = make('📤');
export const Download = make('📥');
export const Share2 = make('🔗');
export const Printer = make('🖨️');
export const Play = make('▶️');
export const PlayCircle = make('▶️');
export const StopCircle = make('⏹️');
export const Undo2 = make('↩️');
export const Redo2 = make('↪️');
export const ExternalLink = make('🔗');
export const Eye = make('👁️');
export const EyeOff = make('🙈');
export const SlidersHorizontal = make('🎛️');
export const Settings = make('⚙️');
export const Settings2 = make('⚙️');
export const Tag = make('🏷️');
export const Paperclip = make('📎');
export const Users = make('👥');
export const UsersRound = make('👥');
export const User = make('👤');
export const UserRound = make('👤');
export const UserCircle2 = make('👤');
export const UserPlus = make('🙋');
export const GraduationCap = make('🎓');
export const School = make('🏫');
export const Building2 = make('🏢');
export const BookOpen = make('📖');
export const BookX = make('📕');
export const ClipboardList = make('📋');
export const ClipboardCheck = make('📋');
export const ListOrdered = make('🔢');
export const Table = make('🧾');
export const FileText = make('📄');
export const FileSpreadsheet = make('📊');
export const FolderOpen = make('📂');
export const Archive = make('🗄️');
export const Calendar = make('📅');
export const CalendarDays = make('🗓️');
export const CalendarCheck = make('🗓️');
export const CalendarClock = make('⏰');
export const CalendarX = make('🗓️');
export const CalendarX2 = make('🗓️');
export const Clock = make('🕒');
export const History = make('🕘');
export const Activity = make('📈');
export const Mail = make('✉️');
export const MessageSquare = make('💬');
export const MessageCircle = make('💬');
export const MessageCircleQuestion = make('❓');
export const Bell = make('🔔');
export const BellRing = make('🔔');
export const Phone = make('📞');
export const Inbox = make('📥');
export const Radio = make('📻');
export const LifeBuoy = make('🛟');
export const BarChart3 = make('📊');
export const BarChart2 = make('📊');
export const TrendingDown = make('📉');
export const Euro = make('💶');
export const Wallet = make('👛');
export const Receipt = make('🧾');
export const Moon = make('🌙');
export const Sun = make('☀️');
export const SunMoon = make('🌗');
export const Monitor = make('🖥️');
export const Wifi = make('📶');
export const WifiOff = make('📵');
export const Globe = make('🌍');
export const Map = make('🗺️');
export const MapPin = make('📍');
export const LogOut = make('🚪');
