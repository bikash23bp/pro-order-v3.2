import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme.mode}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border",
          title: "!text-popover-foreground",
          description: "!text-popover-foreground/90",
          success: "!bg-popover !text-popover-foreground !border-primary/50",
          info: "!bg-popover !text-popover-foreground !border-accent/50",
          warning: "!bg-popover !text-popover-foreground !border-secondary/70",
          error: "!bg-popover !text-popover-foreground !border-destructive/70",
          icon: "!text-popover-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};


export { Toaster };
