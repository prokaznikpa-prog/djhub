import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { GigApplicationForVenue, GigWithVenue } from "@/lib/gigs";
import type { InvitationRow } from "@/domains/invitations/invitations.hooks";
import type { VenuePost } from "@/domains/posts/posts.hooks";
import { cachedRequest, getCachedValue, setCachedValue } from "@/lib/requestCache";

const ADMIN_CACHE_TTL = 30_000;

export function useAllApplications() {
  const cacheKey = "admin:applications";
  const [apps, setApps] = useState<GigApplicationForVenue[]>(() => getCachedValue<GigApplicationForVenue[]>(cacheKey) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    const request = async () => {
      const { data } = await supabase.from("applications").select("*, dj_profiles(*), venue_posts(*)").order("created_at", { ascending: false });
      return ((data as any) ?? []) as GigApplicationForVenue[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, ADMIN_CACHE_TTL);
    setCachedValue(cacheKey, data, ADMIN_CACHE_TTL);
    setApps(data);
  };
  useEffect(() => { fetch(); }, []);
  return { apps, refetch: () => fetch({ force: true }) };
}

export function useAllInvitations() {
  const cacheKey = "admin:invitations";
  const [invites, setInvites] = useState<(InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null })[]>(() => getCachedValue<(InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null })[]>(cacheKey) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    const request = async () => {
      const { data } = await supabase.from("invitations").select("*, dj_profiles(*), venue_posts(*), venue_profiles(*)").order("created_at", { ascending: false });
      return ((data as any) ?? []) as (InvitationRow & { dj_profiles: Tables<"dj_profiles"> | null; venue_posts: VenuePost | null; venue_profiles: Tables<"venue_profiles"> | null })[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, ADMIN_CACHE_TTL);
    setCachedValue(cacheKey, data, ADMIN_CACHE_TTL);
    setInvites(data);
  };
  useEffect(() => { fetch(); }, []);
  return { invites, refetch: () => fetch({ force: true }) };
}

export function useAllVenuePosts() {
  const cacheKey = "admin:venue-posts";
  const [posts, setPosts] = useState<GigWithVenue[]>(() => getCachedValue<GigWithVenue[]>(cacheKey) ?? []);
  const fetch = async (opts?: { force?: boolean }) => {
    const request = async () => {
      const { data } = await supabase.from("venue_posts").select("*, venue_profiles(*)").order("created_at", { ascending: false });
      return ((data as any) ?? []) as GigWithVenue[];
    };
    const data = opts?.force ? await request() : await cachedRequest(cacheKey, request, ADMIN_CACHE_TTL);
    setCachedValue(cacheKey, data, ADMIN_CACHE_TTL);
    setPosts(data);
  };
  useEffect(() => { fetch(); }, []);
  const removePost = (postId: string) => setPosts((current) => {
    const next = current.filter((post) => post.id !== postId);
    setCachedValue(cacheKey, next, ADMIN_CACHE_TTL);
    return next;
  });
  const updatePost = (postId: string, updates: Partial<GigWithVenue>) => {
    setPosts((current) => {
      const next = current.map((post) => post.id === postId ? { ...post, ...updates } : post);
      setCachedValue(cacheKey, next, ADMIN_CACHE_TTL);
      return next;
    });
  };
  return { posts, refetch: () => fetch({ force: true }), removePost, updatePost };
}
