'use client';

import Link from 'next/link';

import { UserSignupForm } from '@/components/user-auth-form';
import { useLanguage } from '@/context/LanguageContext';

export default function SignupPage() {
  const { t } = useLanguage();
  return (
    <div className='pt-50 container mx-auto grid h-screen flex-col lg:px-0'>
      <div className=''>
        <div className='mx-auto flex w-[80vw] flex-col justify-center space-y-6 sm:w-[350px]'>
          <div className='flex flex-col space-y-2 text-center'>
            <p className='text-sm font-normal text-primary'>
              {t('auth.hasAccount')}&nbsp;
              <Link
                href='/login'
                className='hover:text-brand underline underline-offset-4'
              >
                {t('auth.login')}
              </Link>
            </p>
          </div>
          <UserSignupForm />
          <p className='text-muted-foreground flex flex-col px-8 text-center text-sm'>
            <Link href='/terms' className='hover:text-brand underline underline-offset-4'>
              {t('auth.agreeTerms')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
