import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { requiredEnv } from './cli.mts';
import { isRecord } from './guards.mts';
import {
  normalizeEtag,
  type R2Client,
  type R2DeleteResponse,
  type R2GetObjectResult,
} from './r2-transfer.mts';

export function createR2Client(
  environment: NodeJS.ProcessEnv = process.env,
): R2Client {
  return createR2ClientAdapter(createR2S3Client(environment));
}

export function createR2S3Client(
  environment: NodeJS.ProcessEnv = process.env,
): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID', environment),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY', environment),
    },
    endpoint: requiredEnv('R2_ENDPOINT', environment),
    region: 'auto',
  });
}

export function createR2ClientAdapter(
  client: Pick<S3Client, 'send'>,
): R2Client {
  return {
    async deleteObjects(bucket, keys): Promise<R2DeleteResponse> {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: false,
          },
        }),
      );

      return {
        deleted: (response.Deleted ?? [])
          .map((object) => object.Key)
          .filter((key): key is string => Boolean(key)),
        errors: (response.Errors ?? [])
          .filter((error) => Boolean(error.Key))
          .map((error) => ({
            code: error.Code,
            key: error.Key as string,
            message: error.Message,
          })),
      };
    },

    async getObject(
      bucket,
      key,
      expectedEtag,
      signal,
    ): Promise<R2GetObjectResult> {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            IfMatch: `"${normalizeEtag(expectedEtag)}"`,
            Key: key,
          }),
          signal ? { abortSignal: signal } : undefined,
        );
        if (!(response.Body && Symbol.asyncIterator in response.Body)) {
          throw new Error(`R2 returned no streaming body for ${bucket}/${key}`);
        }
        return {
          body: response.Body as AsyncIterable<Uint8Array>,
          status: 'ok',
        };
      } catch (error) {
        if (isNotFound(error)) {
          return { status: 'missing' };
        }
        if (isPreconditionFailed(error)) {
          return { status: 'changed' };
        }
        throw error;
      }
    },

    async headObject(bucket, key) {
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          etag: response.ETag,
          lastModified: response.LastModified,
          size: response.ContentLength,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },

    async listObjects(bucket, prefix, continuationToken) {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        }),
      );
      return {
        nextContinuationToken: response.NextContinuationToken,
        objects: (response.Contents ?? []).map((object) => ({
          etag: object.ETag,
          key: object.Key,
          lastModified: object.LastModified,
          size: object.Size,
        })),
      };
    },
  };
}

function isNotFound(error: unknown): boolean {
  return hasAwsErrorStatus(error, 404, 'NotFound', 'NoSuchKey');
}

export function isPreconditionFailed(error: unknown): boolean {
  return hasAwsErrorStatus(error, 412, 'PreconditionFailed');
}

function hasAwsErrorStatus(
  error: unknown,
  statusCode: number,
  ...names: string[]
): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  return (
    names.includes(String(error.name)) ||
    metadata?.httpStatusCode === statusCode
  );
}
