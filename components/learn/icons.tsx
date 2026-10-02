import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Atom,
  Award,
  Bookmark,
  BookOpen,
  Bot,
  Brain,
  Calculator,
  Camera,
  CheckCircle2,
  Clock,
  Code,
  Compass,
  Cpu,
  Database,
  Dna,
  Feather,
  FileText,
  Film,
  Flame,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  HelpCircle,
  Landmark,
  Languages,
  Layers,
  Library,
  Lightbulb,
  MapPin,
  Microscope,
  Music,
  Network,
  Palette,
  PenTool,
  Rocket,
  School,
  Shield,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  Telescope,
  Terminal,
  Trophy,
  Zap,
} from "lucide-react";

export const LUCIDE_LEARN_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  GraduationCap,
  Lightbulb,
  Brain,
  Compass,
  Sparkles,
  School,
  Library,
  Atom,
  FlaskConical,
  Calculator,
  Dna,
  Telescope,
  Microscope,
  Stethoscope,
  Globe,
  Code,
  Cpu,
  Terminal,
  Database,
  Network,
  Layers,
  Bot,
  Rocket,
  Palette,
  Music,
  Camera,
  PenTool,
  Feather,
  Languages,
  Landmark,
  Film,
  Star,
  Award,
  Trophy,
  Target,
  Flame,
  Zap,
  Heart,
  Smile,
  CheckCircle2,
  Bookmark,
  Folder,
  FileText,
  HelpCircle,
  Clock,
  Shield,
  MapPin,
};

export const LEARN_ICON_NAMES = Object.keys(LUCIDE_LEARN_ICONS);

export const NOTION_ICON_COLORS = [
  { id: "default", label: "Default", color: "#9B9A97", border: "#E3E2E0" },
  { id: "gray", label: "Gray", color: "#787774", border: "#9B9A97" },
  { id: "brown", label: "Brown", color: "#976D57", border: "#A26B47" },
  { id: "yellow", label: "Yellow", color: "#DFAB01", border: "#CCA028" },
  { id: "orange", label: "Orange", color: "#D9730D", border: "#C7651A" },
  { id: "green", label: "Green", color: "#0F7B6C", border: "#2E8B57" },
  { id: "blue", label: "Blue", color: "#0B6E99", border: "#277DC5" },
  { id: "purple", label: "Purple", color: "#6940A5", border: "#9065B0" },
  { id: "pink", label: "Pink", color: "#AD1A72", border: "#C14C8A" },
  { id: "red", label: "Red", color: "#E03E3E", border: "#D44C47" },
] as const;

export type NotionIconColorId = (typeof NOTION_ICON_COLORS)[number]["id"];

export function parseIconWithColor(raw?: string | null): { name: string; colorId?: NotionIconColorId; hex?: string } {
  if (!raw) return { name: "" };
  const parts = raw.split(":");
  const name = parts[0];
  const colorId = (parts[1] ?? "default") as NotionIconColorId;
  const match = NOTION_ICON_COLORS.find((c) => c.id === colorId);
  return {
    name,
    colorId: match ? colorId : undefined,
    hex: match && match.id !== "default" ? match.color : undefined,
  };
}

export function CourseOrLessonIcon({
  icon,
  size = 24,
  className,
  color,
}: {
  icon?: string | null;
  size?: number;
  className?: string;
  color?: string;
}) {
  if (!icon) return null;
  const parsed = parseIconWithColor(icon);
  const IconComponent = LUCIDE_LEARN_ICONS[parsed.name] ?? LUCIDE_LEARN_ICONS[icon];
  const activeColor = color ?? parsed.hex;
  if (IconComponent) {
    return (
      <IconComponent
        size={size}
        className={className}
        style={activeColor ? { color: activeColor } : undefined}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={className}
      style={activeColor ? { color: activeColor } : undefined}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
