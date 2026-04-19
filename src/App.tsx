import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { preloadCriticalRoutes, routeLoaders } from "@/lib/routePreload";

const Index = lazy(routeLoaders.index);
const RoleSelect = lazy(routeLoaders.roleSelect);
const Register = lazy(routeLoaders.register);
const Login = lazy(routeLoaders.login);
const ResetPassword = lazy(routeLoaders.resetPassword);
const Signup = lazy(routeLoaders.signup);
const Admin = lazy(routeLoaders.admin);
const CommunityChat = lazy(routeLoaders.communityChat);
const DjCatalog = lazy(routeLoaders.djCatalog);
const GigListings = lazy(routeLoaders.gigListings);
const DjProfile = lazy(routeLoaders.djProfile);
const GigDetail = lazy(routeLoaders.gigDetail);
const VenueCatalog = lazy(routeLoaders.venueCatalog);
const VenueProfile = lazy(routeLoaders.venueProfile);
const Dashboard = lazy(routeLoaders.dashboard);
const Profile = lazy(routeLoaders.profile);
const PostListings = lazy(routeLoaders.postListings);
const PostDetail = lazy(routeLoaders.postDetail);
const Inbox = lazy(routeLoaders.inbox);
const NotFound = lazy(routeLoaders.notFound);

const preAuthRoutes = ["/", "/role-select", "/register", "/login", "/reset-password", "/signup"];

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background/70">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const showNav = !preAuthRoutes.some(
    (r) => location.pathname === r || location.pathname.startsWith("/register")
  );

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 600));
    const idleId = idle(preloadCriticalRoutes);
    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "[") {
        e.preventDefault();
        navigate("/admin");
        toast("Режим администратора", {
          icon: <Shield className="h-4 w-4 text-primary" />,
          description: "Ctrl + [ — быстрый доступ",
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <>
      {showNav && <Navbar />}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/role-select" element={<RoleSelect />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin" element={<AuthGuard><Admin /></AuthGuard>} />
          <Route path="/admin/community" element={<AuthGuard><CommunityChat /></AuthGuard>} />
          <Route path="/djs" element={<DjCatalog />} />
          <Route path="/gigs" element={<GigListings />} />
          <Route path="/gig/:id" element={<GigDetail />} />
          <Route path="/dj/:id" element={<DjProfile />} />
          <Route path="/venues" element={<VenueCatalog />} />
          <Route path="/venue/:id" element={<VenueProfile />} />
          <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
          <Route path="/inbox" element={<AuthGuard><Inbox /></AuthGuard>} />
          <Route path="/posts" element={<PostListings />} />
          <Route path="/community" element={<CommunityChat />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

import { AuthProvider } from "@/hooks/useAuth";

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
