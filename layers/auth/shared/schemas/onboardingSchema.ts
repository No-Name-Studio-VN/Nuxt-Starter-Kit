import { z } from 'zod';

export const onboardingStepIdSchema = z.string().min(1);
