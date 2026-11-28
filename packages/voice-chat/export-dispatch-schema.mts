import { z } from 'zod';

import { pythonCallDispatchSchema } from './src/dispatch.ts';

process.stdout.write(
  `${JSON.stringify(z.toJSONSchema(pythonCallDispatchSchema), null, 2)}\n`,
);
