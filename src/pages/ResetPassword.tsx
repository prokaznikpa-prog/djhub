import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

const getResetErrorMessage = (message?: string) => {
  const text = message?.toLowerCase() ?? "";
  if (text.includes("weak") || text.includes("password") || text.includes("парол")) return "Пароль слишком простой";
  if (text.includes("expired") || text.includes("invalid") || text.includes("token") || text.includes("otp")) {
    return "Ссылка недействительна или истекла";
  }
  return "Ошибка, попробуйте снова";
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const prepareRecoverySession = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, document.title, "/reset-password");
        if (error) {
          if (!isMounted) return;
          toast.error("Ссылка недействительна или истекла");
          setHasRecoverySession(false);
          setCheckingSession(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setHasRecoverySession(!!data.session);
      setCheckingSession(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(!!session);
        setCheckingSession(false);
      }
    });

    void prepareRecoverySession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("Пароль слишком простой");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      toast.error(getResetErrorMessage(error.message));
      return;
    }

    toast.success("Пароль изменён");
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const inputCls = "premium-input";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-20">
      <div className="auth-card max-w-sm space-y-6">
        <Link to="/login" className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-background/35 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4 shrink-0" /> Назад
        </Link>

        <div className="text-center">
          <Link to="/" className="text-3xl font-bold tracking-tight inline-block mb-2">
            <span className="text-primary">DJ</span>
            <span className="text-foreground">HUB</span>
          </Link>
          <p className="text-sm text-muted-foreground">Восстановление пароля</p>
        </div>

        {checkingSession ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !hasRecoverySession ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Ссылка недействительна или истекла</p>
            <Link to="/login" className="btn-glow inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputCls + " pl-11 pr-4"}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Новый пароль"
                required
                minLength={6}
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputCls + " pl-11 pr-4"}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-glow flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Сменить пароль
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
