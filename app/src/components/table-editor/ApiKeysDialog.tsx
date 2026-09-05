'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LucideX, LucideTrash2, LucidePlus } from 'lucide-react';
import {
  getAIApiKeys,
  addAIApiKey,
  removeAIApiKey,
  AI_PROVIDER_LABELS,
  AI_MODEL_OPTIONS,
  type AIApiKeyEntry,
  type AIApiProvider,
} from '@/lib/aiApiKeys';

export const OPEN_API_KEYS_DIALOG_EVENT = 'dadix-open-api-keys-dialog';

export function openApiKeysDialog(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_API_KEYS_DIALOG_EVENT));
  }
}

const PROVIDERS: { value: AIApiProvider; label: string }[] = [
  { value: 'openai', label: AI_PROVIDER_LABELS.openai },
  { value: 'anthropic', label: AI_PROVIDER_LABELS.anthropic },
  { value: 'google', label: AI_PROVIDER_LABELS.google },
  { value: 'deepseek', label: AI_PROVIDER_LABELS.deepseek },
  { value: 'azure', label: AI_PROVIDER_LABELS.azure },
];

export function ApiKeysDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [entries, setEntries] = useState<AIApiKeyEntry[]>([]);
  const [provider, setProvider] = useState<AIApiProvider>('openai');
  const [model, setModel] = useState('');
  const [azureEndpoint, setAzureEndpoint] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');

  const models = useMemo(() => AI_MODEL_OPTIONS[provider] ?? [], [provider]);
  const isAzure = provider === 'azure';

  useEffect(() => {
    if (open) setEntries(getAIApiKeys());
  }, [open]);

  useEffect(() => {
    if (isAzure) {
      setModel('');
    } else {
      const opts = AI_MODEL_OPTIONS[provider];
      const firstId = opts?.[0]?.id ?? '';
      setModel(firstId);
    }
    setAzureEndpoint('');
  }, [provider, isAzure]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const k = key.trim();
    if (!n || !k) return;
    if (isAzure && !azureEndpoint.trim()) return;
    if (!isAzure && !model) return;
    addAIApiKey({
      provider,
      model: isAzure ? undefined : model,
      azureEndpoint: isAzure ? azureEndpoint.trim() : undefined,
      name: n,
      key: k,
    });
    setEntries(getAIApiKeys());
    setName('');
    setKey('');
    setAzureEndpoint('');
    setModel(isAzure ? '' : models[0]?.id ?? '');
  };

  const handleRemove = (id: string) => {
    removeAIApiKey(id);
    setEntries(getAIApiKeys());
  };

  const canSubmit =
    name.trim() &&
    key.trim() &&
    (isAzure ? azureEndpoint.trim() : model);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md' showCloseButton={false}>
        <DialogHeader className='flex flex-row justify-start items-center'>
          <Button
            size='icon'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            <LucideX />
          </Button>
        </DialogHeader>
        <div className='space-y-6 pt-2'>
          <ul className='space-y-2 max-h-40 overflow-y-auto'>
            {entries.map((e) => (
              <li
                key={e.id}
                className='flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'
              >
                <span className='font-medium truncate'>{e.name}</span>
                <span className='text-muted-foreground shrink-0'>
                  {AI_PROVIDER_LABELS[e.provider as AIApiProvider] ?? e.provider}
                  {e.model ? ` · ${e.model}` : ''}
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='shrink-0'
                  onClick={() => handleRemove(e.id)}
                >
                  <LucideTrash2 className='size-4' />
                </Button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAdd} className='space-y-5 border-t pt-6'>
            <div className='space-y-2'>
              <Label>Select Service</Label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as AIApiProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isAzure && (
              <div className='space-y-2'>
                <Label>Select Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue placeholder='Select model' />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isAzure && (
              <div className='space-y-2'>
                <Label>Azure Endpoint URL</Label>
                <Input
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                  placeholder='https://YOUR-RESOURCE.../deployments/YOUR-DEPLOYMENT/...'
                />
                <p className='text-xs text-muted-foreground mt-1'>
                  For Azure, the model is determined by the deployment URL.
                </p>
              </div>
            )}
            <div className='space-y-2'>
              <Label>API Key</Label>
              <Input
                type='password'
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder='Paste key here...'
              />
            </div>
            <div className='space-y-2'>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. My OpenAI key'
              />
            </div>
            <DialogFooter>
              <Button type='submit' disabled={!canSubmit}>
                <LucidePlus className='size-4' />
                Add key
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
