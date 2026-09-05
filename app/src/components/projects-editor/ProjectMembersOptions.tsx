import { useEffect, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { LucideGripVertical, LucidePlus, LucideTrash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import { ProjectMemberRoleIcon } from '../ProjectMemberRoleIcon';
import { LoadingIndicator } from '../loading-indicator/LoadingIndicator';
import { Input } from '@/components/ui/input';

import { toast } from 'sonner';
import { inviteService } from '@/lib/invite';
import { projectServices } from '@/lib/project';

import type { InviteRole } from '@/lib/invite';
import type { MemberRole } from '@/types';

interface ProjectMembersOptionsProps {
  projectId: string;
}

interface IInviteItem {
  id: string | number;
  email?: string | null;
  role: InviteRole;
  token: string;
  status: 'pending' | 'accepted';
  expiresAt?: string | null;
}

interface IProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}

const MEMBER_ROLES: MemberRole[] = ['Viewer', 'Editor', 'Admin'];
const MEMBER_ROLES_DESCRIPTIONS: Record<MemberRole, string> = {
  Owner: '',
  Viewer: 'View records only',
  Editor: 'Create, edit and remove records',
  Admin: 'Manage users, modify fields, views and records',
};

function ProjectMembersOptions({ projectId }: ProjectMembersOptionsProps) {
  const lastRequestProjectMembersId = useRef<number>(0);
  const lastRequestProjectIdMembers = useRef<string>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [projectMembers, setProjectMembers] = useState<IProjectMember[]>([]);
  const [invites, setInvites] = useState<IInviteItem[]>([]);
  const [loadingInvites, setLoadingInvites] = useState<boolean>(false);

  useEffect(() => {
    if (!projectId) return;
    const requestId = ++lastRequestProjectMembersId.current;
    const requestedProjectId = `${projectId}`;
    lastRequestProjectIdMembers.current = requestedProjectId;
    setLoading(true);
    projectServices
      .getProjectMembers({ projectId: `${projectId}` })
      .then((res) => {
        if (
          lastRequestProjectMembersId.current !== requestId ||
          lastRequestProjectIdMembers.current !== requestedProjectId
        )
          return;
        if (!res || res.status !== 200 || !res.data?.members) {
          throw new Error(res.data?.message || 'Error getting project members');
        }
        setProjectMembers(
          res.data.members.map(
            (member: Record<string, unknown>) =>
              ({
                id: member?.id as string,
                role: member?.role as string,
                userId: (member?.user as Record<string, unknown>)?.id as string,
                email: (member?.user as Record<string, unknown>)
                  ?.email as string,
                name: (member?.user as Record<string, unknown>)
                  ?.username as string,
              }) as IProjectMember
          )
        );
        return res;
      })
      .finally(() => {
        if (
          lastRequestProjectMembersId.current !== requestId ||
          lastRequestProjectIdMembers.current !== requestedProjectId
        )
          return;
        setLoading(false);
      })
      .catch((err) => {
        if (
          lastRequestProjectMembersId.current !== requestId ||
          lastRequestProjectIdMembers.current !== requestedProjectId
        )
          return;
        console.error('Error getting project members', err);
      });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoadingInvites(true);
    inviteService
      .listInvites(projectId)
      .then((res) => {
        if (res?.status === 200 && res.data?.invites) {
          setInvites(res.data.invites as IInviteItem[]);
        }
        return res;
      })
      .finally(() => setLoadingInvites(false))
      .catch((err) => console.error(err));
  }, [projectId]);

  const refreshInvites = () => {
    setLoadingInvites(true);
    inviteService
      .listInvites(projectId)
      .then((res) => {
        if (res?.status === 200 && res.data?.invites) {
          setInvites(res.data.invites as IInviteItem[]);
        }
        return res;
      })
      .finally(() => setLoadingInvites(false))
      .catch((err) => console.error(err));
  };

  function handleUpdateMemberRole({
    memberId,
    newRole,
  }: {
    memberId: string;
    newRole: MemberRole;
  }) {
    setProjectMembers((projectMembers) =>
      projectMembers.map((member) =>
        member.id === memberId ? { ...member, role: newRole } : member
      )
    );
  }

  function handleAddNewProjectMember(newProjectMember: IProjectMember) {
    setProjectMembers((projectMembers) => {
      const newProjectMembers = projectMembers.slice(0);
      newProjectMembers.push({ ...newProjectMember });
      return newProjectMembers;
    });
  }

  function handleRemoveMember({ memberId }: { memberId: string }) {
    setProjectMembers((projectMembers) =>
      projectMembers.filter((member) => member.id !== memberId)
    );
  }

  return (
    <>
      <div className='text-sm font-medium'>Members</div>
      {loading ? (
        <div className='flex flex-row justify-center items-center'>
          {/*<LoadingIndicator visibilityDelay={false} />*/}
        </div>
      ) : (
        <>
          <ProjectMembersList
            projectMembers={projectMembers}
            handleUpdateMemberRole={handleUpdateMemberRole}
            handleRemoveMember={handleRemoveMember}
            projectId={`${projectId}`}
          />
          <AddNewProjectMemberInput
            projectId={projectId}
            handleAddNewProjectMember={handleAddNewProjectMember}
            onInviteCreated={refreshInvites}
          />
          {!!invites.length && (
            <div className='flex flex-col gap-2 my-2'>
              <div className='text-sm font-medium'>Pending invites</div>
              <div className='flex flex-col gap-1'>
                {invites.map((inv) => (
                  <PendingInviteRow
                    key={inv.id}
                    invite={inv}
                    projectId={projectId}
                    onRevoked={refreshInvites}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ProjectMembersList({
  projectMembers,
  handleUpdateMemberRole,
  handleRemoveMember,
  projectId,
}: {
  projectMembers: IProjectMember[];
  handleUpdateMemberRole: ({
    ..._params
  }: {
    memberId: string;
    newRole: MemberRole;
  }) => void;
  handleRemoveMember: ({ ..._params }: { memberId: string }) => void;
  projectId: string;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
  }

  return (
    <div className='flex flex-col grow gap-0 w-full rounded-lg border overflow-hidden'>
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        id='projects-editor--projects-list'
      >
        <div className='**:data-[slot=table-cell]:first:w-8'>
          {projectMembers.length ? (
            <>
              <SortableContext
                items={projectMembers}
                strategy={verticalListSortingStrategy}
              >
                {projectMembers.map((projectMember) => {
                  return (
                    <ProjectMember
                      key={projectMember.id}
                      member={projectMember}
                      handleUpdateMemberRole={handleUpdateMemberRole}
                      handleRemoveMember={handleRemoveMember}
                      projectId={projectId}
                    />
                  );
                })}
              </SortableContext>
            </>
          ) : (
            <div className='h-24 flex justify-center items-center text-center opacity-45'>
              No Members found!
            </div>
          )}
        </div>
      </DndContext>
    </div>
  );
}

function ProjectMember({
  member,
  handleUpdateMemberRole,
  handleRemoveMember,
  projectId,
}: {
  member: IProjectMember;
  handleUpdateMemberRole: ({
    ..._params
  }: {
    memberId: string;
    newRole: MemberRole;
  }) => void;
  handleRemoveMember: ({ ..._params }: { memberId: string }) => void;
  projectId: string;
}) {
  const [isUpdatingMemberRole, setIsUpdatingMemberRole] =
    useState<boolean>(false);

  const {
    transform,
    transition,
    setNodeRef,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: member.id as string,
    data: {
      id: member.id as string,
    },
  });

  function updateMember({
    memberId,
    userId,
    newRole,
  }: {
    memberId: string;
    userId: string;
    newRole: MemberRole;
  }) {
    if (!projectId || !userId) return;
    setIsUpdatingMemberRole(true);
    projectServices
      .updateProjectMemberRole({
        projectId: `${projectId}`,
        memberUserId: userId,
        newRole,
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error(res.data?.message || 'Error updating member role');
        }
        handleUpdateMemberRole({
          memberId,
          newRole,
        });
        return res;
      })
      .finally(() => {
        setIsUpdatingMemberRole(false);
      })
      .catch((err) => {
        toast.error('Error updating member role');
        console.error('Error updating member role', err);
      });
  }

  function deleteMember({
    memberId,
    userId,
  }: {
    memberId: string;
    userId: string;
  }) {
    if (!projectId || !userId) return;
    setIsUpdatingMemberRole(true);
    projectServices
      .deleteProjectMember({
        projectId: `${projectId}`,
        memberUserId: userId,
      })
      .then((res) => {
        if (res.status !== 200) {
          throw new Error(res.data?.message || 'Error removing member role');
        }
        handleRemoveMember({ memberId });
        return res;
      })
      .finally(() => {
        setIsUpdatingMemberRole(false);
      })
      .catch((err) => {
        toast.error('Error updating member role');
        console.error('Error updating member role', err);
      });
  }

  return (
    <>
      <div
        data-dragging={isDragging}
        ref={setNodeRef}
        className='hover:bg-muted/50 group relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[selected=true]:bg-muted not-last:border-b'
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
      >
        <div className='flex flex-row flex-nowrap justify-start items-center gap-2 p-1.5 pl-0'>
          <div
            className='flex justify-center items-center w-8 h-full shrink-0 grow-0'
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()} // Prevent row click when dragging
          >
            <LucideGripVertical className='size-4 opacity-35' />
          </div>
          <div className='flex flex-col justify-center items-start shrink grow gap-0'>
            <span className='text-sm shrink grow overflow-hidden'>
              {member.name}
            </span>
            <span className='text-xs shrink grow overflow-hidden opacity-50'>
              {member.email}
            </span>
          </div>
          {member.role === 'Owner' ? (
            <Button variant='outline' className='font-normal'>
              <ProjectMemberRoleIcon
                name={member.role}
                className='text-foreground'
              />
              <span className='text-foreground'>{member.role}</span>
            </Button>
          ) : (
            <Select
              disabled={isUpdatingMemberRole}
              value={member.role}
              onValueChange={(newRole: string) => {
                if (newRole === 'empty') {
                  deleteMember({ memberId: member.id, userId: member.userId });
                  return;
                }
                updateMember({
                  memberId: member.id,
                  userId: member.userId,
                  newRole: newRole as MemberRole,
                });
              }}
            >
              <SelectTrigger>
                {/*{isUpdatingMemberRole ? (
                  <LoadingIndicator visibilityDelay={false} />
                ) : (
                  <ProjectMemberRoleIcon
                    name={member.role}
                    className='text-foreground'
                  />
                  )}*/}
                <ProjectMemberRoleIcon
                  name={member.role}
                  className='text-foreground'
                />
                <span className='text-foreground'>{member.role}</span>
              </SelectTrigger>
              <SelectContent onClick={(evnt) => evnt.stopPropagation()}>
                {MEMBER_ROLES.map((role) => (
                  <SelectItem
                    key={role}
                    value={role}
                    className='**:text-foreground'
                  >
                    <ProjectMemberRoleIcon name={role} />
                    <div className='flex flex-col justify-center items-start shrink grow gap-0 overflow-hidden'>
                      <span className='text-sm shrink grow overflow-hidden'>
                        {role}
                      </span>
                      <span className='text-xs shrink grow overflow-hidden opacity-50'>
                        {MEMBER_ROLES_DESCRIPTIONS[role]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem className='**:text-foreground' value='empty'>
                  <LucideTrash2 />
                  <span>Remove</span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </>
  );
}

function AddNewProjectMemberInput({
  projectId,
  handleAddNewProjectMember,
  onInviteCreated,
}: {
  projectId: string;
  handleAddNewProjectMember: ({ ..._params }: IProjectMember) => void;
  onInviteCreated: () => void;
}) {
  const [newProjectMemberEmail, setNewProjectMemberEmail] =
    useState<string>('');
  const [newProjectMemberRole, setNewProjectMemberRole] =
    useState<MemberRole>('Viewer');
  const [isAddingNewProjectMember, setIsAddingNewProjectMember] =
    useState(false);

  const handleSubmitNewProjectMember = () => {
    if (!newProjectMemberEmail || !newProjectMemberEmail.trim()) return;
    if (newProjectMemberEmail.indexOf('@') < 1) {
      toast.error('unvalid Email');
      return;
    }
    setIsAddingNewProjectMember(true);
    const roleForApi = newProjectMemberRole.toUpperCase() as
      | 'VIEWER'
      | 'EDITOR'
      | 'ADMIN';
    inviteService
      .createInvite(projectId, {
        role: roleForApi,
        email: newProjectMemberEmail.toLowerCase(),
      })
      .then((res) => {
        if (res.status === 200 || res.status === 201) {
          toast.success('Invitation sent');
          // Do not mutate members list here; invite is pending until accepted.
          setNewProjectMemberEmail('');
          onInviteCreated?.();
        } else {
          throw new Error('Failed to send invite');
        }
        return res;
      })
      .finally(() => {
        setIsAddingNewProjectMember(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to send invite');
      });
  };

  return (
    <form
      className='flex grow gap-2 w-full'
      onSubmit={(evnt) => {
        evnt.preventDefault();
        handleSubmitNewProjectMember();
      }}
    >
      <Select
        value={newProjectMemberRole}
        onValueChange={(newRole: string) => {
          setNewProjectMemberRole(newRole as MemberRole);
        }}
        disabled={isAddingNewProjectMember}
      >
        <SelectTrigger>
          <ProjectMemberRoleIcon
            name={newProjectMemberRole}
            className='text-foreground'
          />
        </SelectTrigger>
        <SelectContent onClick={(evnt) => evnt.stopPropagation()}>
          {MEMBER_ROLES.map((role) =>
            role === 'Owner' ? null : (
              <SelectItem
                key={role}
                value={role}
                className='**:text-foreground'
              >
                <ProjectMemberRoleIcon name={role} />
                <div className='flex flex-col justify-center items-start shrink grow gap-0 overflow-hidden'>
                  <span className='text-sm shrink grow overflow-hidden'>
                    {role}
                  </span>
                  <span className='text-xs shrink grow overflow-hidden opacity-50'>
                    {MEMBER_ROLES_DESCRIPTIONS[role]}
                  </span>
                </div>
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
      <Input
        placeholder='User email'
        type='email'
        value={newProjectMemberEmail}
        onChange={(e) => setNewProjectMemberEmail(e.target.value)}
        disabled={isAddingNewProjectMember}
        required
      />
      <Button
        variant='default'
        size='icon'
        type='submit'
        disabled={isAddingNewProjectMember}
      >
        {/*{isAddingNewProjectMember ? (
          <LoadingIndicator visibilityDelay={false} />
        ) : (
          <LucidePlus />
        )}*/}
        <LucidePlus />
      </Button>
    </form>
  );
}

function PendingInviteRow({
  invite,
  projectId,
  onRevoked,
}: {
  invite: IInviteItem;
  projectId: string;
  onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);
  return (
    <div className='flex flex-row items-center justify-between border rounded-md px-2 py-1'>
      <div className='flex flex-col text-sm'>
        <span>{invite.email || 'Link invite'}</span>
        <span className='opacity-60 text-xs'>
          {invite.role} • {invite.status}
          {invite.expiresAt
            ? ` • expires ${new Date(invite.expiresAt).toLocaleString()}`
            : ''}
        </span>
      </div>
      <Button
        variant='outline'
        size='icon'
        disabled={revoking}
        onClick={() => {
          setRevoking(true);
          inviteService
            .revokeInvite(projectId, invite.id)
            .then((res) => {
              if (res.status === 200) {
                toast.success('Invite revoked');
                onRevoked?.();
              } else {
                throw new Error('Failed to revoke invite');
              }
              return res;
            })
            .finally(() => setRevoking(false))
            .catch((err) => {
              console.error(err);
              toast.error('Failed to revoke invite');
            });
        }}
      >
        {/*{revoking ? (
          <LoadingIndicator className='size-4' visibilityDelay={false} />
        ) : (
          <LucideTrash2 />
        )}*/}
        <LucideTrash2 />
      </Button>
    </div>
  );
}

export { ProjectMembersOptions };
