import {
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';

export const config = {
  api: {
    bodyParser: false,
  },
};

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const uploadFileToR2 = async (
  filename: string,
  buffer: PutObjectCommandInput['Body'],
  contentType: string,
) => {
  const params: PutObjectCommandInput = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: filename,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
  };

  await s3Client.send(new PutObjectCommand(params));
  return `https://files.sexyvoice.ai/${filename}`;
};
