'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';

import { cn } from '@/lib/utils';
import {
  logInUserAuthSchema,
  signUpUserAuthSchema,
} from '@/lib/validations/auth';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';

import { useAuthContext } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type UserAuthFormProps = React.HTMLAttributes<HTMLDivElement>;

type SignUpFormData = z.infer<typeof signUpUserAuthSchema>;
type LogInFormData = z.infer<typeof logInUserAuthSchema>;

const DEV_LOGIN = {
  email: 'test@example.com',
  password: 'Test1234!',
};

export function UserLoginForm({ className, ...props }: UserAuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LogInFormData>({
    resolver: zodResolver(logInUserAuthSchema),
    defaultValues:
      process.env.NODE_ENV === 'development' ? DEV_LOGIN : undefined,
  });
  const authCtx = useAuthContext();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    if (authCtx.state.authenticated && authCtx.state.initialized) {
      router.replace('/');
    }
  }, [authCtx.state, router]);

  async function onSubmit(data: LogInFormData) {
    setIsLoading(true);

    try {
      const ok = await authCtx.methods.login(data.email, data.password);

      if (ok) {
        toast('Login successful!', {
          description: 'Welcome back!',
        });
        router.replace('/');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast('Something went wrong.', {
        description: 'Your login request failed. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  // if (!authCtx.state.authenticated) {
  //   return null;
  // }

  return (
    <div className={cn('grid gap-6', className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className='grid gap-5'>
          <div className='grid gap-2'>
            <Label className='' htmlFor='email'>
              {t('auth.email')}
            </Label>
            <Input
              id='email'
              placeholder={t('auth.email')}
              type='email'
              autoCapitalize='none'
              autoComplete='email'
              autoCorrect='off'
              disabled={isLoading}
              {...register('email')}
            />
            {errors?.email && (
              <p className='px-1 text-xs text-red-600'>
                {errors.email.message}
              </p>
            )}
          </div>
          <div className='grid gap-2'>
            <Label className='' htmlFor='password'>
              {t('auth.password')}
            </Label>
            <Input
              id='password'
              placeholder={t('auth.password')}
              type='password'
              autoCapitalize='none'
              autoComplete='password'
              autoCorrect='off'
              disabled={isLoading}
              {...register('password')}
            />
            {errors?.password && (
              <p className='px-1 text-xs text-red-600'>
                {errors.password.message}
              </p>
            )}
          </div>
          <button className={cn(buttonVariants())} disabled={isLoading}>
            {isLoading && <LoaderCircle className='mr-2 size-4 animate-spin' />}
            {t('auth.login')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function UserSignupForm({ className, ...props }: UserAuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpUserAuthSchema),
  });
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const authCtx = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (authCtx.state.authenticated && authCtx.state.initialized) {
      router.replace('/');
    }
  }, [authCtx.state, router]);

  async function onSubmit(data: SignUpFormData) {
    setIsLoading(true);

    try {
      await authCtx.methods.signup(data.email, data.password);

      // Check if signup was successful by checking the auth state
      if (authCtx.state.authenticated) {
        toast('Account created successfully!', {
          description: 'Welcome! Your account has been created.',
        });
        router.replace('/');
      } else {
        toast('Signup failed', {
          description: 'Unable to create account. Please try again.',
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast('Something went wrong.', {
        description: 'Your signup request failed. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn('grid gap-6', className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className='grid gap-5'>
          <div className='grid gap-2'>
            <Label className='' htmlFor='email'>
              {t('auth.email')}
            </Label>
            <Input
              id='email'
              placeholder={t('auth.email')}
              type='email'
              autoCapitalize='none'
              autoComplete='email'
              autoCorrect='off'
              disabled={isLoading}
              {...register('email')}
            />
            {errors?.email && (
              <p className='px-1 text-xs text-red-600'>
                {errors.email.message}
              </p>
            )}
          </div>
          <div className='grid gap-2'>
            <Label className='' htmlFor='password'>
              {t('auth.password')}
            </Label>
            <Input
              id='password'
              placeholder={t('auth.password')}
              type='password'
              autoCapitalize='none'
              autoComplete='password'
              autoCorrect='off'
              disabled={isLoading}
              {...register('password')}
            />
            {errors?.password && (
              <p className='px-1 text-xs text-red-600'>
                {errors.password.message}
              </p>
            )}
          </div>
          <div className='grid gap-2'>
            <Label className='' htmlFor='confirmPassword'>
              {t('auth.confirmPassword')}
            </Label>
            <Input
              id='confirmPassword'
              placeholder={t('auth.confirmPassword')}
              type='password'
              autoCapitalize='none'
              autoComplete='new-password'
              autoCorrect='off'
              disabled={isLoading}
              {...register('confirmPassword')}
            />
            {errors?.confirmPassword && (
              <p className='px-1 text-xs text-red-600'>
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
          <button className={cn(buttonVariants())} disabled={isLoading}>
            {isLoading && <LoaderCircle className='mr-2 size-4 animate-spin' />}
            {t('auth.signup')}
          </button>
        </div>
      </form>
    </div>
  );
}
