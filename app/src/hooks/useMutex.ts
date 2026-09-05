import { useRef } from 'react';

interface CallbackArgs {
  lastUpdatedData: unknown | undefined;
}
interface CallbackReturn {
  updatedData: unknown | undefined;
}
type Callback = ({ ..._args }: CallbackArgs) => Promise<CallbackReturn>;

export function useMutex() {
  const locked = useRef<boolean>(false);
  const waitingList = useRef<
    {
      callback: Callback;
    }[]
  >([]);

  function acquire({ callback }: { callback: Callback }) {
    waitingList.current.push({ callback });
    executeWaitingList();
  }

  async function executeWaitingList() {
    if (locked.current) return;
    locked.current = true;

    let lastUpdatedData: unknown = undefined;
    do {
      const nextTask = waitingList.current.shift();

      if (!nextTask) break;

      try {
        const updatedData = (await nextTask.callback({ lastUpdatedData }))
          ?.updatedData;
        lastUpdatedData = updatedData;
      } catch (err) {
        console.warn(err);
      }
    } while (waitingList.current.length > 0);

    locked.current = false;
  }

  return { acquire };
}
