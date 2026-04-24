import { memo } from "react";

type VerificationBadgeKind = "verified" | "trusted";

type VerifiableProfile = Record<string, unknown> | null | undefined;

const truthyFlag = (value: unknown): boolean =>
  value === true || value === "true" || value === "verified" || value === "trusted" || value === "approved";

export const getVerificationKind = (profile: VerifiableProfile): VerificationBadgeKind | null => {
  if (!profile) return null;

  const trusted =
    truthyFlag(profile.is_trusted) ||
    truthyFlag(profile.trusted) ||
    truthyFlag(profile.trusted_account) ||
    truthyFlag(profile.manually_approved) ||
    truthyFlag(profile.manual_approval) ||
    truthyFlag(profile.approved_by_admin) ||
    truthyFlag(profile.trust_level);

  if (trusted) return "trusted";

  const verified =
    truthyFlag(profile.is_verified) ||
    truthyFlag(profile.verified) ||
    truthyFlag(profile.verified_account) ||
    truthyFlag(profile.verification_status) ||
    Boolean(profile.verified_at);

  return verified ? "verified" : null;
};

const VerificationBadge = ({ kind, className = "" }: { kind: VerificationBadgeKind | null; className?: string }) => {
  if (!kind) return null;

  const isTrusted = kind === "trusted";

  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold leading-none shadow-[0_3px_8px_rgba(0,0,0,0.16)] backdrop-blur-[6px] ${
        isTrusted
          ? "border-orange-200/20 bg-[linear-gradient(135deg,#ff6a3d_0%,#ff3b2f_100%)] text-white"
          : "border-white/20 bg-white/[0.85] text-[#1f2937]"
      } ${className}`}
      title={isTrusted ? "Проверено вручную" : "Профиль подтвержден"}
      aria-label={isTrusted ? "Проверено вручную" : "Профиль подтвержден"}
    >
      {isTrusted ? "◆" : "✓"}
    </span>
  );
};

export default memo(VerificationBadge);
