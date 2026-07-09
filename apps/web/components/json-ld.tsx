interface JsonLdProps {
  data: unknown;
  id?: string;
}

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON is escaped below to neutralize </script> breakouts
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
      id={id}
      type="application/ld+json"
    />
  );
}
