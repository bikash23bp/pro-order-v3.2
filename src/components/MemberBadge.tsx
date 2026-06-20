import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMembershipPhones, useMembershipDiscount } from "@/hooks/use-membership-phones";

type Props = {
  phone: string | null | undefined;
  className?: string;
  /** When true, always show (skip phone check) */
  force?: boolean;
};

/**
 * Gold "Member" badge shown next to a customer name when their phone
 * matches a row in `membership_customers`.
 */
export function MemberBadge({ phone, className, force }: Props) {
  const { isMember } = useMembershipPhones();
  const { enabled, rate } = useMembershipDiscount();
  if (!force && !isMember(phone)) return null;
  const pct = Math.round(rate * 100);
  const title = enabled
    ? `Membership customer — auto ${pct}% discount`
    : "Membership customer — auto discount disabled";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-400/60 bg-amber-400/15 text-amber-500 text-[10px] px-1.5 py-0 font-semibold",
        className,
      )}
      title={title}
    >
      <Crown className="h-3 w-3" />
      Member
    </Badge>
  );
}
