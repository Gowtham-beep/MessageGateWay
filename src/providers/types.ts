export interface ProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendOutcome {
  status: 'sent' | 'failed' | 'queued';
  providerRef?: string;
  error?: Error;
}
