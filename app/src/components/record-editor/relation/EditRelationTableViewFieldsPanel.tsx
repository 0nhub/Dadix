import { RelationTableViewFieldsEditor } from '@/components/table-editor/RelationTableViewFieldsEditor';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
} from '@/components/ui/sheet';
import { LucideX } from 'lucide-react';

interface EditRalationTableViewFieldsPanelProps {
  relationId: number;
  relatedToTableWithId: string;
  onClose: () => void;
}

export function EditRalationTableViewFieldsPanel({
  relationId,
  relatedToTableWithId,
  onClose,
}: EditRalationTableViewFieldsPanelProps) {
  return (
    <Sheet
      open={true}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
      }}
    >
      <SheetContent className='w-full md:max-w-md gap-0'>
        <SheetHeader>
          <SheetClose asChild>
            <Button variant='outline' size='icon'>
              <LucideX />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className='flex flex-col justify-start items-stretch gap-4 p-4'>
          <div className='flex flex-col justify-start items-stretch gap-2'>
            <div className='font-medium'>Fields</div>
            <RelationTableViewFieldsEditor
              relationId={relationId}
              relatedToTableWithId={relatedToTableWithId}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
