import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export function CreditAllowanceAlertEmail({
  thresholdPercent,
  creditsRemaining,
}: {
  thresholdPercent: 80 | 95 | 100;
  creditsRemaining: number;
}) {
  const usagePercent = thresholdPercent;

  return (
    <Html>
      <Head />
      <Preview>
        {`Your SexyVoice API credits are ${usagePercent}% used.`}
      </Preview>
      <Body
        style={{ backgroundColor: '#f6f9fc', fontFamily: 'Inter, sans-serif' }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            margin: '24px auto',
            maxWidth: '560px',
            padding: '24px',
          }}
        >
          <Heading style={{ fontSize: '22px', marginBottom: '8px' }}>
            Credit usage alert
          </Heading>
          <Text style={{ color: '#4b5563', fontSize: '14px', marginTop: 0 }}>
            {`Your API credit allowance is now ${usagePercent}% consumed.`}
          </Text>
          <Section
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <Text style={{ fontSize: '14px', margin: 0 }}>
              Remaining credits:{' '}
              <strong>{String(Math.max(0, creditsRemaining))}</strong>
            </Text>
          </Section>
          <Hr style={{ margin: '24px 0' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px', marginBottom: 0 }}>
            You are receiving this because your external Speech API usage is
            close to your latest purchased/top-up credit allowance.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
