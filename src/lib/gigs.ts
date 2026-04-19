import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { ProfileKind } from "@/lib/profile";
import {
  getApplicationStatusClass as getNormalizedApplicationStatusClass,
  getApplicationStatusLabel as getNormalizedApplicationStatusLabel,
} from "@/lib/applications";

export type GigType = "gig" | "casting" | "residency";
export type GigStatus = "open" | "closed";
export type ApplicationStatus = "new" | "accepted" | "rejected" | "cancelled";

export type Gig = Tables<"venue_posts">;
export type GigInsert = TablesInsert<"venue_posts">;
export type GigApplication = Tables<"applications">;
export type GigApplicationInsert = TablesInsert<"applications">;

export interface LinkedProfileSummary {
  id: string;
  kind: ProfileKind;
  name: string;
  userId?: string | null;
  city?: string | null;
  avatar?: string | null;
  styles?: string[];
}

export type GigWithVenue = Gig & {
  venue_profiles: LinkedProfileSummary | null;
};

export type GigApplicationWithDj = GigApplication & {
  dj_profiles: LinkedProfileSummary | null;
};

export type GigApplicationWithGig = GigApplication & {
  venue_posts: (Gig & { venue_profiles?: LinkedProfileSummary | null }) | null;
};

export type GigApplicationForVenue = GigApplicationWithDj & {
  venue_posts: Gig | null;
};

export interface GigParticipantPair {
  venueId: string;
  djId: string;
}

export interface GigThreadAnchor extends GigParticipantPair {
  gigId: string;
  applicationId?: string;
}

export const GIG_TYPES: { value: GigType; label: string }[] = [
  { value: "gig", label: "Выступление" },
  { value: "casting", label: "Кастинг" },
  { value: "residency", label: "Резидентство" },
];

export const GIG_TYPE_FILTER_OPTIONS: { value: GigType; label: string }[] = [
  { value: "gig", label: "Выступления" },
  { value: "casting", label: "Кастинги" },
  { value: "residency", label: "Резидентства" },
];

export const GIG_DURATION_OPTIONS = [
  { value: "1 час", label: "1 час" },
  { value: "2 часа", label: "2 часа" },
  { value: "3 часа", label: "3 часа" },
  { value: "4 часа", label: "4 часа" },
  { value: "5 часов", label: "5 часов" },
  { value: "6 часов", label: "6 часов" },
] as const;

export const RESIDENCY_SCHEDULE_OPTIONS = [
  { value: "Будни", label: "Будни" },
  { value: "Выходные", label: "Выходные" },
  { value: "Пятница и суббота", label: "Пятница и суббота" },
  { value: "По договорённости", label: "По договорённости" },
] as const;

export const RESIDENCY_FREQUENCY_OPTIONS = [
  { value: "Еженедельно", label: "Еженедельно" },
  { value: "2 раза в месяц", label: "2 раза в месяц" },
  { value: "Ежемесячно", label: "Ежемесячно" },
  { value: "По договорённости", label: "По договорённости" },
] as const;

export const GIG_TYPE_LABEL: Record<GigType, string> = {
  gig: "Выступление",
  casting: "Кастинг",
  residency: "Резидентство",
};

export const GIG_TYPE_BADGE_CLASS: Record<GigType, string> = {
  gig: "bg-primary/15 text-primary",
  casting: "bg-amber-500/15 text-amber-400",
  residency: "bg-violet-500/15 text-violet-400",
};

export const GIG_STATUS_LABEL: Record<GigStatus, string> = {
  open: "Открыто",
  closed: "Закрыто",
};

export const LEGACY_APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: "Новый",
  accepted: "Принят",
  rejected: "Отклонён",
  cancelled: "Отменён",
};

export const LEGACY_APPLICATION_STATUS_CLASS: Record<ApplicationStatus, string> = {
  new: "text-primary",
  accepted: "text-primary",
  rejected: "text-destructive",
  cancelled: "text-muted-foreground",
};

export {
  APPLICATION_STATUS_CLASS,
  APPLICATION_STATUS_LABEL,
} from "@/lib/applications";

export function getGigTypeLabel(type: string | null | undefined): string {
  return type && type in GIG_TYPE_LABEL ? GIG_TYPE_LABEL[type as GigType] : "";
}

export function getGigTypeBadgeClass(type: string | null | undefined): string {
  return type && type in GIG_TYPE_BADGE_CLASS
    ? GIG_TYPE_BADGE_CLASS[type as GigType]
    : GIG_TYPE_BADGE_CLASS.gig;
}

export function getApplicationStatusLabel(status: string | null | undefined): string {
  return getNormalizedApplicationStatusLabel(status as ApplicationStatus | null | undefined);
}

export function getApplicationStatusClass(status: string | null | undefined): string {
  return getNormalizedApplicationStatusClass(status as ApplicationStatus | null | undefined);
}

export function isOpenGig(gig: Pick<Gig, "status">): boolean {
  return gig.status === "open";
}

export function toGigInsert(input: {
  venueId: string;
  title: string;
  city: string;
  description?: string;
  budget?: string;
  musicStyles: string[];
  type: GigType;
  eventDate?: string;
  startTime?: string;
  duration?: string;
  requirements?: string;
  portfolioRequired?: boolean;
  deadline?: string;
  schedule?: string;
  frequency?: string;
}): GigInsert {
  return {
    venue_id: input.venueId,
    title: input.title,
    city: input.city,
    description: input.description || null,
    budget: input.budget || null,
    music_styles: input.musicStyles,
    post_type: input.type,
    status: "open",
    event_date: input.eventDate || null,
    start_time: input.startTime || null,
    duration: input.duration || null,
    requirements: input.requirements || null,
    portfolio_required: input.portfolioRequired ?? false,
    deadline: input.deadline || null,
    schedule: input.schedule || null,
    frequency: input.frequency || null,
    long_term: input.type === "residency",
  };
}

export function toApplicationInsert(input: {
  djId: string;
  gigId: string;
  message?: string;
}): GigApplicationInsert {
  return {
    dj_id: input.djId,
    post_id: input.gigId,
    message: input.message || null,
    status: "new",
  };
}

export function toGigThreadAnchor(application: GigApplication, gig: Pick<Gig, "venue_id">): GigThreadAnchor {
  return {
    applicationId: application.id,
    gigId: application.post_id,
    djId: application.dj_id,
    venueId: gig.venue_id,
  };
}
