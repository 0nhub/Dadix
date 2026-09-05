import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  availableProjectIcons,
  ProjectIcon,
} from '@/components/project-icon/ProjectIcon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { LucidePlus } from 'lucide-react';
import { callApi } from '@/lib/api';
import { createLocalProject } from '@/lib/dev-demo-data';
import { dadixEvents } from '@/constants/events';
import { toast } from 'sonner';

function AddNewProjectInput() {
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectIcon, setNewProjectIcon] = useState('FolderClosed');
  const [isAddingNewProject, setIsAddingNewProject] = useState(false);

  const handleAddNewProject = () => {
    if (!(newProjectName || '').trim()) return;
    setIsAddingNewProject(true);
    if (process.env.NODE_ENV === 'development') {
      const created = createLocalProject(newProjectName.trim(), newProjectIcon);
      dispatchEvent(
        new CustomEvent(dadixEvents.projectEvents.onCreate, {
          detail: { createdProject: created },
        })
      );
      setNewProjectName('');
      setIsAddingNewProject(false);
      return;
    }
    callApi
      .post('/project', {
        title: newProjectName,
        icon: newProjectIcon,
      })
      .then((res) => {
        if (res.status !== 201 || !res.data) {
          throw new Error('Error creating a new project!');
        }
        dispatchEvent(
          new CustomEvent(dadixEvents.projectEvents.onCreate, {
            detail: {
              createdProject: { ...res.data },
            },
          })
        );
        setNewProjectName('');
        setIsAddingNewProject(false);
        return res;
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          const mockId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          dispatchEvent(
            new CustomEvent(dadixEvents.projectEvents.onCreate, {
              detail: {
                createdProject: {
                  id: mockId,
                  title: newProjectName.trim(),
                  icon: newProjectIcon,
                  order: 0,
                },
              },
            })
          );
          setNewProjectName('');
          toast.success('Projekt angelegt (nur lokal, Dev-Modus)');
        } else {
          toast.error('Error creating a new project!');
        }
        setIsAddingNewProject(false);
        console.error(err);
      });
  };

  return (
    <div className='flex grow gap-2 w-full'>
      <Select
        value={newProjectIcon}
        onValueChange={setNewProjectIcon}
        disabled={isAddingNewProject}
      >
        <SelectTrigger className='min-w-17.5 [&_.label]:hidden!'>
          <ProjectIcon name={newProjectIcon} className='text-primary size-5' />
        </SelectTrigger>
        <SelectContent>
          <div className='grid grid-cols-6 gap-2 p-2'>
            {availableProjectIcons.map((iconName) => {
              return (
                <SelectItem
                  className={`group/noCheckIndicator flex h-10 w-10 items-center justify-center p-0 ${iconName === newProjectIcon ? 'border' : ''}`}
                  key={iconName}
                  value={iconName}
                >
                  <ProjectIcon
                    name={iconName}
                    className='text-primary size-5.2'
                  />
                </SelectItem>
              );
            })}
          </div>
        </SelectContent>
      </Select>
      <Input
        placeholder='Project name'
        value={newProjectName}
        onChange={(e) => setNewProjectName(e.target.value)}
        disabled={isAddingNewProject}
      />
      <Button
        variant='default'
        size='icon'
        onClick={handleAddNewProject}
        disabled={isAddingNewProject}
      >
        {/*{isAddingNewProject ? (
          <LoadingIndicator visibilityDelay={false} />
        ) : (
          <LucidePlus />
        )}*/}
        <LucidePlus />
      </Button>
    </div>
  );
}

export { AddNewProjectInput };
