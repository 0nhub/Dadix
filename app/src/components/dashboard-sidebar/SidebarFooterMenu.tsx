'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid,
  FolderPlus,
  Link as LinkIcon,
  Search,
  SearchX,
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
    <SidebarFooter className='flex justify-start'>
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
            {searchVisible ? (
              <>
                <SearchX className='size-4' />
                Hide search
              </>
            ) : (
              <>
                <Search className='size-4' />
                Show search
              </>
            )}
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
          <DropdownMenuItem onClick={() => setNewLinkOpen(true)}>
            <LinkIcon className='size-4' />
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
