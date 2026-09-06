'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid,
  FolderPlus,
  Link2,
  Search,
  LucideEllipsis,
  Table2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarFooter } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebarState } from '@/context/SidebarStateContext';
import { useLanguage } from '@/context/LanguageContext';
import { openCreateNewTableDialog } from '@/components/create-table-dialog';
import { SidebarNewGroupDialog } from './SidebarNewGroupDialog';
import { SidebarNewLinkDialog } from './SidebarNewLinkDialog';
import { UserLocalStorage } from '@/lib/userLocalStorage';

export function SidebarFooterMenu() {
  const router = useRouter();
  const { t } = useLanguage();
  const {
    searchVisible,
    setSearchVisible,
    showHiddenGroups,
    setShowHiddenGroups,
  } = useSidebarState();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newLinkOpen, setNewLinkOpen] = useState(false);

  return (
    <SidebarFooter className='mt-auto flex shrink-0 justify-start pb-1'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='outline'
            size='icon'
            className='data-[state=open]:bg-muted data-[state=open]:text-muted-foreground size-9 shrink-0'
            aria-label='More options'
          >
            <LucideEllipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='top' align='start' className='w-52'>
          <DropdownMenuItem
            onClick={() => {
              UserLocalStorage.preferDashboardHome();
              router.push('/dashboard');
            }}
          >
            <LayoutGrid className='size-4' />
            {t('dashboard.title')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSearchVisible(!searchVisible)}>
            <Search className='size-4' />
            Search
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowHiddenGroups(!showHiddenGroups)}
          >
            {showHiddenGroups ? (
              <>
                <EyeOff className='size-4' />
                Hide hidden groups
              </>
            ) : (
              <>
                <Eye className='size-4' />
                Show hidden groups
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreateNewTableDialog}>
            <Table2 className='size-4' />
            New table
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNewGroupOpen(true)}>
            <FolderPlus className='size-4' />
            New group
          </DropdownMenuItem>
          <DropdownMenuItem
            className='h-8 min-h-8 py-0'
            onClick={() => setNewLinkOpen(true)}
          >
            <Link2 className='size-4 shrink-0' />
            New link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarNewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
      />
      <SidebarNewLinkDialog open={newLinkOpen} onOpenChange={setNewLinkOpen} />
    </SidebarFooter>
  );
}
