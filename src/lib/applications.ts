import type { ApplicationStatus, GigApplication } from "@/lib/gigs";

export type ApplicationActor = "dj" | "venue";
export type ApplicationVisibility = "active" | "hidden";
export type ApplicationLocalPatch = Partial<Pick<GigApplication, "status" | "hidden_by_dj" | "hidden_by_venue">>;
export type ApplicationDbStatus = ApplicationStatus;
export type ApplicationProductStatus = "pending" | "accepted" | "rejected" | "cancelled";
export type ApplicationStatusInput = ApplicationDbStatus | ApplicationProductStatus | null | undefined;

export const APPLICATION_STATUSES: ApplicationProductStatus[] = ["pending", "accepted", "rejected", "cancelled"];

export const APPLICATION_STATUS_LABEL: Record<ApplicationProductStatus, string> = {
  pending: "Ожидает",
  accepted: "Принят",
  rejected: "Отклонён",
  cancelled: "Отменён",
};

export const APPLICATION_STATUS_CLASS: Record<ApplicationProductStatus, string> = {
  pending: "text-primary",
  accepted: "text-primary",
  rejected: "text-destructive",
  cancelled: "text-muted-foreground",
};

export const APPLICATION_STATUS_TRANSITIONS: Record<ApplicationProductStatus, ApplicationProductStatus[]> = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: [],
  rejected: [],
  cancelled: [],
};

export interface NormalizedApplication<TApplication extends GigApplication = GigApplication> {
  id: string;
  row: TApplication;
  actor: ApplicationActor;
  dbStatus: ApplicationDbStatus;
  status: ApplicationProductStatus;
  statusLabel: string;
  statusClass: string;
  canVenueAccept: boolean;
  canVenueReject: boolean;
  canDjCancel: boolean;
  hidden: boolean;
  visible: boolean;
  djId: string;
  postId: string;
  applicationRound: number;
  createdAt: string;
}

export interface ApplicationCollection<TApplication extends GigApplication> {
  all: TApplication[];
  active: TApplication[];
  hidden: TApplication[];
  current: TApplication[];
  normalized: NormalizedApplication<TApplication>[];
  visibility: ApplicationVisibility;
  counts: {
    total: number;
    active: number;
    hidden: number;
  };
}

export function normalizeApplicationStatus(status: ApplicationStatusInput): ApplicationProductStatus {
  if (status === "new" || status === "pending") return "pending";
  if (status === "accepted" || status === "rejected" || status === "cancelled") return status;
  return "pending";
}

export function toApplicationDbStatus(status: ApplicationStatusInput): ApplicationDbStatus {
  return normalizeApplicationStatus(status) === "pending" ? "new" : normalizeApplicationStatus(status);
}

export function getApplicationStatusLabel(status: ApplicationStatusInput): string {
  return APPLICATION_STATUS_LABEL[normalizeApplicationStatus(status)];
}

export function getApplicationStatusClass(status: ApplicationStatusInput): string {
  return APPLICATION_STATUS_CLASS[normalizeApplicationStatus(status)];
}

export function isApplicationPending(applicationOrStatus: Pick<GigApplication, "status"> | ApplicationStatusInput): boolean {
  const status = typeof applicationOrStatus === "object" && applicationOrStatus !== null
    ? applicationOrStatus.status
    : applicationOrStatus;
  return normalizeApplicationStatus(status) === "pending";
}

export function isApplicationAccepted(applicationOrStatus: Pick<GigApplication, "status"> | ApplicationStatusInput): boolean {
  const status = typeof applicationOrStatus === "object" && applicationOrStatus !== null
    ? applicationOrStatus.status
    : applicationOrStatus;
  return normalizeApplicationStatus(status) === "accepted";
}

export function isApplicationRejected(applicationOrStatus: Pick<GigApplication, "status"> | ApplicationStatusInput): boolean {
  const status = typeof applicationOrStatus === "object" && applicationOrStatus !== null
    ? applicationOrStatus.status
    : applicationOrStatus;
  return normalizeApplicationStatus(status) === "rejected";
}

