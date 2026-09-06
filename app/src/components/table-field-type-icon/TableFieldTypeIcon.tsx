import {
  LucideBinary,
  LucideCalendar,
  LucideCode,
  LucideLibrary,
  LucideListOrdered,
  LucideMousePointerClick,
  LucideWorkflow,
  LucideToggleLeft,
  LucideType,
  LucideCurlyBraces,
  LucideBot,
  LucideImage,
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
  SERIAL: LucideListOrdered,
  TEXT: LucideType,
  INTEGER: LucideBinary,
  BOOLEAN: LucideToggleLeft,
  CHOICE: LucideLibrary,
  DATE: LucideCalendar,
  RELATION: LucideWorkflow,
  FORMULA: LucideCode,
  CODE: LucideCurlyBraces,
  AI: LucideBot,
  FILE: LucideImage,
  VIEW_BUTTON: LucideMousePointerClick,
};

const availableTableFieldTypeIcons = Object.keys(Icons);

function TableFieldTypeIcon({
  name,
  ...props
}: { name: string } & SVGAttributes<SVGElement> & LucideProps) {
  const Icon: ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
  > | null = (() => {
    if (availableTableFieldTypeIcons.indexOf(name) < 0) return null;
    return Icons[name];
  })();
  if (!Icon) {
    return null;
  }
  return <Icon {...props} />;
}

export { TableFieldTypeIcon };
