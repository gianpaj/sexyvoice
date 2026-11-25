import { z } from 'zod';

export const PYTHON_CALL_RUNTIME = 'voice-chat-python';
export const DISPATCH_LIFETIME_MS = 120_000;

export const pythonCallDispatchSchema = z.strictObject({
  version: z.literal(1),
  runtime: z.literal(PYTHON_CALL_RUNTIME),
  roomName: z
    .string()
    .regex(/^voice-chat-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/),
  userId: z.uuid(),
  conversationId: z.uuid(),
  resume: z.boolean(),
  expiresAt: z.number().int().positive(),
  audioReferenceId: z.uuid().optional(),
});

type PythonCallSelection = Omit<
  z.input<typeof pythonCallDispatchSchema>,
  'version' | 'runtime' | 'expiresAt'
>;

export function createPythonCallDispatchMetadata(
  selection: PythonCallSelection,
) {
  const payload = pythonCallDispatchSchema.parse({
    ...selection,
    version: 1,
    runtime: PYTHON_CALL_RUNTIME,
    expiresAt: Date.now() + DISPATCH_LIFETIME_MS,
  });
  return JSON.stringify(payload);
}
