import { useEffect, useMemo, useRef, useState } from 'react';

import tableService from '@/lib/table';

import type { Field } from '@/types';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface EditTableTextFieldOptionsProps {
  textField: Field;
  tableId: number | string | undefined;
}

export function EditTableTextFieldOptions({
  textField,
  tableId,
}: EditTableTextFieldOptionsProps) {
  if (!tableId || !textField || !textField.textOptions) return null;

  return (
    <>
      <div className='flex flex-row flex-nowrap justify-start items-stretch gap-8'>
        <ToggleMultilines
          fieldId={textField.id}
          tableId={tableId}
          value={textField.textOptions.multiLines}
        />
        {textField.textOptions.multiLines && (
          <SelectMinMaxLines
            fieldId={textField.id}
            tableId={tableId}
            minLines={textField.textOptions.minLines}
            maxLines={textField.textOptions.maxLines}
          />
        )}
      </div>
    </>
  );
}

function ToggleMultilines({
  fieldId,
  tableId,
  value,
}: {
  fieldId: number;
  tableId: number | string | undefined;
  value: boolean;
}) {
  const fieldIdRef = useRef<number>(undefined);
  const tableIdRef = useRef<number | string>(undefined);
  const saveChangesTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const [switchValue, setSwitchValue] = useState<boolean>(false);

  useEffect(() => {
    if (tableId === tableIdRef.current && fieldId === fieldIdRef.current)
      return;

    tableIdRef.current = tableId;
    fieldIdRef.current = fieldId;
    setSwitchValue(value);
  }, [fieldId, tableId, value]);

  const handleToggleMultilines = (isChecked: boolean) => {
    if (!tableIdRef.current || !fieldIdRef.current) return;

    clearTimeout(saveChangesTimeoutRef.current);
    const tableId = tableIdRef.current;
    const fieldId = fieldIdRef.current;
    saveChangesTimeoutRef.current = setTimeout(async () => {
      await tableService.patchTableTextFieldOptions({
        tableId,
        fieldId,
        data: {
          multiLines: isChecked,
        },
      });
    }, 800);
  };

  return (
    <div className='flex flex-col items-start justify-between gap-1 text-sm font-medium'>
      <div>Multiple lines</div>

      <div className='flex flex-col justify-center items-center h-[3.5em]'>
        <Switch
          checked={switchValue}
          onCheckedChange={(isChecked) => {
            setSwitchValue(isChecked);
            handleToggleMultilines(isChecked);
          }}
          aria-label='Toggle multilines'
        />
      </div>
    </div>
  );
}

function SelectMinMaxLines({
  fieldId,
  tableId,
  minLines,
  maxLines,
}: {
  fieldId: number;
  tableId: number | string | undefined;
  minLines: number;
  maxLines: number;
}) {
  const fieldIdRef = useRef<number>(undefined);
  const tableIdRef = useRef<number | string>(undefined);
  const saveChangesTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const [minLinesValue, setMinLinesValue] = useState<number>(1);
  const [maxLinesValue, setMaxLinesValue] = useState<number>(0);

  useEffect(() => {
    if (tableId === tableIdRef.current && fieldId === fieldIdRef.current)
      return;

    tableIdRef.current = tableId;
    fieldIdRef.current = fieldId;
    setMinLinesValue(minLines);
    setMaxLinesValue(maxLines);
  }, [fieldId, tableId, minLines, maxLines]);

  const handleMinLinesChanges = (newMinValue: number) => {
    newMinValue = Math.max(1, Math.min(newMinValue, 9)); // force minLines value to be between 1 and 9
    let newMaxValue = maxLinesValue;
    setMinLinesValue(newMinValue);
    if (newMinValue > maxLinesValue && maxLinesValue !== 0) {
      newMaxValue = newMinValue;
      setMaxLinesValue(newMaxValue);
    }
    handleMinMaxLinesChanges({
      minLines: newMinValue,
      maxLines: newMaxValue,
    });
  };

  const handleMaxLinesChanges = (newMaxValue: number) => {
    newMaxValue = Math.max(0, Math.min(newMaxValue, 9)); // force maxLines value to be between 0 and 9 (0 is for auto)
    let newMinValue = minLinesValue;
    setMaxLinesValue(newMaxValue);
    if (newMaxValue < minLinesValue && newMaxValue !== 0) {
      newMinValue = newMaxValue;
      setMinLinesValue(newMinValue);
    }
    handleMinMaxLinesChanges({
      minLines: newMinValue,
      maxLines: newMaxValue,
    });
  };

  const handleMinMaxLinesChanges = ({
    minLines,
    maxLines,
  }: {
    minLines: number;
    maxLines: number;
  }) => {
    if (!tableIdRef.current || !fieldIdRef.current) return;

    clearTimeout(saveChangesTimeoutRef.current);
    const tableId = tableIdRef.current;
    const fieldId = fieldIdRef.current;
    saveChangesTimeoutRef.current = setTimeout(async () => {
      await tableService.patchTableTextFieldOptions({
        tableId,
        fieldId,
        data: {
          maxLines,
          minLines,
        },
      });
    }, 800);
  };

  const numberOfLinesOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i < 10; i++) {
      options.push(
        <SelectItem value={`${i}`} key={`min_${i}`}>
          {i}
        </SelectItem>
      );
    }
    return options;
  }, []);

  return (
    <>
      <div className='flex flex-col items-start justify-between gap-1 text-sm font-medium'>
        <div>Min lines</div>
        <div className='flex flex-col justify-center items-center h-[3.5em]'>
          <Select
            onValueChange={(newMinLines) => {
              handleMinLinesChanges(parseInt(newMinLines));
            }}
            value={`${minLinesValue}`}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{numberOfLinesOptions}</SelectContent>
          </Select>
        </div>
      </div>
      <div className='flex flex-col items-start justify-between gap-1 text-sm font-medium'>
        <div>Max lines</div>
        <div className='flex flex-col justify-center items-center h-[3.5em]'>
          <Select
            onValueChange={(newMaxLines) => {
              handleMaxLinesChanges(parseInt(newMaxLines));
            }}
            value={`${maxLinesValue}`}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numberOfLinesOptions}
              <SelectItem value={`${0}`}>Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
