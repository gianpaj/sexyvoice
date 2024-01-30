// import { put, list } from '@vercel/blob';
// import { revalidatePath } from 'next/cache';
// import Image from 'next/image';

// export async function Upload() {
//   // async function uploadImage(formData: FormData) {
//   //   // 'use server';
//   //   const imageFile = formData.get('image') as File;
//   //   const blob = await put(imageFile.name, imageFile, {
//   //     access: 'public',
//   //   });
//   //   revalidatePath('/');
//   //   return blob;
//   // }

//   return (
//     <div>
//       {/* <form action={uploadImage}> */}
//       <form action={}>
//         <label htmlFor="image">Image</label>
//         <input type="file" id="image" name="image" required />
//         <button>Upload</button>
//       </form>
//       <Images />
//     </div>
//   );
// }


// async function Images() {
//   async function allImages() {
//     const blobs = await list();
//     return blobs;
//   }
//   const images = await allImages();

//   return (
//     <section>
//       {images.blobs.map((image) => (
//         <Image
//           priority
//           key={image.pathname}
//           src={image.url}
//           alt="Image"
//           width={200}
//           height={200}
//         />
//       ))}
//     </section>
//   );
// }
'use client';

import type { PutBlobResult } from '@vercel/blob';
import { useState, useRef } from 'react';

export default function UploadPage() {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<PutBlobResult | null>(null);
  return (
    <div className='mx-auto mt-4'>
      <h1>Upload an image</h1>

      <form
        onSubmit={async (event) => {
          event.preventDefault();

          if (!inputFileRef.current?.files) {
            throw new Error('No file selected');
          }

          const file = inputFileRef.current.files[0];

          const response = await fetch(
            `/api/image-upload?filename=${file.name}`,
            {
              method: 'POST',
              body: file,
            },
          );

          const newBlob = (await response.json()) as PutBlobResult;

          setBlob(newBlob);
        }}
      >
        <input name="file" ref={inputFileRef} type="file" required />
        <button type="submit">Upload</button>
      </form>
      {blob && (
        <div>
          Blob url: <a href={blob.url}>{blob.url}</a>
        </div>
      )}
    </div>
  );
}
