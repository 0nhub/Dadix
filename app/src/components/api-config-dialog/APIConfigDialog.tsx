import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  LucideCopyCheck,
  LucideEye,
  LucideEyeOff,
  LucideX,
  LucideMoreVertical,
  LucideRotateCcw,
  LucidePower,
  LucidePowerOff,
} from 'lucide-react';
import { copyText } from '@/lib/utils';
import { CodeHighlighter } from '@/components/code-hightlighter/CodeHighlighter';
import { callApi } from '@/lib/api';
import { useCurrentProjectContext } from '@/context/CurrentProjectContext';
import { LoadingIndicator } from '@/components/loading-indicator/LoadingIndicator';
import { useTableContext } from '@/context/TableContext';
const OPEN_API_CONFIG_EVENT_NAME = 'DADIX-EVENT-OPEN-API-CONFIG-DIALOG';
const API_ENABLED_STORAGE_PREFIX = 'dadix-api-enabled-';

function getApiEnabled(projectId: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const v = localStorage.getItem(`${API_ENABLED_STORAGE_PREFIX}${projectId}`);
    return v !== 'false';
  } catch {
    return true;
  }
}

function persistApiEnabled(projectId: string, enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${API_ENABLED_STORAGE_PREFIX}${projectId}`, String(enabled));
  } catch {}
}

export function APIConfigDialog() {
  const APIKeyRef = useRef<string>(null);

  const currentProjectCtx = useCurrentProjectContext();
  const currentTableCtx = useTableContext();

  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [APIKey, setAPIKey] = useState<string | null>(null);
  const [isAPIKeyVisible, setIsAPIKeyVisible] = useState<boolean>(false);
  const [isLoadingAPIKey, setIsLoadingAPIKey] = useState<boolean>(true);
  const [apiEnabled, setApiEnabledState] = useState<boolean>(true);
  const [tableContextOverride, setTableContextOverride] = useState<{
    id: string;
    projectId: string;
    name?: string;
    fields?: { name: string; type: string }[];
  } | null>(null);

  useEffect(() => {
    window.addEventListener(OPEN_API_CONFIG_EVENT_NAME, handleOpenEvent);
    return () => {
      window.removeEventListener(OPEN_API_CONFIG_EVENT_NAME, handleOpenEvent);
    };
  }, []);

  function handleOpenEvent(evnt: Event) {
    const detail = (evnt as CustomEvent<{ tableId?: string; projectId?: string }>).detail;
    if (detail?.tableId && detail?.projectId) {
      setTableContextOverride({
        id: detail.tableId,
        projectId: detail.projectId,
      });
    } else {
      setTableContextOverride(null);
    }
    setIsDialogOpen(true);
  }

  const effectiveProjectId = tableContextOverride?.projectId ?? currentProjectCtx.id;
  const effectiveTableId = tableContextOverride?.id ?? currentTableCtx.id;

  useEffect(() => {
    if (isDialogOpen && effectiveProjectId) {
      setApiEnabledState(getApiEnabled(effectiveProjectId));
    }
  }, [isDialogOpen, effectiveProjectId]);

  const handleTurnApiOff = () => {
    if (!effectiveProjectId) return;
    persistApiEnabled(String(effectiveProjectId), false);
    setApiEnabledState(false);
    toast.success('API disabled for this project');
  };

  const handleTurnApiOn = () => {
    if (!effectiveProjectId) return;
    persistApiEnabled(String(effectiveProjectId), true);
    setApiEnabledState(true);
    toast.success('API enabled for this project');
  };

  const handleResetApi = () => {
    if (!effectiveProjectId) return;
    APIKeyRef.current = null;
    setAPIKey(null);
    callApi
      .post(`/api/key/reset?projectId=${effectiveProjectId}`)
      .then(() => {
        return callApi.get(`/api/key?projectId=${effectiveProjectId}`);
      })
      .then((res) => {
        if (res?.data?.APIKey) {
          setAPIKey(res.data.APIKey);
          APIKeyRef.current = res.data.APIKey;
          toast.success('API key reset');
        }
      })
      .catch(() => {
        toast.error('Failed to reset API key');
      });
  };

  useEffect(() => {
    if (!isDialogOpen || APIKeyRef.current || !effectiveProjectId) {
      return;
    }
    try {
      setIsLoadingAPIKey(true);
      callApi
        .get(`/api/key?projectId=${effectiveProjectId}`)
        .then((res) => {
          if (res.status === 200 && res.data && res.data.APIKey) {
            setAPIKey(res.data.APIKey);
            APIKeyRef.current = res.data.APIKey;
          } else {
            throw new Error('Error');
          }
          setIsLoadingAPIKey(false);
          return res;
        })
        .catch((err) => {
          console.error(err);
          setAPIKey(null);
          APIKeyRef.current = null;
          setIsLoadingAPIKey(false);
        });
    } catch (err) {
      console.error(err);
    }
  }, [isDialogOpen, effectiveProjectId]);


  if (!isDialogOpen) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-[9999] overflow-hidden'
      role='dialog'
      aria-modal='true'
      aria-label='API config'
    >
      <div
        className='absolute inset-0 z-0 bg-black/20'
        onClick={() => {
          setIsDialogOpen(false);
          setTableContextOverride(null);
        }}
      />
      <div className='absolute inset-0 z-10 md:m-[10px] md:rounded-md md:border border-border bg-background shadow-lg'>
        <Button
          variant='outline'
          size='icon'
          className='absolute top-3 left-3 z-20 shrink-0'
          onClick={() => {
            setIsDialogOpen(false);
            setTableContextOverride(null);
          }}
        >
          <LucideX />
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon' className='absolute top-3 right-3 z-20 shrink-0'>
              <LucideMoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={handleResetApi}>
              <LucideRotateCcw className='size-4' />
              Reset API
            </DropdownMenuItem>
            {apiEnabled ? (
              <DropdownMenuItem onClick={handleTurnApiOff}>
                <LucidePowerOff className='size-4' />
                Turn API off
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleTurnApiOn}>
                <LucidePower className='size-4' />
                Turn API on
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div
          className='absolute inset-0 overflow-y-auto overflow-x-hidden pt-14'
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
        {!apiEnabled ? (
          <div className='flex flex-col items-center justify-center gap-4 p-8 max-w-[720px] mx-auto'>
            <p className='text-muted-foreground text-center'>
              API is disabled for this project. Use the menu above to turn it on again.
            </p>
          </div>
        ) : isLoadingAPIKey ? (
          <div className='flex justify-center items-center m-3'>
            {/*<LoadingIndicator className='size-8' />*/}
          </div>
        ) : (
          <div className='flex flex-col align-top justify-stretch gap-4 p-[10px] w-[100%] max-w-[720px] m-0 ml-auto mr-auto overflow-x-hidden'>
            <h4 className='text-base font-bold m-0 mb-[-.6em] p-0'>API Key</h4>
            <p className='text-base p-0 m-0'>
              If no API key is provided, a 403 Forbidden error will be returned
            </p>
            <div className='relative'>
              <Input
                type={isAPIKeyVisible ? 'text' : 'password'}
                value={APIKey || ''}
                className='text-base select-all pr-[35px]'
                onChange={(_evnt) => null}
              />
              <Button
                className='absolute right-0 top-0 rounded-l-none'
                variant='ghost'
                type='button'
                size='icon'
                onClick={() => {
                  setIsAPIKeyVisible((v) => !v);
                }}
              >
                {isAPIKeyVisible ? <LucideEyeOff /> : <LucideEye />}
              </Button>
            </div>
            <div className='flex flex-row align-baseline justify-between'>
              <Button variant='outline'>Reset API Key</Button>
              <CopyButton text={APIKey || ''} />
            </div>
            <Separator className='opacity-0' />
            <h4 className='text-base font-bold m-0 mb-[-.6em] p-0'>
              Query Parameters
            </h4>
            <p className='text-base p-0 m-0'>
              List of query parameters for pagination and filters
            </p>
            <div className='w-[100%] max-w-full border border-b-0 rounded-[12px] overflow-auto'>
              <Table className='!min-w-[unset] w-full border-0 rounded-2xl overflow-auto'>
                <TableBody>
                  {[
                    {
                      name: 'offset',
                      description: 'Pagination number to get next page data',
                    },
                    {
                      name: 'limit',
                      description: 'Limit to your search results',
                    },
                    {
                      name: 'fields',
                      description: 'Fields that you want to include',
                    },
                    {
                      name: 'filterKey',
                      description:
                        'Key name to filter. filterValue also required with this query param',
                    },
                    {
                      name: 'filterValue',
                      description: 'Value to filter results',
                    },
                    {
                      name: 'sortBy',
                      description: 'Key name to sort rows',
                    },
                    {
                      name: 'sortOrder',
                      description:
                        'Value to sort in the direction of, ASC (asending) or DESC (descending)',
                    },
                  ].map((item) => {
                    return (
                      <TableRow className='h-[55px]' key={item.name}>
                        <TableCell className='min-w-[100px] text-base font-bold pl-3.5'>
                          {item.name}
                        </TableCell>
                        <TableCell className='text-base pl-3.5'>
                          {item.description}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Separator className='opacity-0' />
            <Tabs defaultValue='Get rows'>
              <div className='max-w-full mb-10 mt-6 overflow-x-auto'>
                <TabsList>
                  <TabsTrigger value='Get rows'>Get rows</TabsTrigger>
                  <TabsTrigger value='Get single row'>
                    Get single row
                  </TabsTrigger>
                  <TabsTrigger value='Add rows'>Add rows</TabsTrigger>
                  <TabsTrigger value='Update a row'>Update a row</TabsTrigger>
                  <TabsTrigger value='Delete rows'>Delete rows</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value='Get rows'
                className='flex flex-col align-top justify-stretch gap-4'
              >
                <h4 className='text-base font-bold'>Get rows</h4>
                <p className='text-base'>
                  Retrieves all rows from the specified table
                </p>
                <Input
                  type='text'
                  value={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records`}
                  onChange={() => {
                    return;
                  }}
                />
                <div className='flex flex-row align-baseline justify-end'>
                  <CopyButton
                    text={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records`}
                  />
                </div>
                <CodeHighlighter
                  code={`
                  const API_KEY = "your_api_key";
                  const getTableRecordsUrl = "https://api.dadix.net/api/v1/tables/${effectiveTableId}/records"

                  fetch(getTableRecordsUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json',
                      },
                  })
                  .then(response => response.json())
                  .then(result => console.log(result))
                  .catch(error => console.error('error', error));
                `}
                />
              </TabsContent>

              <TabsContent
                value='Get single row'
                className='flex flex-col align-top justify-stretch gap-4'
              >
                <h4 className='text-base font-bold'>Get single row</h4>
                <p className='text-base'>
                  Make GET request to one single row data. replace
                  {' <_id> '}
                  with row _id
                </p>
                <Input
                  type='text'
                  value={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(<_id>)`}
                  onChange={() => {
                    return;
                  }}
                />
                <div className='flex flex-row align-baseline justify-end'>
                  <CopyButton
                    text={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(<_id>)`}
                  />
                </div>
                <CodeHighlighter
                  code={`
                  const API_KEY = "your_api_key";
                  const id = 123;
                  const getTableRecordUrl = \`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(\${id})\`;

                  fetch(getTableRecordUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json',
                      },
                  })
                  .then(response => response.json())
                  .then(result => console.log(result))
                  .catch(error => console.error('error', error));
              `}
                />
              </TabsContent>

              <TabsContent
                value='Add rows'
                className='flex flex-col align-top justify-stretch gap-4'
              >
                <h4 className='text-base font-bold'>Add rows</h4>
                <p className='text-base'>
                  Make POST request with Array of objects to add new rows into
                  table
                </p>
                <Input
                  type='text'
                  value={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records`}
                  onChange={() => {
                    return;
                  }}
                />
                <div className='flex flex-row align-baseline justify-end'>
                  <CopyButton
                    text={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records`}
                  />
                </div>
                <CodeHighlighter
                  code={`
                  const API_KEY = "your_api_key";
                  const createTableRecordsUrl = "https://api.dadix.net/api/v1/tables/${effectiveTableId}/records"

                  fetch(createTableRecordsUrl, {
                      method: "POST",
                      headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({"recordsData":[{"name":"Dadix","age":"1"}]}),
                  })
                  .then(response => response.json())
                  .then(result => console.log(result))
                  .catch(error => console.error('error', error));
              `}
                />
              </TabsContent>

              <TabsContent
                value='Update a row'
                className='flex flex-col align-top justify-stretch gap-4'
              >
                <h4 className='text-base font-bold'>Update a row</h4>
                <p className='text-base'>
                  Make PATCH request with row object, object should have _id key
                  value
                </p>
                <Input
                  type='text'
                  value={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(<_id>)`}
                  onChange={() => {
                    return;
                  }}
                />
                <div className='flex flex-row align-baseline justify-end'>
                  <CopyButton
                    text={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(<_id>)`}
                  />
                </div>
                <CodeHighlighter
                  code={`
                  const API_KEY = "your_api_key";
                  const patchTableRecordUrl = \`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?filterKey=id&filterValue=eq(\${id})\`

                  fetch(patchTableRecordUrl, {
                      method: "PATCH",
                      headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({"data":[{"name":"Dadix","age":"1"}]}),
                  })
                  .then(response => response.json())
                  .then(result => console.log(result))
                  .catch(error => console.error('error', error));
              `}
                />
              </TabsContent>

              <TabsContent
                value='Delete rows'
                className='flex flex-col align-top justify-stretch gap-4'
              >
                <h4 className='text-base font-bold'>Delete rows</h4>
                <p className='text-base'>
                  Make DELETE request with a list of _Ids
                </p>
                <Input
                  type='text'
                  value={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?ids=<_Ids>`}
                  onChange={() => {
                    return;
                  }}
                />
                <div className='flex flex-row align-baseline justify-end'>
                  <CopyButton
                    text={`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?ids=<_Ids>`}
                  />
                </div>
                <CodeHighlighter
                  code={`
                  const API_KEY = "your_api_key";
                  const ids = "1,2,3,6,8";
                  const deleteTableRecordsUrl = \`https://api.dadix.net/api/v1/tables/${effectiveTableId}/records?ids=\${ids})\`;

                  fetch(deleteTableRecordsUrl, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json',
                      },
                  })
                  .then(response => response.json())
                  .then(result => console.log(result))
                  .catch(error => console.error('error', error));
              `}
                />
              </TabsContent>
            </Tabs>
            <br />
            <br />
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const CopyButton = ({
  text,
  ...props
}: {
  text: string;
  label?: React.ReactNode;
} & React.ComponentProps<'button'>) => {
  return (
    <Button
      {...props}
      onClick={() => {
        copyText(text);
        toast(
          <div className='flex flex-row gap-2 text-[var(--foreground)]'>
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
      {props.children || 'Copy'}
    </Button>
  );
};

export function openAPIConfigDialog(options?: { tableId: string; projectId: string }) {
  window.dispatchEvent(
    new CustomEvent(OPEN_API_CONFIG_EVENT_NAME, { detail: options ?? {} })
  );
}
