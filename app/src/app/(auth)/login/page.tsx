'use client';

import Link from 'next/link';

import { UserLoginForm } from '@/components/user-auth-form';
import { useLanguage } from '@/context/LanguageContext';

export default function LoginPage() {
  const { t } = useLanguage();
  return (
    <div className='pt-50 container mx-auto grid h-screen flex-col lg:px-0'>
      <div className='mx-auto flex w-[80vw] flex-col space-y-6 sm:w-[350px]'>
        <div className='flex flex-col space-y-2 text-center'>
          <p className='text-sm font-normal text-primary'>
            {t('auth.noAccount')}&nbsp;
            <Link
              href='/signup'
              className='hover:text-brand underline underline-offset-4'
            >
              {t('auth.signup')}
            </Link>
          </p>
        </div>
        <UserLoginForm />
        <p className='text-muted-foreground px-8 text-center text-sm'>
          <Link
            href='/terms'
            className='hover:text-brand underline underline-offset-4'
          >
            {t('auth.forgetPassword')}
          </Link>
        </p>
      </div>
    </div>
  );
}
