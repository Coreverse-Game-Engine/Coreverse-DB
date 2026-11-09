// Validation schemas for the /releases edge function.
//
// Kept separate from index.ts so they can be unit tested (schemas.test.ts)
// without spinning up a Supabase client or network access.

import { z, } from 'zod';

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const STATUS_VALUES = ['stable', 'beta', 'rc', 'deprecated',] as const;

export const VersionParamSchema = z
  .string()
  .regex(VERSION_PATTERN, 'expected MAJOR.MINOR.PATCH, e.g. 1.4.2',);

export const ListQuerySchema = z.object({
  status: z.enum(STATUS_VALUES,).optional(),
  limit: z.coerce.number().int().min(1,).max(100,).default(20,),
  offset: z.coerce.number().int().min(0,).default(0,),
},);

export const LatestQuerySchema = z.object({
  status: z.enum(STATUS_VALUES,).default('stable',),
},);

export const OS_VALUES = ['windows', 'linux', 'macos',] as const;
export const ARCHITECTURE_VALUES = ['x86_64', 'arm64',] as const;

// GET /releases/{version}/delta?from=&os=&architecture=
export const DeltaQuerySchema = z.object({
  from: VersionParamSchema,
  os: z.enum(OS_VALUES,),
  architecture: z.enum(ARCHITECTURE_VALUES,),
},);

export type ListQuery = z.infer<typeof ListQuerySchema>;
export type LatestQuery = z.infer<typeof LatestQuerySchema>;
export type DeltaQuery = z.infer<typeof DeltaQuerySchema>;
