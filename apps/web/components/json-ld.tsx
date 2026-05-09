type JsonLdProps = {
  data: unknown;
  id?: string;
};

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      id={id}
      type="application/ld+json"
    />
  );
}
