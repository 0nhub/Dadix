import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { availableProjectIcons, ProjectIcon } from "@/components/project-icon/ProjectIcon";
import { dadixEvents } from "@/constants/events";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import { LucideX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { createNamedProject } from "../lib/dadix";
import { setCurrentOpen } from "./recents";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSectionId?: string;
  onCreated?: (projectId: string, sectionId?: string) => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  initialSectionId,
  onCreated,
}: NewProjectDialogProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("FolderClosed");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const meta = await createNamedProject(trimmed);
      const id = meta.project_id ?? String(meta.id);
      setCurrentOpen({
        id,
        path: meta.path ?? "",
        title: trimmed || meta.name,
        icon,
        order: 0,
      });
      window.dispatchEvent(
        new CustomEvent(dadixEvents.projectEvents.onCreate, {
          detail: { createdProject: { id, title: trimmed, icon, order: 0 } },
        })
      );
      onCreated?.(id, initialSectionId);
      setTitle("");
      setIcon("FolderClosed");
      onOpenChange(false);
      window.setTimeout(() => {
        router.push(`/dashboard/${id}`);
      }, 80);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Projekt konnte nicht angelegt werden");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="flex flex-row flex-nowrap justify-start items-center">
          <DialogClose asChild>
            <Button size="icon" variant="outline" className="shrink-0">
              <LucideX />
            </Button>
          </DialogClose>
          <DialogTitle className="shrink grow" hidden>
            {t("dashboard.newProject")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-4 mt-2">
            <div className="flex flex-col items-center gap-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-21 h-21" type="button" disabled={isSubmitting}>
                    <ProjectIcon name={icon} color="var(--primary)" className="size-14" />
                  </Button>
                </DialogTrigger>
                <DialogContent showCloseButton={false} className="max-w-[300px]! max-h-[400px]">
                  <DialogHeader>
                    <DialogTitle hidden>Icon</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-6 gap-2 justify-center">
                    {availableProjectIcons.map((iconName) => (
                      <DialogClose key={iconName} asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-pressed={icon === iconName}
                          title={iconName}
                          onClick={() => setIcon(iconName)}
                          className={cn("shadow-none", icon === iconName && "border-2 border-primary")}
                        >
                          <ProjectIcon name={iconName} className="size-6" />
                        </Button>
                      </DialogClose>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <Input
                placeholder={t("dashboard.projectName")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
