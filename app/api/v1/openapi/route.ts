import { createExternalApiOpenApiDocument } from '@/lib/api/openapi';

export async function GET() {
  return Response.json(createExternalApiOpenApiDocument(), { status: 200 });
}
