import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
} from '@/components/ui/sheet';
import { LucideX } from 'lucide-react';
import { Filters } from '@/components/global-filter/filters/Filters';

import { useEventHandler } from '@/hooks/useEventHandler';

import type { Field, IFilter } from '@/types';

const OPEN_GLOBAL_FILTER_EVENT = 'dadix--open-global-filter-event';

function GlobalFilter() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const [openTableData, setOpenTableData] = useState<
    | {
        filters: Record<number, IFilter[]>;
        setFilters: (_filters: Record<number, IFilter[]>) => void;
        tableFields: Field[];
      }
    | undefined
  >(undefined);

  const isFilterEmpty = useMemo(() => {
    if (!openTableData?.filters) return true;
    const keys = Object.keys(openTableData.filters);
    let filterEmpty = true;
    keys.map((key) => {
      if (!filterEmpty) return null; // if one filter is not empty, no need to check for rest of filters
      openTableData.filters[key as unknown as number].map((filter) => {
        if (filter.value) filterEmpty = false;
        return null;
      });
      return null;
    });
    return filterEmpty;
  }, [openTableData?.filters]);

  useEventHandler(
    OPEN_GLOBAL_FILTER_EVENT,
    (evnt: Event) => {
      const { filters, setFilters, tableFields } =
        (evnt as CustomEvent).detail || {};
      if (!filters || !setFilters || !tableFields) return;
      if (isOpen) return;
      setOpenTableData({
        filters,
        setFilters,
        tableFields,
      });
      setIsOpen(true);
    },
    [isOpen]
  );

  return (
    <Sheet modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetClose asChild>
            <Button variant='outline' size='icon' autoFocus>
              <LucideX />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className='p-4 overflow-auto'>
          {openTableData && <Filters {...openTableData} />}
        </div>
        <SheetFooter>
          {!isFilterEmpty && (
            <div className='flex flex-row justify-center items-center'>
              <Button
                onClick={() => {
                  openTableData?.setFilters({});
                  if (openTableData)
                    setOpenTableData({
                      ...openTableData,
                      filters: {},
                    });
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function openGlobalFilter({
  filters,
  setFilters,
  tableFields,
}: {
  filters: Record<number, IFilter[]>;
  setFilters: (_filters: Record<number, IFilter[]>) => void;
  tableFields: Field[];
}) {
  window.dispatchEvent(
    new CustomEvent(OPEN_GLOBAL_FILTER_EVENT, {
      detail: {
        filters,
        setFilters,
        tableFields,
      },
    })
  );
}

export { GlobalFilter, openGlobalFilter };
