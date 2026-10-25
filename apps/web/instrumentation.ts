// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from '@sentry/opentelemetry';
import { registerOTel } from '@vercel/otel';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // @vercel/otel owns the tracer provider (Sentry sets skipOpenTelemetrySetup).
    // The 'auto' span processor exports to the OTEL_EXPORTER_OTLP_* endpoint
    // (Dash0); SentrySpanProcessor sends the same spans to Sentry.
    const sentryClient = Sentry.getClient();
    registerOTel({
      contextManager: new Sentry.SentryContextManager(),
      propagators: ['auto', new SentryPropagator()],
      serviceName: 'sexyvoice',
      spanProcessors: ['auto', new SentrySpanProcessor()],
      traceSampler: sentryClient ? new SentrySampler(sentryClient) : 'auto',
    });
    Sentry.validateOpenTelemetrySetup();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
