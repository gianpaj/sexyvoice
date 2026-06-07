import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';

export const config = {
  api: {
    bodyParser: false,
  },
};

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } =
  process.env;

const DEFAULT_PUBLIC_URL = 'https://files.sexyvoice.ai';

if (
  !(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME)
) {
  throw new Error('R2 environment variables are not fully configured.');
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const uploadFileToR2 = async (
  filename: string,
  buffer: PutObjectCommandInput['Body'],
  contentType: string,
  bucketName: string = R2_BUCKET_NAME,
  publicBaseUrl: string = DEFAULT_PUBLIC_URL,
) => {
  const params: PutObjectCommandInput = {
    Bucket: bucketName,
    Key: filename,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
  };

  await s3Client.send(new PutObjectCommand(params));
  return `${publicBaseUrl}/${filename}`;
};

export const R2_PUBLIC_HOST = new URL(DEFAULT_PUBLIC_URL).host;

/**
 * Fetch an object directly from R2 via the S3 API (authenticated).
 *
 * The public Cloudflare URL (files.sexyvoice.ai) cannot be fetched
 * server-side because Cloudflare's bot protection blocks datacenter requests,
 * and it cannot be fetched client-side because the origin sends no CORS
 * headers. Reading straight from the bucket sidesteps both.
 */
export const getFileFromR2 = (
  key: string,
  bucketName: string = R2_BUCKET_NAME,
) => {
  return s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
};

export const deleteFileFromR2 = async (filename: string) => {
  const params = {
    Bucket: R2_BUCKET_NAME,
    Key: filename,
  };

  await s3Client.send(new DeleteObjectCommand(params));
};
