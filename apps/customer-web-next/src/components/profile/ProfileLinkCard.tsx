import { Link } from "@tanstack/react-router";
import { FaChevronRight } from "react-icons/fa6";
import type { IconType } from "react-icons";

import { rememberReturnRoute } from "@/lib/return-navigation";

interface ProfileLinkCardProps {
  to?: string;
  icon: IconType;
  title: string;
  subtitle: string;
  badge?: string;
  disabled?: boolean;
}

type CardBodyProps = Omit<ProfileLinkCardProps, "to">;

function CardBody({
  icon: Icon,
  title,
  subtitle,
  badge,
  disabled = false,
}: CardBodyProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
          <Icon className="text-[19px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-[#1A1A1A] sm:text-[0.95rem]">
              {title}
            </h3>
            {badge ? (
              <span className="rounded-full bg-[#F1F3F5] px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#6B6B6B]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#6B6B6B]">
            {subtitle}
          </p>
        </div>
      </div>
      <FaChevronRight
        className={[
          "shrink-0 text-xs transition-transform",
          disabled
            ? "text-[#C9CCD0]"
            : "text-[#1A1A1A] group-hover:translate-x-0.5",
        ].join(" ")}
        aria-hidden="true"
      />
    </>
  );
}

export function ProfileLinkCard({
  to,
  icon,
  title,
  subtitle,
  badge,
  disabled = false,
}: ProfileLinkCardProps) {
  const className =
    "group flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 transition-[border-color,box-shadow,opacity] duration-200 sm:p-4";

  if (!to || disabled) {
    return (
      <div
        className={className + " cursor-default opacity-75"}
        aria-disabled="true"
      >
        <CardBody
          icon={icon}
          title={title}
          subtitle={subtitle}
          badge={badge}
          disabled
        />
      </div>
    );
  }

  return (
    <Link
      to={to}
      onClick={() => rememberReturnRoute(to, "/profile")}
      className={
        className +
        " hover:border-[#F62E18]/25 hover:shadow-[0_8px_22px_rgba(26,26,26,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/25"
      }
    >
      <CardBody
        icon={icon}
        title={title}
        subtitle={subtitle}
        badge={badge}
      />
    </Link>
  );
}

export default ProfileLinkCard;
