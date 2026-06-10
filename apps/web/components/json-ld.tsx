interface JsonLdProps {
  data: unknown;
  id?: string;
}

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: we control the input
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      id={id}
      type="application/ld+json"
    />
  );
}
