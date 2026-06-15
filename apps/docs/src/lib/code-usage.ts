import {
  createCodeUsageGeneratorRegistry,
  // type CodeUsageGenerator,
} from 'fumadocs-openapi/requests/generators';
import { registerDefault } from 'fumadocs-openapi/requests/generators/all';
export const codeUsages = createCodeUsageGeneratorRegistry();

// include defaults
registerDefault(codeUsages);
