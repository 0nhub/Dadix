'use client';

import { AddNewProjectInput } from './AddNewProjectInput';
import { DeleteProjectConfirmDialog } from './DeleteProjectConfirmDialog';
import { EditProjectPanel } from './EditProjectPanel';
import { ProjectsList } from './ProjectsList';

export function ProjectsEditor() {
  return (
    <>
      <div className='flex flex-col justify-center items-center m-4 max-md:items-start'>
        <div className='flex flex-col gap-4 w-full max-w-115'>
          <ProjectsList />
          <div className='sticky bottom-0 bg-background z-1'>
            <AddNewProjectInput />
          </div>
        </div>
      </div>
      <EditProjectPanel />
      <DeleteProjectConfirmDialog />
    </>
  );
}
