import { useState } from "react";
import { Check, Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_THEME_ID, THEMES, getTheme, type Theme } from "@/lib/themes";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemePicker() {
  const { theme, persistedThemeId, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const isDirty = theme.id !== persistedThemeId;

  const handlePreview = (id: Theme["id"]) => {
    if (id === theme.id) return;
    setTheme(id).catch(() => {});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setTheme(theme.id, { persist: true });
      toast.success(`Theme saved: ${theme.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setTheme(persistedThemeId).catch(() => {});
  };

  const handleResetDefault = async () => {
    setSaving(true);
    try {
      await setTheme(DEFAULT_THEME_ID, { persist: true });
      toast.success(`Theme reset to default: ${getTheme(DEFAULT_THEME_ID).name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset theme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-4 w-4" /> Appearance
        </CardTitle>
        <CardDescription>
          Pick a theme for your dashboard. Click a card to preview instantly, then save to keep it on every device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEMES.map((t) => {
            const isActive = t.id === theme.id;
            const isSaved = t.id === persistedThemeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePreview(t.id)}
                className={cn(
                  "group text-left rounded-xl border bg-card p-3 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-lg",
                  isActive ? "border-primary ring-2 ring-primary/40 shadow-md" : "border-border",
                )}
                aria-pressed={isActive}
              >
                <ThemeMiniPreview t={t} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{t.name}</p>
                      {isSaved && (
                        <Badge variant="secondary" className="gap-1 text-[10px] uppercase tracking-wide">
                          <Check className="h-3 w-3" /> Active
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  </div>
                  {isActive && !isSaved && (
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">Preview</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {isDirty
              ? `Previewing "${theme.name}" — save to apply it everywhere you sign in.`
              : `Saved theme: ${theme.name}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetDefault}
              disabled={saving || persistedThemeId === DEFAULT_THEME_ID}
              title="Switch back to Midnight Indigo and save"
            >
              <RotateCcw className="h-4 w-4" /> Reset to default
            </Button>
            {isDirty && (
              <Button variant="outline" size="sm" onClick={handleRevert} disabled={saving}>
                <RotateCcw className="h-4 w-4" /> Revert
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save as default
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeMiniPreview({ t }: { t: Theme }) {
  const { preview } = t;
  return (
    <div
      className="relative h-28 rounded-lg overflow-hidden border"
      style={{ backgroundColor: preview.bg, borderColor: "rgba(255,255,255,0.06)" }}
    >
      {/* sidebar */}
      <div
        className="absolute inset-y-0 left-0 w-1/4"
        style={{ backgroundColor: preview.sidebar }}
      >
        <div className="mt-2 mx-2 space-y-1.5">
          <div className="h-1.5 rounded-sm opacity-80" style={{ backgroundColor: preview.primary }} />
          <div className="h-1 rounded-sm opacity-30" style={{ backgroundColor: preview.primary }} />
          <div className="h-1 rounded-sm opacity-30" style={{ backgroundColor: preview.primary }} />
        </div>
      </div>
      {/* card */}
      <div
        className="absolute top-2 right-2 left-[28%] h-12 rounded-md shadow-sm"
        style={{ backgroundColor: preview.card }}
      >
        <div className="p-2 space-y-1">
          <div className="h-1.5 w-1/2 rounded-sm opacity-50" style={{ backgroundColor: preview.primary }} />
          <div className="h-1 w-3/4 rounded-sm opacity-25" style={{ backgroundColor: preview.primary }} />
        </div>
      </div>
      {/* button */}
      <div
        className="absolute bottom-2 right-2 h-5 w-14 rounded-md"
        style={{ backgroundColor: preview.primary }}
      />
      {/* secondary chip */}
      <div
        className="absolute bottom-2 left-[28%] h-5 w-10 rounded-md opacity-60"
        style={{ backgroundColor: preview.card }}
      />
    </div>
  );
}
