import { createExternalApiOpenApiDocument } from '@/lib/api/openapi';

export function GET() {
  return Response.json(createExternalApiOpenApiDocument(), { status: 200 });
}
