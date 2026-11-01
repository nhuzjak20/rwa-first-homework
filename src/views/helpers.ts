import type { PassStatus } from '../repositories/pass.repository.js';

const dateTimeFormat = new Intl.DateTimeFormat('hr-HR', {
  timeZone: 'Europe/Zagreb',
  dateStyle: 'long',
  timeStyle: 'short',
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

const STATUS_LABELS: Record<PassStatus, string> = {
  ACTIVE: 'Aktivna',
  CANCELLED: 'Poništena',
};

export function statusLabel(status: PassStatus): string {
  return STATUS_LABELS[status];
}
