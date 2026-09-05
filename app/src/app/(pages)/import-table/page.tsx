'use client';

import { callApi } from '@/lib/api';
import { useState, type FormEvent } from 'react';

export default function ImportTable() {
  const [uploading, setUploading] = useState<boolean>(false);
  const handleSubmit = async (evnt: FormEvent<HTMLInputElement>) => {
    const target = evnt.target as HTMLInputElement;
    try {
      if (!target || !target.files) {
        return;
      }
      setUploading(true);
      const form = new FormData();
      form.append('file', target.files[0]);
      const uploading = await callApi.post('/table/import', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      if (uploading.status && uploading.data?.tableId) {
        document.location.href = `/dashboard/${uploading.data?.tableId}`;
      }
    } catch (err) {
      console.error(err);
    } finally {
      target.value = '';
      setUploading(false);
    }
  };
  return (
    <div>
      <form className='bg-[var(--secondary)] border-4 p-0 w-[calc(100vw-30px)] max-w-[420px] ml-auto mr-auto mt-[100px]'>
        <label
          className='block border-2 w-full h-full p-[40px] pl-0 pr-0 m-0 text-center'
          htmlFor='fileInput'
        >
          {uploading ? 'uploading file..' : 'Upload a .csv file'}
        </label>
        <input
          className='hidden border-2 w-full h-full m-0 p-0'
          name='fileInput'
          id='fileInput'
          type='file'
          accept='.csv'
          required
          onInput={(evnt) => {
            handleSubmit(evnt);
          }}
        />
      </form>
    </div>
  );
}
