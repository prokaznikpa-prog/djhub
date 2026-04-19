import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Mail, Lock, Loader2, Music, Building2, ArrowLeft } from "lucide-react";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"dj" | "venue" | "">("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, djProfile, venueProfile, loading: authLoading } = useAuth();

  // Already logged in with profile — go to site
  if (!authLoading && user && (djProfile || venueProfile)) {
    return <Navigate to="/djs" replace />;
  }
  // Logged in but no profile — go to role select
  if (!authLoading && user && !djProfile && !venueProfile) {
    return <Navigate to="/role-select" replace />;
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) {
      toast.error("Выберите роль");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { role },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Проверьте почту для подтверждения email!", { duration: 6000 });
    navigate("/login");
  };

  const handleGoogleSignup = async () => {
    if (!role) {
      toast.error("Сначала выберите роль");
      return;
    }
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Ошибка регистрации через Google");
      return;
    }
    if (result.redirected) return;
    // After Google auth, store role preference and redirect to register
    localStorage.setItem("djhub_pending_role", role);
    setLoading(false);
    navigate(`/register?role=${role}`);
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 space-y-6 shadow-xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Link>
        <div className="text-center">
          <Link to="/" className="text-3xl font-bold tracking-tight inline-block mb-2">
            <span className="text-primary">DJ</span>
            <span className="text-foreground">HUB</span>
          </Link>
          <p className="text-sm text-muted-foreground">Создайте аккаунт</p>
        </div>

        {/* Role selector */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Кто вы?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole("dj")}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                role === "dj"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <Music className="h-5 w-5" />
              DJ
            </button>
            <button
              type="button"
              onClick={() => setRole("venue")}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                role === "venue"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <Building2 className="h-5 w-5" />
              Заведение
            </button>
          </div>
        </div>

        <button
          onClick={handleGoogleSignup}
          disabled={loading || !role}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Продолжить с Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">или</span></div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={inputCls + " pl-9"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={inputCls + " pl-9"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль (мин. 6 символов)" required minLength={6} />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={inputCls + " pl-9"} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Подтвердите пароль" required minLength={6} />
          </div>
          <button
            type="submit"
            disabled={loading || !role}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Создать аккаунт
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">Войти</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
