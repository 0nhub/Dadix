import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { openProject } from "../lib/dadix";
import { upsertRecent } from "./recents";
import { dadixEvents } from "@/constants/events";

export function ConnectDialog({
  open: isOpen,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const selected = await open({
          multiple: false,
          title: "Projekt öffnen",
          filters: [{ name: "Dadix", extensions: ["dadix"] }],
        });
        if (typeof selected === "string") {
          const meta = await openProject(selected);
          const id = meta.project_id ?? String(meta.id);
          upsertRecent({
            id,
            path: meta.path ?? selected,
            title: meta.name,
            icon: "FolderClosed",
            order: 0,
          });
          window.dispatchEvent(
            new CustomEvent(dadixEvents.projectEvents.onCreate, {
              detail: { createdProject: { id, title: meta.name, icon: "FolderClosed", order: 0 } },
            })
          );
          router.push(`/dashboard/${id}`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Projekt konnte nicht geöffnet werden");
      } finally {
        onOpenChange(false);
      }
    })();
  }, [isOpen, onOpenChange, router]);

  return null;
}
