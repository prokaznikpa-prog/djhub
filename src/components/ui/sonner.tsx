import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      offset={16}
      expand={false}
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:w-full group-[.toaster]:max-w-[360px] group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:border-primary/20 group-[.toaster]:bg-[#15181e]/98 group-[.toaster]:text-foreground group-[.toaster]:shadow-[0_18px_46px_rgba(0,0,0,0.45)]",
          title: "group-[.toast]:text-foreground group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          success:
            "group-[.toast]:border-primary/30 group-[.toast]:bg-[#1a1416]/98 group-[.toast]:text-foreground",
          error:
            "group-[.toast]:border-destructive/35 group-[.toast]:bg-[#1a1315]/98 group-[.toast]:text-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/90",
          cancelButton: "group-[.toast]:border group-[.toast]:border-white/10 group-[.toast]:bg-white/5 group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-white/10",
          closeButton:
            "group-[.toast]:border-white/10 group-[.toast]:bg-white/5 group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-white/10 group-[.toast]:hover:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
