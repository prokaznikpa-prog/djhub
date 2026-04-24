import type { GigApplication } from "@/lib/gigs";
import {
  type ApplicationLocalPatch,
  patchApplicationLocally,
} from "@/lib/applications";

export {
  APPLICATION_STATUS_CLASS,
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TRANSITIONS,
  APPLICATION_STATUSES,
  canDjCancelApplication,
  canTransitionApplicationStatus,
  canVenueAcceptApplication,
  canVenueRejectApplication,
  createApplicationCollection,
  getAllowedApplicationStatusTransitions,
  getApplicationHiddenFor,
  getApplicationStatusClass,
  getApplicationStatusLabel,
  getApplicationStatusPatch,
  getApplicationVisibilityPatch,
  getApplicationsForVisibility,
  isApplicationAccepted,
  isApplicationCancelled,
  isApplicationPending,
  isApplicationRejected,
  mapApplicationFromDb,
  normalizeApplicationStatus,
  patchApplicationLocally,
  patchApplicationStatusLocally,
  toApplicationDbStatus,
  type ApplicationActor,
  type ApplicationCollection,
  type ApplicationDbStatus,
  type ApplicationLocalPatch,
  type ApplicationProductStatus,
  type ApplicationStatusInput,
  type ApplicationVisibility,
  type NormalizedApplication,
} from "@/lib/applications";

export function updateApplicationInCollection<TApplication extends GigApplication>(
  applications: TApplication[],
  applicationId: string,
  updates: ApplicationLocalPatch,
) {
  return patchApplicationLocally(applications, applicationId, updates);
}
