import { TableFieldsList } from '@/components/table-editor/TableFieldsList';
import { AddNewTableFieldInput } from '@/components/table-editor/AddNewTableFieldInput';
import { useTableContext } from '@/context/TableContext';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';

export function TableEditor() {
  const currentTableContext = useTableContext();
  return (
    <>
      <div className='flex flex-col justify-center items-center m-4 max-md:items-start'>
        {currentTableContext.isLoading ? (
          <>{/*<LoadingIndicator />*/}</>
        ) : (
          <div className='flex flex-col gap-4 w-full max-w-115'>
            <TableFieldsList />
            <div className='sticky bottom-0 bg-background z-1'>
              <AddNewTableFieldInput />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
