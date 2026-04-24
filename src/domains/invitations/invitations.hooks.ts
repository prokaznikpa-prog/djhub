import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ChatThread } from "@/lib/chat";
import { ensureChatThreadForBooking } from "@/lib/chatFlow";
import { type Gig, isOpenGig } from "@/lib/gigs";
import { cachedRequest, getCacheSnapshot, setCachedValue } from "@/lib/requestCache";
import { isApplicationAccepted } from "@/domains/applications/applications.rules";
import {
  getActiveInvitationForDjAndGig,
  getApplicationForDjAndGig,
  getVenuePostSelection,
  updateApplicationStatus,
} from "@/domains/applications/applications.hooks";
import { createBookingForAcceptedApplication } from "@/domains/bookings/bookings.hooks";
import {
  canInteractWithPost,
  getPostModerationState,
  type VenuePost,
} from "@/domains/posts/posts.hooks";

export type InvitationRow = Tables<"invitations">;

const CACHE_TTL = 90_000;

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || error?.message?.toLowerCase().includes("duplicate");
}

export function useInvitationsForDj(djId: string | undefined) {
  type DjInvitation = InvitationRow & { venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null };
  const cacheKey = `invitations-dj:${djId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<DjInvitation[]>(cacheKey);
  const [invites, setInvites] = useState<DjInvitation[]>(() => cacheSnapshot.value ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    if (!djId) return;
    const request = async () => {
      const { data } = await supabase.from("invitations").select("*, venue_posts(id, title, post_type), venue_profiles(id, name, user_id)").eq("dj_id", djId).order("created_at", { ascending: false });
      return ((data as any) ?? []) as DjInvitation[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setInvites(data);
  };
  useEffect(() => {
    const snapshot = getCacheSnapshot<DjInvitation[]>(cacheKey);
    if (snapshot.value) {
      setInvites(snapshot.value);
    } else {
      setInvites([]);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
      void fetch({ force: true });
    } else {
      void fetch();
    }
    if (!djId) return;

    const channel = supabase
      .channel(`invitations-dj-${djId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invitations", filter: `dj_id=eq.${djId}` },
        () => { void fetch({ force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cacheKey, djId]);
  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  return { invites, refetch: fetch, updateLocal };
}

export function useInvitationsForVenue(venueId: string | undefined) {
  type VenueInvitation = InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null };
  const cacheKey = `invitations-venue:${venueId ?? "none"}`;
  const cacheSnapshot = getCacheSnapshot<VenueInvitation[]>(cacheKey);
  const [invites, setInvites] = useState<VenueInvitation[]>(() => cacheSnapshot.value ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    if (!venueId) return;
    const request = async () => {
      const { data } = await supabase.from("invitations").select("*, dj_profiles(id, name, user_id), venue_posts(id, title, post_type)").eq("venue_id", venueId).order("created_at", { ascending: false });
      return ((data as any) ?? []) as VenueInvitation[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, CACHE_TTL);
    setCachedValue(cacheKey, data, CACHE_TTL);
    setInvites(data);
  };
  useEffect(() => {
    const snapshot = getCacheSnapshot<VenueInvitation[]>(cacheKey);
    if (snapshot.value) {
      setInvites(snapshot.value);
    } else {
      setInvites([]);
    }

    if (snapshot.exists && !snapshot.isStale) {
      return;
    }

    if (snapshot.value) {
      void fetch({ force: true });
    } else {
      void fetch();
    }
    if (!venueId) return;

    const channel = supabase
      .channel(`invitations-venue-${venueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invitations", filter: `venue_id=eq.${venueId}` },
        () => { void fetch({ force: true }); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cacheKey, venueId]);
  const updateLocal = (invitationId: string, status: InvitationRow["status"]) => {
    setInvites((current) => {
      const next = current.map((invitation) => invitation.id === invitationId ? { ...invitation, status } : invitation);
      setCachedValue(cacheKey, next, CACHE_TTL);
      return next;
    });
  };
  return { invites, refetch: fetch, updateLocal };
}

export async function createInvitation(venueId: string, djId: string, postId: string, message?: string) {
  const [venueCheck, djCheck] = await Promise.all([
    supabase.from("venue_profiles").select("status").eq("id", venueId).maybeSingle(),
    supabase.from("dj_profiles").select("status").eq("id", djId).maybeSingle(),
  ]);
  if (venueCheck.error) return { data: null, error: venueCheck.error };
  if (djCheck.error) return { data: null, error: djCheck.error };
  if (venueCheck.data?.status !== "active") return { data: null, error: new Error("Профиль заведения ограничен модератором") };
  if (djCheck.data?.status !== "active") return { data: null, error: new Error("Профиль DJ ограничен модератором") };

  const { data: gig, error: gigError } = await getPostModerationState(postId);

  if (gigError) return { data: null, error: gigError };
  if (!gig) return { data: null, error: new Error("Публикация не найдена") };
  if (gig.venue_id !== venueId) return { data: null, error: new Error("Нельзя отправить приглашение от чужой публикации") };
  if (!isOpenGig(gig as Pick<Gig, "status">)) return { data: null, error: new Error("Эта публикация уже закрыта") };
  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { data: null, error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const currentRound = ((gig as any).application_round as number | null) ?? 1;
  const selection = await getVenuePostSelection(postId);
  if (selection.error) return { data: null, error: selection.error };
  if (selection.isSelected) return { data: null, error: new Error("На эту публикацию уже выбран DJ") };

  const [applicationConflict, invitationConflict] = await Promise.all([
    getApplicationForDjAndGig(djId, postId, currentRound),
    getActiveInvitationForDjAndGig(djId, postId, currentRound),
  ]);

  if (applicationConflict.error) return { data: null, error: applicationConflict.error };
  if (invitationConflict.error) return { data: null, error: invitationConflict.error };
  if (applicationConflict.data) return { data: null, error: new Error("Для этой публикации уже есть отклик от этого DJ") };
  if (invitationConflict.data) return { data: null, error: new Error("Приглашение уже отправлено") };

  const { data, error } = await supabase
    .from("invitations")
    .insert({ venue_id: venueId, dj_id: djId, post_id: postId, message, application_round: currentRound })
    .select()
    .single();
  return { data, error };
}

async function ensureAcceptedApplicationForInvitation(invitation: InvitationRow) {
  const existing = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
  if (existing.error) return { data: null, error: existing.error };
  if (existing.data) {
    if (isApplicationAccepted(existing.data.status)) return { data: existing.data, error: null };
    const updated = await updateApplicationStatus(existing.data.id, "accepted");
    return { data: updated.data, error: updated.error, chatThread: updated.chatThread };
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      dj_id: invitation.dj_id,
      post_id: invitation.post_id,
      message: invitation.message,
      application_round: invitation.application_round,
      status: "accepted",
    })
    .select("id, status")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const retry = await getApplicationForDjAndGig(invitation.dj_id, invitation.post_id, invitation.application_round);
      return { data: retry.data, error: retry.error };
    }
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateInvitationStatus(id: string, status: "new" | "accepted" | "rejected" | "cancelled"): Promise<{
  error: Error | null;
  chatThread?: ChatThread | null;
}> {
  const { data: current, error: currentError } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError) return { error: currentError };
  if (!current) return { error: new Error("Приглашение не найдено") };

  if (status !== "accepted") {
    const { error } = await supabase.from("invitations").update({ status }).eq("id", id);
    return { error };
  }

  const { data: gig, error: gigError } = await getPostModerationState(current.post_id);
  if (gigError) return { error: gigError };
  const interaction = canInteractWithPost(gig);
  if (!interaction.allowed) {
    return { error: new Error(interaction.reason ?? "Публикация недоступна") };
  }

  const { error: clearError } = await supabase.from("invitations").update({ status: "cancelled" }).eq("id", id);
  if (clearError) return { error: clearError };

  const application = await ensureAcceptedApplicationForInvitation(current as InvitationRow);
  if (application.error || !application.data) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: application.error ?? new Error("Не удалось создать отклик по приглашению") };
  }

  const applicationId = application.data.id;
  const booking = await createBookingForAcceptedApplication(applicationId);
  if (booking.error) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: booking.error };
  }
  if (!booking.data) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: new Error("Бронь не создана") };
  }

  const thread = await ensureChatThreadForBooking(booking.data.id);
  if (thread.error) {
    await supabase.from("invitations").update({ status: current.status }).eq("id", id);
    return { error: thread.error };
  }
  const { error } = await supabase.from("invitations").update({ status }).eq("id", id);
  if (error) return { error };

  return { error: null, chatThread: thread.data };
}

export async function checkInvited(venueId: string, djId: string, postId: string): Promise<boolean> {
  const { data: gig } = await supabase
    .from("venue_posts")
    .select("application_round")
    .eq("id", postId)
    .maybeSingle();
  const currentRound = ((gig as any)?.application_round as number | null) ?? 1;
  const { data } = await supabase
    .from("invitations")
    .select("id")
    .eq("venue_id", venueId)
    .eq("dj_id", djId)
    .eq("post_id", postId)
    .eq("application_round", currentRound)
    .in("status", ["new", "accepted"])
    .limit(1)
    .maybeSingle();
  return !!data;
}
