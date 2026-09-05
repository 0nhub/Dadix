import type { Row } from '@tanstack/react-table';
import { useSortable } from '@dnd-kit/sortable';
import { TableCell, TableRow } from '@/components/ui/table';
import { flexRender } from '@tanstack/react-table';
import { CSS } from '@dnd-kit/utilities';

export default function DraggableRow({
  row,
  onOpenRecord,
  activeRecordId,
}: {
  row: Row<Record<string, unknown>>;
  onOpenRecord?: (_record: Record<string, unknown>) => void;
  activeRecordId?: string;
}) {
  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({ id: row.original.id as string | number });

  const isActive = activeRecordId === row.original.id;

  return (
    <TableRow
      data-state={row.getIsSelected() && 'selected'}
      data-active={isActive || undefined}
      aria-selected={isActive}
      data-dragging={isDragging}
      ref={setNodeRef}
      className={`relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 hover:bg-muted/50 transition-colors ${isActive ? 'bg-muted' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => {
        e.stopPropagation();
        onOpenRecord?.(row.original);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {row.getVisibleCells().map((cell, index) => (
        <TableCell key={cell.id}>
          {index === 0 ? (
            <div {...attributes} {...listeners}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </TableCell>
      ))}
    </TableRow>
  );
}
