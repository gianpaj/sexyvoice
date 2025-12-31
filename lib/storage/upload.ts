import {
  DeleteObjectCommand,
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
) => {
  const params: PutObjectCommandInput = {
    Bucket: R2_BUCKET_NAME,
    Key: filename,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
  };

  await s3Client.send(new PutObjectCommand(params));
  return `https://files.sexyvoice.ai/${filename}`;
};

export const deleteFileFromR2 = async (filename: string) => {
  const params = {
    Bucket: R2_BUCKET_NAME,
    Key: filename,
  };

  await s3Client.send(new DeleteObjectCommand(params));
};
