export const routeLoaders = {
  index: () => import("@/pages/Index"),
  roleSelect: () => import("@/pages/RoleSelect"),
  register: () => import("@/pages/Register"),
  login: () => import("@/pages/Login"),
  resetPassword: () => import("@/pages/ResetPassword"),
  signup: () => import("@/pages/Signup"),
  admin: () => import("@/pages/Admin"),
  communityChat: () => import("@/pages/CommunityChat"),
  djCatalog: () => import("@/pages/DjCatalog"),
  gigListings: () => import("@/pages/GigListings"),
  djProfile: () => import("@/pages/DjProfile"),
  gigDetail: () => import("@/pages/GigDetail"),
  venueCatalog: () => import("@/pages/VenueCatalog"),
  venueProfile: () => import("@/pages/VenueProfile"),
  dashboard: () => import("@/pages/Dashboard"),
  profile: () => import("@/pages/Profile"),
  postListings: () => import("@/pages/PostListings"),
  postDetail: () => import("@/pages/PostDetail"),
  inbox: () => import("@/pages/Inbox"),
  notFound: () => import("@/pages/NotFound"),
};

const routeMap: Record<string, keyof typeof routeLoaders> = {
  "/": "index",
  "/role-select": "roleSelect",
  "/register": "register",
  "/login": "login",
  "/reset-password": "resetPassword",
  "/signup": "signup",
  "/admin": "admin",
  "/admin/community": "communityChat",
  "/community": "communityChat",
  "/djs": "djCatalog",
  "/gigs": "gigListings",
  "/dj": "djProfile",
  "/gig": "gigDetail",
  "/venues": "venueCatalog",
  "/venue": "venueProfile",
  "/dashboard": "dashboard",
  "/profile": "profile",
  "/posts": "postListings",
  "/post": "postDetail",
  "/inbox": "inbox",
};

const loaded = new Set<keyof typeof routeLoaders>();

export function preloadRoute(path: string) {
  const key = routeMap[path] ?? routeMap[`/${path.split("/")[1]}`];
  if (!key || loaded.has(key)) return;

  loaded.add(key);
  void routeLoaders[key]().catch(() => {
    loaded.delete(key);
  });
}

export function preloadCriticalRoutes() {
  ["/djs", "/venues", "/posts", "/inbox", "/profile"].forEach(preloadRoute);
}