export function isApplicationCancelled(applicationOrStatus: Pick<GigApplication, "status"> | ApplicationStatusInput): boolean {
  const status = typeof applicationOrStatus === "object" && applicationOrStatus !== null
    ? applicationOrStatus.status
    : applicationOrStatus;
  return normalizeApplicationStatus(status) === "cancelled";
}

export function getAllowedApplicationStatusTransitions(status: ApplicationStatusInput): ApplicationProductStatus[] {
  return APPLICATION_STATUS_TRANSITIONS[normalizeApplicationStatus(status)];
}

export function canTransitionApplicationStatus(from: ApplicationStatusInput, to: ApplicationStatusInput): boolean {
  return getAllowedApplicationStatusTransitions(from).includes(normalizeApplicationStatus(to));
}

export function canVenueAcceptApplication(application: Pick<GigApplication, "status">): boolean {
  return canTransitionApplicationStatus(application.status, "accepted");
}

export function canVenueRejectApplication(application: Pick<GigApplication, "status">): boolean {
  return canTransitionApplicationStatus(application.status, "rejected");
}

export function canDjCancelApplication(application: Pick<GigApplication, "status">): boolean {
  return canTransitionApplicationStatus(application.status, "cancelled");
}

export function getApplicationStatusPatch(status: ApplicationStatusInput): Pick<ApplicationLocalPatch, "status"> {
  return { status: toApplicationDbStatus(status) };
}

export function getApplicationHiddenFor(application: Pick<GigApplication, "hidden_by_dj" | "hidden_by_venue">, actor: ApplicationActor): boolean {
  return actor === "dj" ? application.hidden_by_dj === true : application.hidden_by_venue === true;
}

export function getApplicationVisibilityPatch(actor: ApplicationActor, hidden: boolean): Pick<ApplicationLocalPatch, "hidden_by_dj" | "hidden_by_venue"> {
  return actor === "dj" ? { hidden_by_dj: hidden } : { hidden_by_venue: hidden };
}

export function getApplicationsForVisibility<TApplication extends GigApplication>(
  applications: TApplication[],
  actor: ApplicationActor,
  visibility: ApplicationVisibility,
): TApplication[] {
  return applications.filter((application) => {
    const hidden = getApplicationHiddenFor(application, actor);
    return visibility === "hidden" ? hidden : !hidden;
  });
}

export function mapApplicationFromDb<TApplication extends GigApplication>(
  application: TApplication,
  actor: ApplicationActor,
): NormalizedApplication<TApplication> {
  const hidden = getApplicationHiddenFor(application, actor);
  const status = normalizeApplicationStatus(application.status);

  return {
    id: application.id,
    row: application,
    actor,
    dbStatus: application.status,
    status,
    statusLabel: getApplicationStatusLabel(status),
    statusClass: getApplicationStatusClass(status),
    canVenueAccept: canVenueAcceptApplication(application),
    canVenueReject: canVenueRejectApplication(application),
    canDjCancel: canDjCancelApplication(application),
    hidden,
    visible: !hidden,
    djId: application.dj_id,
    postId: application.post_id,
    applicationRound: application.application_round,
    createdAt: application.created_at,
  };
}

export function createApplicationCollection<TApplication extends GigApplication>(
  applications: TApplication[],
  actor: ApplicationActor,
  visibility: ApplicationVisibility,
): ApplicationCollection<TApplication> {
  const active = getApplicationsForVisibility(applications, actor, "active");
  const hidden = getApplicationsForVisibility(applications, actor, "hidden");

  return {
    all: applications,
    active,
    hidden,
    current: visibility === "hidden" ? hidden : active,
    normalized: applications.map((application) => mapApplicationFromDb(application, actor)),
    visibility,
    counts: {
      total: applications.length,
      active: active.length,
      hidden: hidden.length,
    },
  };
}

export function patchApplicationLocally<TApplication extends GigApplication>(
  applications: TApplication[],
  applicationId: string,
  updates: ApplicationLocalPatch,
): TApplication[] {
  return applications.map((application) => (
    application.id === applicationId ? { ...application, ...updates } : application
  ));
}

export function patchApplicationStatusLocally<TApplication extends GigApplication>(
  applications: TApplication[],
  applicationId: string,
  status: ApplicationStatusInput,
): TApplication[] {
  return patchApplicationLocally(applications, applicationId, getApplicationStatusPatch(status));
}
