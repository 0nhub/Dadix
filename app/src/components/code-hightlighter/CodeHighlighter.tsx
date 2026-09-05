import hljs from 'highlight.js/lib/common';
import syntaxStyles from './code-highlighter.module.scss';
import { Button } from '@/components/ui/button';
import { LucideCopy, LucideCopyCheck } from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/utils';

export const CodeHighlighter = ({ code = '' }: { code?: string }) => {
  const codeLines = code.trim().split('\n');
  return (
    <div
      className={`relative max-h-[300px] max-w-full overflow-auto flex flex-row flex-nowrap border rounded-md hljs ${syntaxStyles.codeWrapper}`}
    >
      <div className='inline-flex flex-col justify-start align-baseline text-right shrink-0 pt-2 pb-2'>
        {codeLines.map((Line, lineNumber) => {
          return (
            <span
              key={`line-number-${lineNumber}`}
              className='text-base opacity-50 inline-block p-0 pr-[1ch] min-w-[4ch] text-right'
            >
              {lineNumber + 1}
            </span>
          );
        })}
      </div>
      <div className='inline-block shrink-0 pt-2 pb-2'>
        {codeLines.map((line, i) => {
          return (
            <div
              key={`line_${i + 1}`}
              className='text-base p-[1ch] pt-0 pb-0 whitespace-nowrap'
              dangerouslySetInnerHTML={{
                __html: `${hljs.highlight(line || '', { language: 'js' }).value || '</br>'}`,
              }}
            />
          );
        })}
      </div>
      <Button
        size='icon'
        variant='outline'
        className={`${syntaxStyles.copyButton} sticky top-2 right-2 z-1 active:transform-[translate(0,1px)]`}
        onClick={() => {
          copyText(code);
          toast(
            <div className='flex flex-row gap-2 text-foreground'>
              <LucideCopyCheck />
              Copied!
            </div>,
            {
              style: {
                zIndex: '99999',
                background: 'var(--background)',
                padding: '10px',
                boxShadow: '0px 1px 4px hsla(0, 0%, 60%, .3)',
                borderRadius: 'var(--radius-md)',
              },
              unstyled: true,
            }
          );
        }}
      >
        <LucideCopy className='text-foreground' />
      </Button>
    </div>
  );
};
