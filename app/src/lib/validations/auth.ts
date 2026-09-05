import * as z from 'zod';

export const emailValidator = z.string().email();

export const passwordValidator = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long.' })
  .regex(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter.',
  })
  .regex(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter.',
  })
  .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
  .regex(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character.',
  });

export const userNameValidator = z
  .string()
  .min(3, { message: 'User name must be at least 3 characters long.' })
  .regex(/^[a-zA-Z0-9 ]+$/, {
    message: 'User name must contain only english letters or numbers.',
  });

export const signUpUserAuthSchema = z
  .object({
    email: emailValidator,
    password: passwordValidator,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const logInUserAuthSchema = z.object({
  email: emailValidator,
  password: passwordValidator,
});

export function simpleZodResolver(
  value: string,
  validator: z.ZodSchema
): string {
  try {
    validator.parse(value);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return err.errors[0]?.message || '';
    }
  }
  return '';
}
