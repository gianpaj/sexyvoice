'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { TextField } from '@radix-ui/themes'
import * as Form from '@radix-ui/react-form'
import { Theme } from '@radix-ui/themes'

import { Button } from '@/components/ui/button'

import styles from './upload.module.scss'
import '@radix-ui/themes/styles.css'
import { IconTrash } from '@/components/ui/icons'

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

export default function UploadPage() {
  const inputFileRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [images, setImages] = useState<Image[] | null>(null)

  const getAndSetImages = async () => {
    const getImages = async (): Promise<Image[]> => {
      const response = await fetch('/api/images')
      const images = await response.json()
      return images
    }
    setIsLoading(true)
    getImages()
      .then(images => setImages(images))
      .catch(err => console.log(err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    getAndSetImages()
  }, [])

  const onUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!inputFileRef.current?.files) {
      throw new Error('No file(s) selected')
    }

    const file = inputFileRef.current.files[0]

    try {
      await fetch(`/api/images?filename=${file.name}`, {
        method: 'POST',
        body: file
      })
      // revalidatePath('/uploads')
      getAndSetImages()
    } catch (err) {
      inputFileRef.current.files = null
    }
  }

  return (
    <Theme>
      <div className={`${styles.uploadPage} mt-4`}>
        <h1 className="text-center text-2xl my-8">Upload images</h1>
        <h2 className="text-center">
          Upload an image and get a public URL to it. (Vercel Blob)
        </h2>
        <Form.Root className="flex justify-center" onSubmit={onUpload}>
          <Form.Field name="file">
            <Form.Control asChild>
              <TextField.Input ref={inputFileRef} type="file" required />
            </Form.Control>
          </Form.Field>
          <Form.Submit asChild>
            <Button className="ml-2" type="submit">
              Upload
            </Button>
          </Form.Submit>
        </Form.Root>
        <div className="flex justify-center mt-6">
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            images && <Images images={images} callback={getAndSetImages} />
          )}
        </div>
      </div>
    </Theme>
  )
}

function Images({
  images,
  callback
}: {
  images: Image[]
  callback?: () => void
}) {
  const onDelete = async (url: string) => {
    try {
      await fetch(`/api/images?filename=${url}`, {
        method: 'DELETE'
      })
      callback?.()
    } catch (err) {
      console.log(err)
    }
  }

  if (!images.length) {
    return <p>No images uploaded yet</p>
  }

  return (
    <section>
      {images.map(image => (
        <div className="mb-3 flex" key={image.pathname}>
          <Image
            priority
            src={image.url}
            alt="Image"
            width={200}
            height={200}
          />
          <Button
            title="Delete"
            variant="outline"
            className="justify-self-center self-center ml-2"
            onClick={() => onDelete(image.url)}
          >
            <IconTrash aria-label="Delete" />
          </Button>
        </div>
      ))}
    </section>
  )
}
