import type { ParsedArgs } from 'citty';
import type { initArgs, kitArgs } from '../arguments';

export type KitOptions = Pick<ParsedArgs<typeof kitArgs>, 'kit' | 'allow-dirty-kit'>;
export type InitOptions = ParsedArgs<typeof initArgs>;
