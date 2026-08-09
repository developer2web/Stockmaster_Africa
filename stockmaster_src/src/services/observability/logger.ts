import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase/client';

type Severity = 'warning' | 'error' | 'fatal';
type LogContext = Record<string, unknown>;

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

function writeStructuredLog(
  severity: Severity,
  code: string,
  error: unknown,
  context: LogContext,
) {
  const normalized = normalizeError(error);
  const record = {
    timestamp: new Date().toISOString(),
    severity,
    code,
    message: normalized.message,
    context,
    stack: normalized.stack,
  };
  if (severity === 'warning') console.warn(JSON.stringify(record));
  else console.error(JSON.stringify(record));
  return normalized;
}

export async function captureAppError(
  severity: Severity,
  code: string,
  error: unknown,
  context: LogContext = {},
  companyId: string | null = null,
): Promise<void> {
  const normalized = writeStructuredLog(severity, code, error, context);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const { error: reportError } = await supabase.rpc('log_app_error', {
    p_severity: severity,
    p_code: code,
    p_message: normalized.message,
    p_context: { ...context, stack: normalized.stack },
    p_company_id: companyId,
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version ?? 'unknown',
  });
  if (reportError) {
    writeStructuredLog('warning', 'telemetry_delivery_failed', reportError, { sourceCode: code });
  }
}

export const logger = {
  warning: (code: string, error: unknown, context?: LogContext, companyId?: string | null) =>
    captureAppError('warning', code, error, context, companyId),
  error: (code: string, error: unknown, context?: LogContext, companyId?: string | null) =>
    captureAppError('error', code, error, context, companyId),
  fatal: (code: string, error: unknown, context?: LogContext, companyId?: string | null) =>
    captureAppError('fatal', code, error, context, companyId),
};
