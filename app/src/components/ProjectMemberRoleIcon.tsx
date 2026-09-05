import {
  LucideCrown,
  LucideGlasses,
  LucidePencil,
  LucideShieldUser,
} from 'lucide-react';

import type { LucideProps } from 'lucide-react';
import type {
  ForwardRefExoticComponent,
  RefAttributes,
  SVGAttributes,
} from 'react';

const Icons: Record<
  string,
  ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  >
> = {
  Owner: LucideCrown,
  Viewer: LucideGlasses,
  Editor: LucidePencil,
  Admin: LucideShieldUser,
};

const availableProjectMemberRoleIcons = Object.keys(Icons);

function ProjectMemberRoleIcon({
  name,
  ...props
}: { name: string } & SVGAttributes<SVGElement> & LucideProps) {
  const Icon: ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  > | null = (() => {
    if (availableProjectMemberRoleIcons.indexOf(name) < 0) return null;
    return Icons[name];
  })();
  if (!Icon) {
    return null;
  }
  return <Icon {...props} />;
}

export { ProjectMemberRoleIcon };
