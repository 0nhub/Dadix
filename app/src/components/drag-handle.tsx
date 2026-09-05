import { IconGripVertical } from '@tabler/icons-react';

export default function DragHandle() {
  return (
    <div className='flex items-center justify-center active:cursor-grabbing hover:cursor-grab'>
      <IconGripVertical className='text-neutral-400 size-4' />
      <span className='sr-only'>Drag to reorder</span>
    </div>
  );
}
