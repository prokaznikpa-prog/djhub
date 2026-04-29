import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Mail, Lock, Loader2, ArrowLeft } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 6000;

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return fallback;
    const payload = await response.json() as { ok?: boolean; data?: T };
    return payload.data ?? fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const navigate = useNavigate();
  const { user, djProfile, venueProfile, loading: authLoading } = useAuth();

  // Already logged in with profile — go to site
  if (!authLoading && user && (djProfile || venueProfile)) {
    return <Navigate to="/djs" replace />;
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Заполните все поля");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Неверный email или пароль" : error.message);
      return;
    }
    toast.success("Вы вошли в систему");
    navigate("/djs");

    // Check profile existence after first navigation so login does not block first useful render.
    const loggedUser = data.user;
    if (loggedUser) {
      const [dj, venue] = await Promise.all([
        fetchJson<{ id?: string } | null>(`${API_URL}/api/dj-profile-by-user?userId=${encodeURIComponent(loggedUser.id)}`, null),
        fetchJson<{ id?: string } | null>(`${API_URL}/api/venue-profile-by-user?userId=${encodeURIComponent(loggedUser.id)}`, null),
      ]);
      if (!dj && !venue) navigate("/role-select");
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Ошибка входа через Google");
      return;
    }
    if (result.redirected) return;
    setLoading(false);
    toast.success("Вы вошли через Google");
    navigate("/djs");
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = forgotEmail.trim() || email.trim();
    if (!targetEmail) {
      toast.error("Введите email");
      return;
    }

    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);

    if (error) {
      toast.error("Ошибка, попробуйте снова");
      return;
    }

    toast.success("Проверьте почту для восстановления пароля");
    setForgotEmail(targetEmail);
  };

  const inputCls = "premium-input";

  return (
    <div className="flex min-h-screen items-start justify-center px-3 py-8 sm:items-center sm:px-4 sm:py-20">
      <div className="auth-card w-full max-w-md space-y-5 sm:max-w-sm sm:space-y-6">
        <Link to="/" className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-background/35 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4 shrink-0" /> Назад
        </Link>
        <div className="text-center">
          <Link to="/" className="mb-2 inline-block text-3xl font-bold tracking-tight">
            <span className="text-primary">DJ</span>
            <span className="text-foreground">HUB</span>
          </Link>
          <p className="text-sm text-muted-foreground">Войдите в аккаунт и продолжайте внутри DJHUB</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="flex w-full min-w-0 items-center justify-center gap-3 rounded-lg border border-border/60 bg-background/55 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-background disabled:opacity-50"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Войти через Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/60" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-background/80 px-2 text-muted-foreground">или</span></div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" />
            <input className={inputCls + " !pl-14 pr-4"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" />
            <input className={inputCls + " !pl-14 pr-4"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <button
            type="button"
            onClick={() => {
              setForgotEmail(email);
              setShowForgotPassword((value) => !value);
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Забыли пароль?
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-glow flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Войти
          </button>
        </form>

        {showForgotPassword && (
          <form onSubmit={handlePasswordResetRequest} className="profile-section space-y-3 rounded-xl border border-border/60 bg-background/45 p-3">
            <p className="text-xs text-muted-foreground">Укажите email, и мы отправим ссылку для восстановления пароля.</p>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputCls + " !pl-14 pr-4"}
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resetLoading}
              className="btn-glow flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {resetLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Отправить ссылку
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Нет аккаунта?{" "}
          <Link to="/signup" className="text-primary hover:underline font-medium">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
