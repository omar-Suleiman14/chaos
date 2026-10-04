// Adapted from sales-crm/components/_common/sidebar/sidebar-nav-item.tsx.
import type { LucideIcon } from "lucide-react";

export default function SidebarNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="crm-nav-item"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{label}</span>
    </button>
  );
}
