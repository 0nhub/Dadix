import { z } from 'zod';

export const dataTableSchema = z.object({
  id: z.string(),
  title: z.string(),
  // status: z.string(),
  status: z.enum(['Work', 'Play', 'Focus']),
  isPublished: z.boolean(),
  number: z.number(),
  date: z.date(),
});

export const tableFieldsSchema = z.object({
  id: z.number(),
  icon: z.string(),
  name: z.string(),
  type: z.string(),
  order: z.number(),
  options: z
    .array(
      z.object({
        value: z.string(),
        color: z.string(),
        id: z.union([z.string(), z.number()]),
        order: z.number(),
      })
    )
    .optional(),
});
