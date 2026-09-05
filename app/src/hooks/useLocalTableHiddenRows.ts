import { useEffect, useRef } from 'react';

interface useLocalTableHiddenRowsProps {
  tableId: string | number | undefined;
}
export function useLocalTableHiddenRows({
  tableId,
}: useLocalTableHiddenRowsProps) {
  const tableRows = useRef<Record<string, unknown>[]>([]);
  const available = useRef<boolean>(true);
  const key = useRef<string>(undefined);
  const waitingList = useRef<
    {
      requestKey: string | undefined;
      resolve: (_arg: unknown) => void;
      reject: (_arg?: unknown) => void;
    }[]
  >([]);

  useEffect(() => {
    resetLocalTableHiddenRows();
  }, [tableId]);

  function resetLocalTableHiddenRows() {
    tableRows.current = [];
    available.current = true;
    waitingList.current.map((request) => request.reject());
    waitingList.current = [];
    key.current = `${new Date().getTime()}${Math.floor(Math.random() * 9999)}-${Math.floor(Math.random() * 999)}-${Math.floor(Math.random() * 99999)}`;
  }

  function resolveNextRequest() {
    available.current = false;
    const nextRequest = waitingList.current.shift();
    if (!nextRequest) {
      available.current = true;
      return null;
    }
    const { requestKey, reject, resolve } = nextRequest;
    if (!requestKey || key.current !== requestKey) {
      available.current = true;
      return reject();
    }
    available.current = false;
    resolve(true);
  }

  async function waitUntilItisAvailable(requestKey: string | undefined) {
    return await new Promise((resolve, reject) => {
      if (!requestKey) return reject();
      if (key.current !== requestKey) return reject();
      if (waitingList.current.length === 0 && available.current) {
        available.current = false;
        return resolve(true);
      }
      waitingList.current.push({ requestKey, resolve, reject });
    });
  }

  async function insertLocalTableHiddenRow({
    row,
  }: {
    row: Record<string, unknown>;
  }) {
    const currentKey = key.current;
    try {
      await waitUntilItisAvailable(currentKey);
    } catch (err) {
      console.warn('Error while insertLocalTableHiddenRow', err);
      resolveNextRequest();
      return null;
    }
    if (currentKey !== key.current) {
      resolveNextRequest();
      return null;
    }
    tableRows.current = [...tableRows.current, { ...row }];
    resolveNextRequest();
  }

  async function updateLocalTableHiddenRow({
    rowId,
    updates,
  }: {
    rowId: number;
    updates: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    const currentKey = key.current;
    try {
      await waitUntilItisAvailable(currentKey);
    } catch (err) {
      console.warn('Error while updateLocalTableHiddenRow', err);
      resolveNextRequest();
      return null;
    }
    if (currentKey !== key.current) {
      resolveNextRequest();
      return null;
    }
    let updatedRow = null;
    tableRows.current = tableRows.current.map((row) => {
      if (`${row.id}` === `${rowId}`) {
        updatedRow = { ...row, ...updates };
        return updatedRow;
      }
      return row;
    });
    resolveNextRequest();
    return updatedRow;
  }

  async function removeLocalTableHiddenRow({ rowId }: { rowId: number }) {
    const currentKey = key.current;
    try {
      await waitUntilItisAvailable(currentKey);
    } catch (err) {
      console.warn('Error while removeLocalTableHiddenRow', err);
      resolveNextRequest();
      return null;
    }
    if (currentKey !== key.current) {
      resolveNextRequest();
      return;
    }
    tableRows.current = tableRows.current.filter((row) => row.id !== rowId);
    resolveNextRequest();
  }

  return {
    insertLocalTableHiddenRow,
    updateLocalTableHiddenRow,
    removeLocalTableHiddenRow,
    resetLocalTableHiddenRows,
  };
}
